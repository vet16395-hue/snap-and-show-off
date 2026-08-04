import { supabase } from "@/integrations/supabase/client";

export async function compressImage(file: File, maxSize = 1400, quality = 0.72): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("لا يمكن معالجة الصورة");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("فشل ضغط الصورة");
  return blob;
}

export async function uploadQuestionPhoto(auditId: string, questionId: string, file: File) {
  const blob = await compressImage(file);
  const path = `${auditId}/${questionId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("audit-photos")
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from("photos").insert({
    audit_id: auditId,
    question_id: questionId,
    storage_path: path,
  });
  if (error) throw error;
  return path;
}

export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from("audit-photos").createSignedUrls(paths, 3600);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  data.forEach((entry) => {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
  });
  return map;
}

export async function deletePhoto(id: string, path: string) {
  await supabase.storage.from("audit-photos").remove([path]);
  await supabase.from("photos").delete().eq("id", id);
}
