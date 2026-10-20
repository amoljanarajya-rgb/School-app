import { useRef, useState } from "react";
import { Upload, X, ImageIcon, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { uploadFile, publicUrl } from "@/lib/storage";

type Props = {
  folder: string;
  value?: string | null;
  onChange: (path: string | null) => void;
  label: string;
  hint?: string;
  accept?: string;
  variant?: "photo" | "file";
};

export function FileUpload({
  folder,
  value,
  onChange,
  label,
  hint,
  accept = "image/*",
  variant = "photo",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    const result = await uploadFile(file, folder);
    setUploading(false);
    if ("error" in result) {
      setError(result.error);
    } else {
      onChange(result.path);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const remove = () => {
    onChange(null);
    setError(null);
  };

  const url = value ? publicUrl(value) : "";

  if (variant === "photo" && value) {
    return (
      <div>
        <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
        <div className="relative inline-block">
          <img
            src={url}
            alt="Preview"
            className="h-24 w-24 rounded-xl object-cover ring-1 ring-slate-200"
          />
          <button
            onClick={remove}
            className="absolute -top-2 -right-2 rounded-full bg-rose-500 text-white p-1 shadow hover:bg-rose-600"
            aria-label="Remove"
          >
            <X size={14} />
          </button>
        </div>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
    );
  }

  return (
    <div>
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {value && variant === "file" ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <FileText size={18} className="text-sky-600" />
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-sky-700 hover:underline truncate flex-1"
          >
            {value.split("/").pop()}
          </a>
          <button onClick={remove} className="text-slate-400 hover:text-rose-600" aria-label="Remove">
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "cursor-pointer rounded-lg border-2 border-dashed border-slate-300 px-4 py-5 text-center transition hover:border-sky-400 hover:bg-sky-50/50",
            variant === "photo" && "flex flex-col items-center",
          )}
        >
          {uploading ? (
            <Loader2 size={20} className="mx-auto animate-spin text-sky-500" />
          ) : variant === "photo" ? (
            <>
              <ImageIcon size={22} className="text-slate-400" />
              <p className="mt-1 text-xs text-slate-500">Click or drop photo</p>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Upload size={16} /> Click or drop file to upload
            </div>
          )}
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
