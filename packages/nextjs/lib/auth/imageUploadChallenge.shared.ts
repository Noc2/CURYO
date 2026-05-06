const SUPPORTED_IMAGE_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const SUPPORTED_UPLOAD_MIME_TYPE_SET = new Set<string>(SUPPORTED_IMAGE_UPLOAD_MIME_TYPES);

export function isSupportedImageUploadMimeType(value: string) {
  return SUPPORTED_UPLOAD_MIME_TYPE_SET.has(value);
}

export function getMaxImageUploadSizeBytes() {
  return MAX_IMAGE_UPLOAD_SIZE_BYTES;
}
