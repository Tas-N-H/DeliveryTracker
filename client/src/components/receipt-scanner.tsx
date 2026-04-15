import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { geocodeAddress } from "@/lib/geocoding";
import Tesseract from 'tesseract.js';

interface ReceiptScannerProps {
  onOrderCreated: () => void;
  apiPath?: string;
}

interface ExtractedOrderData {
  orderNumber: string;
  address: string;
  platform: string;
}

export function ReceiptScanner({ onOrderCreated, apiPath = "/api/orders" }: ReceiptScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedOrderData | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const geocodePath = apiPath.replace(/\/orders$/, "/geocode");

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const response = await apiRequest("POST", apiPath, orderData);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      onOrderCreated();
      setIsOpen(false);
      setExtractedData(null);
      setOcrText("");
      setSelectedFile(null);
      toast({
        title: "Order Created",
        description: "Order has been successfully created from receipt scan.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create order. Please check the details and try again.",
        variant: "destructive",
      });
      console.error("Error creating order:", error);
    },
  });

  const extractOrderInfo = (text: string): ExtractedOrderData | null => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let orderNumber = "";
    let address = "";
    let platform = "";

    // Detect platform
    const textLower = text.toLowerCase();
    if (textLower.includes('uber eats') || textLower.includes('ubereats')) {
      platform = "uber-eats";
    } else if (textLower.includes('just eat') || textLower.includes('justeat')) {
      platform = "just-eat";
    } else if (textLower.includes('website') || textLower.includes('online order')) {
      platform = "website";
    } else {
      platform = "phone"; // Default fallback
    }

    // Extract order number
    for (const line of lines) {
      const orderMatch = line.match(/(?:order|ref|reference|#)\s*:?\s*([a-z0-9-]+)/i);
      if (orderMatch) {
        orderNumber = orderMatch[1];
        break;
      }
    }

    // Extract UK address with postcode
    const ukPostcodeRegex = /([A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][A-Z]{2})/i;
    let addressLines: string[] = [];
    let foundPostcode = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for delivery address section
      if (line.toLowerCase().includes('deliver') || line.toLowerCase().includes('address')) {
        // Start collecting address from next line
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const addressLine = lines[j];
          
          // Skip common non-address lines
          if (addressLine.toLowerCase().includes('phone') || 
              addressLine.toLowerCase().includes('email') ||
              addressLine.toLowerCase().includes('total') ||
              addressLine.toLowerCase().includes('£')) {
            continue;
          }
          
          addressLines.push(addressLine);
          
          // Check if this line contains a UK postcode
          if (ukPostcodeRegex.test(addressLine)) {
            foundPostcode = true;
            break;
          }
        }
        
        if (foundPostcode) break;
      }
      
      // Also check current line for postcode
      if (ukPostcodeRegex.test(line) && !foundPostcode) {
        // Look backwards for address components
        for (let k = Math.max(0, i - 3); k <= i; k++) {
          if (!addressLines.includes(lines[k])) {
            addressLines.push(lines[k]);
          }
        }
        foundPostcode = true;
        break;
      }
    }

    address = addressLines.join(', ');

    // Fallback: if no specific order number found, generate one
    if (!orderNumber) {
      orderNumber = `SCAN-${Date.now().toString().slice(-6)}`;
    }

    return orderNumber && address ? { orderNumber, address, platform } : null;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      processImage(file);
    }
  };

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setOcrText("");
    setExtractedData(null);

    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            // Optional: could show progress here
          }
        }
      });

      const text = result.data.text;
      setOcrText(text);

      const extracted = extractOrderInfo(text);
      if (extracted) {
        setExtractedData(extracted);
        toast({
          title: "Receipt Processed",
          description: "Order information extracted successfully. Please review and confirm.",
        });
      } else {
        toast({
          title: "Extraction Limited",
          description: "Could not extract all order details. Please fill in the missing information.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("OCR Error:", error);
      toast({
        title: "Processing Failed",
        description: "Failed to process the receipt image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!extractedData) return;

    try {
      const geocodeRes = await apiRequest("POST", geocodePath, { address: extractedData.address });
      const geocode = await geocodeRes.json();
      
      const orderData = {
        orderNumber: extractedData.orderNumber,
        address: extractedData.address,
        platform: extractedData.platform,
        status: "cooking",
        latitude: geocode.latitude,
        longitude: geocode.longitude,
      };

      createOrderMutation.mutate(orderData);
    } catch (error) {
      toast({
        title: "Geocoding Failed",
        description: "Could not find coordinates for the address. Please check the address.",
        variant: "destructive",
      });
    }
  };

  const updateExtractedData = (field: keyof ExtractedOrderData, value: string) => {
    if (extractedData) {
      setExtractedData({ ...extractedData, [field]: value });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Upload Receipt Image</Label>
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Processing Status */}
          {isProcessing && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Processing receipt...</span>
            </div>
          )}

          {/* Extracted Data Form */}
          {extractedData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-800">Order information extracted</span>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="orderNumber">Order Number</Label>
                  <Input
                    id="orderNumber"
                    value={extractedData.orderNumber}
                    onChange={(e) => updateExtractedData("orderNumber", e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="address">Delivery Address</Label>
                  <Textarea
                    id="address"
                    value={extractedData.address}
                    onChange={(e) => updateExtractedData("address", e.target.value)}
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="platform">Platform</Label>
                  <Select value={extractedData.platform} onValueChange={(value) => updateExtractedData("platform", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uber-eats">Uber Eats</SelectItem>
                      <SelectItem value="just-eat">Just Eat</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                onClick={handleCreateOrder} 
                className="w-full"
                disabled={createOrderMutation.isPending}
              >
                {createOrderMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Order...
                  </>
                ) : (
                  "Create Order"
                )}
              </Button>
            </div>
          )}

          {/* OCR Text Debug (optional) */}
          {ocrText && !extractedData && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-yellow-800">Manual review required</span>
              </div>
              <Label>Extracted Text</Label>
              <Textarea value={ocrText} readOnly rows={6} className="text-xs" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}