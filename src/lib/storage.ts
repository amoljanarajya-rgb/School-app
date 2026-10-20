import { supabase } from "@/lib/supabase";

const BUCKET = "erp-uploads";
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export function publicUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function uploadFile(
  file: File,
  folder: string,
): Promise<{ path: string; url: string } | { error: string }> {
  try {
    if (file.size > 5 * 1024 * 1024) {
      return { error: "File must be under 5 MB." };
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) return { error: error.message };
    return { path: fileName, url: publicUrl(fileName) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}
