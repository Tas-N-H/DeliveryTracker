import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, Loader2, CheckCircle, AlertCircle, X, ZoomIn } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Tesseract from "tesseract.js";

interface ReceiptScannerProps {
  onOrderCreated: () => void;
  apiPath?: string;
}

interface ExtractedOrderData {
  orderNumber: string;
  address: string;
  platform: string;
}

// ── Device detection ──────────────────────────────────────────────────────────

const isTouchDevice = () =>
  typeof navigator !== "undefined" &&
  (navigator.maxTouchPoints > 0 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));

const hasGetUserMedia = () =>
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia;

// ── Component ─────────────────────────────────────────────────────────────────

export function ReceiptScanner({ onOrderCreated, apiPath = "/api/orders" }: ReceiptScannerProps) {
  const [isOpen, setIsOpen]               = useState(false);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedOrderData | null>(null);
  const [ocrText, setOcrText]             = useState("");

  // Webcam state (desktop)
  const [webcamActive, setWebcamActive]   = useState(false);
  const [webcamError, setWebcamError]     = useState<string | null>(null);
  const [capturing, setCapturing]         = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);  // gallery / file upload
  const cameraInputRef = useRef<HTMLInputElement>(null);  // mobile camera (capture attr)
  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const streamRef      = useRef<MediaStream | null>(null);

  const { toast } = useToast();
  const geocodePath = apiPath.replace(/\/orders$/, "/geocode");

  // Stop webcam stream whenever we close or leave webcam mode
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setWebcamActive(false);
    setWebcamError(null);
  }, []);

  // Stop stream when dialog closes
  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setExtractedData(null);
      setOcrText("");
    }
  }, [isOpen, stopStream]);

  // ── Webcam helpers ───────────────────────────────────────────────────────────

  const startWebcam = async () => {
    setWebcamError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setWebcamActive(true);
      // Attach stream to video element after it mounts
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch (err: any) {
      const msg =
        err?.name === "NotAllowedError"  ? "Camera access was denied. Please allow camera permission in your browser." :
        err?.name === "NotFoundError"    ? "No camera found on this device." :
        err?.name === "NotReadableError" ? "Camera is already in use by another app." :
        "Could not start camera.";
      setWebcamError(msg);
      setWebcamActive(false);
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setCapturing(false); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) { setCapturing(false); return; }
      const file = new File([blob], `webcam-${Date.now()}.jpg`, { type: "image/jpeg" });
      stopStream();
      processImage(file);
      setCapturing(false);
    }, "image/jpeg", 0.92);
  };

  // ── OCR pipeline ─────────────────────────────────────────────────────────────

  const extractOrderInfo = (text: string): ExtractedOrderData | null => {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    let orderNumber = "", address = "", platform = "";

    const textLower = text.toLowerCase();
    if (textLower.includes("uber eats") || textLower.includes("ubereats")) platform = "uber-eats";
    else if (textLower.includes("just eat") || textLower.includes("justeat")) platform = "just-eat";
    else if (textLower.includes("website") || textLower.includes("online order")) platform = "website";
    else platform = "phone";

    for (const line of lines) {
      const m = line.match(/(?:order|ref|reference|#)\s*:?\s*([a-z0-9-]+)/i);
      if (m) { orderNumber = m[1]; break; }
    }

    const ukPostcodeRegex = /([A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][A-Z]{2})/i;
    let addressLines: string[] = [];
    let foundPostcode = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes("deliver") || line.toLowerCase().includes("address")) {
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const al = lines[j];
          if (al.toLowerCase().includes("phone") || al.toLowerCase().includes("email") ||
              al.toLowerCase().includes("total") || al.includes("£")) continue;
          addressLines.push(al);
          if (ukPostcodeRegex.test(al)) { foundPostcode = true; break; }
        }
        if (foundPostcode) break;
      }
      if (ukPostcodeRegex.test(line) && !foundPostcode) {
        for (let k = Math.max(0, i - 3); k <= i; k++) {
          if (!addressLines.includes(lines[k])) addressLines.push(lines[k]);
        }
        foundPostcode = true;
        break;
      }
    }

    address = addressLines.join(", ");
    if (!orderNumber) orderNumber = `SCAN-${Date.now().toString().slice(-6)}`;
    return orderNumber && address ? { orderNumber, address, platform } : null;
  };

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setOcrText("");
    setExtractedData(null);
    try {
      const result = await Tesseract.recognize(file, "eng");
      const text = result.data.text;
      setOcrText(text);
      const extracted = extractOrderInfo(text);
      if (extracted) {
        setExtractedData(extracted);
        toast({ title: "Receipt Processed", description: "Review and confirm the details below." });
      } else {
        toast({ title: "Extraction Limited", description: "Could not extract all details — please fill them in.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Processing Failed", description: "Failed to read the receipt image.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    // Reset so selecting the same file again still fires onChange
    e.target.value = "";
  };

  // ── Create order ─────────────────────────────────────────────────────────────

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => apiRequest("POST", apiPath, orderData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      onOrderCreated();
      setIsOpen(false);
      toast({ title: "Order Created", description: "Order added from receipt scan." });
    },
    onError: () => toast({ title: "Error", description: "Failed to create order.", variant: "destructive" }),
  });

  const handleCreateOrder = async () => {
    if (!extractedData) return;
    try {
      const geoRes = await apiRequest("POST", geocodePath, { address: extractedData.address });
      const coords = await geoRes.json();
      createOrderMutation.mutate({
        orderNumber: extractedData.orderNumber,
        address:     extractedData.address,
        platform:    extractedData.platform,
        status:      "cooking",
        latitude:    coords.latitude,
        longitude:   coords.longitude,
      });
    } catch {
      toast({ title: "Geocoding Failed", description: "Could not locate the address.", variant: "destructive" });
    }
  };

  const updateField = (field: keyof ExtractedOrderData, value: string) => {
    if (extractedData) setExtractedData({ ...extractedData, [field]: value });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const mobile        = isTouchDevice();
  const desktopWebcam = !mobile && hasGetUserMedia();

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) stopStream(); setIsOpen(open); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Camera className="w-4 h-4 mr-2" />
          Scan Receipt
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scan Receipt</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* ── Capture options ── */}
          {!webcamActive && !isProcessing && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Capture method</Label>
              <div className="grid grid-cols-2 gap-2">

                {/* Take Photo — mobile uses native camera, desktop opens webcam */}
                <Button
                  variant="outline"
                  className="flex flex-col gap-1.5 h-16 text-xs"
                  onClick={() => {
                    if (mobile) {
                      cameraInputRef.current?.click();
                    } else if (desktopWebcam) {
                      startWebcam();
                    }
                  }}
                >
                  <Camera className="w-5 h-5 text-blue-500" />
                  {mobile ? "Take Photo" : "Use Webcam"}
                </Button>

                {/* Upload / gallery */}
                <Button
                  variant="outline"
                  className="flex flex-col gap-1.5 h-16 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-5 h-5 text-gray-500" />
                  {mobile ? "Choose Gallery" : "Upload File"}
                </Button>
              </div>

              {/* Mobile: extra "Upload File" row if we want all three options clearly */}
              {/* (gallery and upload are same on mobile — both use file input without capture) */}

              {/* Webcam not available on this desktop */}
              {!mobile && !desktopWebcam && (
                <p className="text-xs text-gray-400 italic mt-1">
                  Webcam not available — upload a photo instead.
                </p>
              )}
            </div>
          )}

          {/* Hidden file inputs */}
          {/* Mobile: camera capture */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
          {/* Gallery / file upload (all devices) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          {/* Hidden canvas for webcam frame capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* ── Desktop webcam preview ── */}
          {webcamActive && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Cancel */}
                <button
                  onClick={stopStream}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {webcamError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {webcamError}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 h-9 text-sm" onClick={stopStream}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 h-9 text-sm bg-blue-600 hover:bg-blue-700"
                  onClick={captureFrame}
                  disabled={capturing}
                >
                  {capturing
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><ZoomIn className="w-4 h-4 mr-1.5" />Capture</>
                  }
                </Button>
              </div>
            </div>
          )}

          {/* Webcam error (shown outside preview too, if camera never opened) */}
          {webcamError && !webcamActive && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {webcamError}
            </div>
          )}

          {/* ── Processing indicator ── */}
          {isProcessing && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-sm text-blue-800">Reading receipt…</span>
            </div>
          )}

          {/* ── Extracted data form ── */}
          {extractedData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-800">Order info extracted — review and confirm</span>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="orderNumber">Order Number</Label>
                  <Input
                    id="orderNumber"
                    value={extractedData.orderNumber}
                    onChange={e => updateField("orderNumber", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="address">Delivery Address</Label>
                  <Textarea
                    id="address"
                    value={extractedData.address}
                    onChange={e => updateField("address", e.target.value)}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="platform">Platform</Label>
                  <Select value={extractedData.platform} onValueChange={v => updateField("platform", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uber-eats">Uber Eats</SelectItem>
                      <SelectItem value="just-eat">Just Eat</SelectItem>
                      <SelectItem value="direct">Direct</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleCreateOrder} className="w-full" disabled={createOrderMutation.isPending}>
                {createOrderMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating Order…</>
                  : "Create Order"
                }
              </Button>
            </div>
          )}

          {/* ── OCR text fallback (no data extracted) ── */}
          {ocrText && !extractedData && !isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">Manual review required</span>
              </div>
              <Label>Extracted Text</Label>
              <Textarea value={ocrText} readOnly rows={6} className="text-xs font-mono" />
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
