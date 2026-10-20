import { useRef, useState } from "react";
import { Camera, FileText, X, Upload, Check, Loader2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";

type ScanMode = "photo" | "document";

// Mobile document scanner: captures photos via the device camera or
// accepts file uploads. In a native .NET MAUI / Flutter shell, this
// delegates to the platform's camera plugin (MAUI: Camera.MAUI;
// Flutter: camera + edge_detection plugins) and the native document
// scanner (Apple VisionKit / Google ML Kit Document Scanner).
//
// Here in the web version, we use getUserMedia for live camera capture
// and file input for uploads. Captured images are uploaded to Supabase
// Storage and the returned path is passed to the parent form.

export function DocumentScanner({
  folder,
  label,
  value,
  onChange,
  hint,
}: {
  folder: string;
  label: string;
  value: string | null;
  onChange: (path: string | null) => void;
  hint?: string;
}) {
  const [mode, setMode] = useState<ScanMode | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(value);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Camera access denied");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capture = async () => {
    setCapturing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      await uploadBlob(blob);
      stopCamera();
      setCapturing(false);
      setMode(null);
    }, "image/jpeg", 0.85);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    await uploadBlob(file);
    setUploading(false);
    setMode(null);
  };

  const uploadBlob = async (blob: Blob) => {
    setUploading(true);
    setError(null);
    try {
      const ext = blob.type === "application/pdf" ? "pdf" : "jpg";
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("erp-uploads").upload(fileName, blob, { contentType: blob.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("erp-uploads").getPublicUrl(fileName);
      setPreview(urlData.publicUrl);
      onChange(fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const clear = () => {
    setPreview(null);
    onChange(null);
  };

  return (
    <div>
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>

      {preview ? (
        <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden bg-slate-50">
          <div className="relative">
            <img src={preview} alt="Scanned document" className="w-full max-h-64 object-contain bg-white" />
            <button
              onClick={clear}
              className="absolute top-2 right-2 rounded-lg bg-white/90 p-1.5 text-slate-600 hover:bg-white shadow-sm"
              aria-label="Remove"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-600">
            <Check size={14} /> Document attached
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Mode selector */}
          {!mode && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setMode("photo"); startCamera(); }}
                className="flex flex-col items-center gap-2 rounded-xl ring-1 ring-slate-200 bg-white py-5 hover:bg-slate-50 transition"
              >
                <Camera size={24} className="text-sky-600" />
                <span className="text-sm font-medium text-slate-700">Take Photo</span>
              </button>
              <button
                onClick={() => { setMode("document"); fileInputRef.current?.click(); }}
                className="flex flex-col items-center gap-2 rounded-xl ring-1 ring-slate-200 bg-white py-5 hover:bg-slate-50 transition"
              >
                <Upload size={24} className="text-sky-600" />
                <span className="text-sm font-medium text-slate-700">Upload File</span>
              </button>
            </div>
          )}

          {/* Camera capture */}
          {mode === "photo" && cameraActive && (
            <div className="rounded-xl overflow-hidden ring-1 ring-slate-200 bg-black">
              <video ref={videoRef} className="w-full aspect-[3/4] object-contain" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex items-center justify-center gap-3 py-3 bg-slate-900">
                <button onClick={capture} disabled={capturing || uploading} className="h-14 w-14 rounded-full bg-white ring-4 ring-sky-500 shadow-lg flex items-center justify-center disabled:opacity-50">
                  {capturing || uploading ? <Loader2 size={20} className="animate-spin text-slate-700" /> : <Camera size={22} className="text-slate-700" />}
                </button>
                <button onClick={() => { stopCamera(); setMode(null); }} className="text-slate-300 hover:text-white px-3 py-2 text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFileSelect} className="hidden" />

          {uploading && (
            <div className="flex items-center gap-2 text-sm text-sky-600">
              <Loader2 size={14} className="animate-spin" /> Uploading…
            </div>
          )}
          {error && <p className="text-xs text-rose-600">{error}</p>}
          {hint && <p className="text-xs text-slate-400">{hint}</p>}
        </div>
      )}
    </div>
  );
}
