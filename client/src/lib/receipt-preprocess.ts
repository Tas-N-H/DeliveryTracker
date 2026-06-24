/**
 * Receipt image pre-processing pipeline (pure Canvas 2D — no external libs)
 *
 * Steps applied in order:
 *  1. Scale down to at most MAX_SIDE px (saves OCR memory)
 *  2. Convert to grayscale (luminance formula)
 *  3. Detect receipt bounding-box by scanning rows/cols for "bright paper" coverage
 *  4. Crop to that bounding-box (+ padding)
 *  5. Apply linear contrast stretch + mild sigmoid curve on the cropped region
 *
 * Returns a PNG Blob ready to pass to Tesseract.
 */

const MAX_SIDE        = 2000;   // px — scale down if larger
const PAPER_THRESHOLD = 140;    // grayscale value considered "bright paper"
const COVERAGE_MIN    = 0.12;   // fraction of a row/col that must be bright to count as paper
const CROP_PADDING    = 20;     // extra px added around the detected receipt bounds

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

/** Compute grayscale luminance for every pixel */
function toGray(data: Uint8ClampedArray, W: number, H: number): Uint8Array {
  const gray = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  }
  return gray;
}

/**
 * Scan inward from each edge to find where "paper coverage" starts.
 * A row/column qualifies as paper if ≥ COVERAGE_MIN fraction of its pixels
 * are brighter than PAPER_THRESHOLD.
 * Falls back to the full image if the receipt is undetectable.
 */
function findReceiptBounds(
  gray: Uint8Array,
  W: number,
  H: number,
): { x: number; y: number; w: number; h: number } {
  const brightRow = (y: number) => {
    let bright = 0;
    for (let x = 0; x < W; x++) if (gray[y * W + x] >= PAPER_THRESHOLD) bright++;
    return bright / W >= COVERAGE_MIN;
  };
  const brightCol = (x: number) => {
    let bright = 0;
    for (let y = 0; y < H; y++) if (gray[y * W + x] >= PAPER_THRESHOLD) bright++;
    return bright / H >= COVERAGE_MIN;
  };

  let top = 0, bottom = H - 1, left = 0, right = W - 1;
  while (top    < H && !brightRow(top))    top++;
  while (bottom > 0 && !brightRow(bottom)) bottom--;
  while (left   < W && !brightCol(left))   left++;
  while (right  > 0 && !brightCol(right))  right--;

  // Add padding and clamp to image bounds
  const x = Math.max(0,     left   - CROP_PADDING);
  const y = Math.max(0,     top    - CROP_PADDING);
  const w = Math.min(W, right  + CROP_PADDING) - x;
  const h = Math.min(H, bottom + CROP_PADDING) - y;

  // Reject the crop if it's less than 5% of the original area (corner-case failure)
  if (w * h < W * H * 0.05) return { x: 0, y: 0, w: W, h: H };

  return { x, y, w, h };
}

/**
 * Apply linear histogram stretch followed by a mild sigmoid.
 * Result: paper → bright white, ink → near-black.
 */
function enhanceContrast(data: Uint8ClampedArray, len: number): void {
  // 1. Find min/max luminance in this region
  let minG = 255, maxG = 0;
  for (let i = 0; i < len; i++) {
    const g = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    if (g < minG) minG = g;
    if (g > maxG) maxG = g;
  }
  const range = maxG - minG || 1;

  // Pre-build a LUT for speed (256 possible input values)
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    // Linear stretch: map [minG..maxG] → [0..255]
    const stretched = Math.round(((v - minG) / range) * 255);
    const clamped   = Math.max(0, Math.min(255, stretched));
    // Mild sigmoid to push ink darker and paper whiter
    // sigmoid(x) = 255 / (1 + e^(-k*(x-128)))   k=0.045
    const sig = Math.round(255 / (1 + Math.exp(-0.045 * (clamped - 128))));
    lut[v] = sig;
  }

  // Apply LUT: convert each pixel to grayscale, look up enhanced value
  for (let i = 0; i < len; i++) {
    const g   = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    const out = lut[Math.max(0, Math.min(255, g))];
    data[i * 4]     = out; // R
    data[i * 4 + 1] = out; // G
    data[i * 4 + 2] = out; // B
    // alpha left as-is
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface PreprocessResult {
  blob:      Blob;
  cropApplied: boolean;  // whether the auto-crop changed the image bounds
  previewUrl: string;    // object URL of the processed image for display
}

export async function preprocessReceiptImage(file: File | Blob): Promise<PreprocessResult> {
  // ── Load & scale ──────────────────────────────────────────────────────────
  const img   = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const W     = Math.round(img.width  * scale);
  const H     = Math.round(img.height * scale);

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width  = W;
  srcCanvas.height = H;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.drawImage(img, 0, 0, W, H);

  // ── Grayscale for bounds detection ────────────────────────────────────────
  const srcData = srcCtx.getImageData(0, 0, W, H);
  const gray    = toGray(srcData.data, W, H);

  // ── Detect receipt bounds ─────────────────────────────────────────────────
  const bounds       = findReceiptBounds(gray, W, H);
  const cropApplied  = bounds.x > 0 || bounds.y > 0 || bounds.w < W || bounds.h < H;

  // ── Build output canvas from cropped region ───────────────────────────────
  const outCanvas = document.createElement("canvas");
  outCanvas.width  = bounds.w;
  outCanvas.height = bounds.h;
  const outCtx = outCanvas.getContext("2d")!;
  outCtx.drawImage(srcCanvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);

  // ── Contrast enhancement ──────────────────────────────────────────────────
  const outData = outCtx.getImageData(0, 0, bounds.w, bounds.h);
  enhanceContrast(outData.data, bounds.w * bounds.h);
  outCtx.putImageData(outData, 0, 0);

  // ── Export ────────────────────────────────────────────────────────────────
  const blob: Blob = await new Promise(resolve =>
    outCanvas.toBlob(b => resolve(b!), "image/png")
  );

  return { blob, cropApplied, previewUrl: URL.createObjectURL(blob) };
}
