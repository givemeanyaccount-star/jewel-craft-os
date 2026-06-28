import { supabase } from "@/integrations/supabase/client";

export async function uploadImage(bucket: string, file: File, pathPrefix = ""): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const fileName = `${pathPrefix}${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: false });
  if (error) throw error;
  return fileName;
}

export async function getSignedUrl(bucket: string, path: string, expires = 3600): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expires);
  return data?.signedUrl ?? null;
}

export async function getSignedUrls(bucket: string, paths: string[], expires = 3600): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const result: Record<string, string> = {};
  await Promise.all(
    paths.map(async (p) => {
      const url = await getSignedUrl(bucket, p, expires);
      if (url) result[p] = url;
    })
  );
  return result;
}
