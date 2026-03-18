import { Hono } from "hono";
import { generateId } from "../lib/auth";
import { uploadFile, getFile, deleteFile } from "../lib/r2";
import { authMiddleware } from "../middleware/auth";
import type { Bindings } from "../index";

const files = new Hono<{ Bindings: Bindings }>();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4", "video/webm",
  "audio/mpeg", "audio/wav",
]);

// Serve file from R2
files.get("/:key", async (c) => {
  const key = c.req.param("key");

  const object = await getFile(c.env.R2, key);

  if (!object) {
    return c.json({ error: "File not found" }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);

  const body = await object.arrayBuffer();
  return new Response(body, { headers });
});

// Upload file
files.post("/upload", authMiddleware, async (c) => {
  const contentType = c.req.header("Content-Type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Request must be multipart/form-data" }, 400);
  }

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || typeof (file as unknown as File).arrayBuffer !== "function") {
    return c.json({ error: "No file provided" }, 400);
  }

  const uploadedFile = file as unknown as File;

  if (uploadedFile.size > MAX_FILE_SIZE) {
    return c.json({ error: `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024} MB` }, 413);
  }

  const mimeType = uploadedFile.type || "application/octet-stream";

  if (!ALLOWED_TYPES.has(mimeType)) {
    return c.json({ error: "File type not allowed" }, 415);
  }

  const ext = uploadedFile.name.split(".").pop() ?? "";
  const key = `${generateId()}.${ext}`;
  const buffer = await uploadedFile.arrayBuffer();

  await uploadFile(c.env.R2, key, buffer, mimeType);

  return c.json(
    {
      key,
      url: `/api/files/${key}`,
      name: uploadedFile.name,
      size: uploadedFile.size,
      contentType: mimeType,
    },
    201
  );
});

// Delete file (authenticated)
files.delete("/:key", authMiddleware, async (c) => {
  const key = c.req.param("key");

  await deleteFile(c.env.R2, key);

  return c.json({ message: "File deleted" });
});

export { files as fileRoutes };
