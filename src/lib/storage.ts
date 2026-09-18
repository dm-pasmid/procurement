import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Private Supabase Storage bucket for procurement/GRN/bill attachments. */
const BUCKET = "attachments";

async function ensureBucket() {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) {
    await admin.storage.createBucket(BUCKET, { public: false });
  }
  return admin;
}

/**
 * Uploads a file and returns its storage path (stored in Attachment.fileUrl).
 * Viewing goes through signed URLs — the bucket stays private.
 */
export async function uploadAttachmentFile(
  entityType: string,
  entityId: string,
  file: File,
): Promise<string> {
  const admin = await ensureBucket();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${entityType}/${entityId}/${Date.now()}-${safeName}`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** Signed URL valid for one hour. */
export async function signedAttachmentUrl(path: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data) throw new Error(`Could not sign URL: ${error?.message}`);
  return data.signedUrl;
}
