export async function uploadFile(
  bucket: R2Bucket,
  key: string,
  file: ArrayBuffer,
  contentType: string
): Promise<R2Object> {
  return bucket.put(key, file, {
    httpMetadata: { contentType },
  });
}

export function getFileUrl(key: string): string {
  return `/api/files/${encodeURIComponent(key)}`;
}

export async function deleteFile(
  bucket: R2Bucket,
  key: string
): Promise<void> {
  await bucket.delete(key);
}

export async function getFile(
  bucket: R2Bucket,
  key: string
): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}

export async function fileExists(
  bucket: R2Bucket,
  key: string
): Promise<boolean> {
  const obj = await bucket.head(key);
  return obj !== null;
}
