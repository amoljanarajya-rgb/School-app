import { useEffect, useRef, useState, useCallback } from "react";

// Lightweight QR scanner hook using the native BarcodeDetector API
// where available, with a manual-input fallback for browsers that
// don't support it (Safari, older Edge). In a native .NET MAUI /
// Flutter shell, camera + QR scanning is handled by the platform's
// Camera2 / AVFoundation / Vision.Framework and bridged via the
// preload channel — see the native reference files.

type ScanResult = { text: string; timestamp: string };

export function useQrScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const onScanRef = useRef<((text: string) => void) | null>(null);

  const isSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const scanLoop = useCallback(() => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    detector
      .detect(video)
      .then((codes: DetectedBarcode[]) => {
        if (codes.length > 0) {
          const text = codes[0].rawValue;
          if (text && onScanRef.current) {
            const result = { text, timestamp: new Date().toISOString() };
            setLastScan(result);
            onScanRef.current(text);
          }
        }
      })
      .catch(() => {});
    rafRef.current = requestAnimationFrame(scanLoop);
  }, []);

  const start = useCallback(
    async (onScan: (text: string) => void) => {
      onScanRef.current = onScan;
      setError(null);

      if (!isSupported) {
        setError("Camera QR scanning not supported in this browser. Use manual entry or the native mobile app.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        detectorRef.current = new (window as any).BarcodeDetector({
          formats: ["qr_code", "code_128", "code_39", "ean_13"],
        });
        setScanning(true);
        rafRef.current = requestAnimationFrame(scanLoop);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Camera access denied. Check permissions.");
      }
    },
    [isSupported, scanLoop],
  );

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { videoRef, scanning, error, lastScan, start, stop, isSupported };
}

// Minimal type declarations for the BarcodeDetector API
type DetectedBarcode = {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
};

type BarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: { new (options?: { formats: string[] }): BarcodeDetector };
  }
}
