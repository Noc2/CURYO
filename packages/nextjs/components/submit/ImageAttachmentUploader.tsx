"use client";

import { useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { useSignMessage } from "wagmi";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { getMaxImageUploadSizeBytes } from "~~/lib/auth/imageUploadChallenge.shared";
import { notification } from "~~/utils/scaffold-eth";

type ImageAttachmentUploaderProps = {
  address?: string;
  disabled?: boolean;
  onUploaded: (imageUrl: string) => void;
};

type ChallengeResponse = {
  challengeId: string;
  message: string;
};

type StatusResponse = {
  error?: string;
  imageUrl?: string | null;
  status?: "uploading" | "processing" | "approved" | "blocked" | "failed" | "deleted";
};

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const POLL_INTERVAL_MS = 1_250;
const POLL_TIMEOUT_MS = 45_000;

function createAttachmentId() {
  return `att_${crypto.randomUUID().replaceAll("-", "")}`;
}

function getFileExtension(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function sha256Hex(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    throw new Error(
      json && typeof json === "object" && "error" in json && json.error ? json.error : "Image upload failed.",
    );
  }
  return json as T;
}

async function pollApprovedImageUrl(attachmentId: string): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const status = await readJson<StatusResponse>(
      await fetch(`/api/attachments/images/${encodeURIComponent(attachmentId)}/status`, {
        cache: "no-store",
      }),
    );

    if (status.status === "approved" && status.imageUrl) {
      return status.imageUrl;
    }
    if (status.status === "blocked") {
      throw new Error("This image was blocked by automated moderation.");
    }
    if (status.status === "failed") {
      throw new Error(status.error ?? "Image processing failed.");
    }
    if (status.status === "deleted") {
      throw new Error("This image is no longer available.");
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Image moderation is still processing. Please try again in a moment.");
}

export function ImageAttachmentUploader({ address, disabled = false, onUploaded }: ImageAttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { signMessageAsync } = useSignMessage();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const maxSizeMb = useMemo(() => Math.floor(getMaxImageUploadSizeBytes() / (1024 * 1024)), []);
  const isDisabled = disabled || isUploading || !address;

  const handleFile = async (file: File) => {
    if (!address) {
      notification.error("Connect your wallet before uploading an image.");
      return;
    }
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      notification.error("Upload a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > getMaxImageUploadSizeBytes()) {
      notification.error(`Upload an image smaller than ${maxSizeMb} MB.`);
      return;
    }

    const attachmentId = createAttachmentId();
    setIsUploading(true);
    setProgress(1);

    try {
      const sha256 = await sha256Hex(file);
      const challengePayload = {
        address,
        attachmentId,
        filename: file.name || `${attachmentId}.${getFileExtension(file)}`,
        mimeType: file.type,
        sha256,
        sizeBytes: file.size,
      };
      const challenge = await readJson<ChallengeResponse>(
        await fetch("/api/attachments/images/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(challengePayload),
        }),
      );
      const signature = await signMessageAsync({ message: challenge.message });
      const clientPayload = JSON.stringify({
        ...challengePayload,
        challengeId: challenge.challengeId,
        signature,
      });
      const blob = await upload(`question-attachments/${attachmentId}/original.${getFileExtension(file)}`, file, {
        access: "private",
        clientPayload,
        contentType: file.type,
        handleUploadUrl: "/api/attachments/images/upload",
        multipart: file.size > 5 * 1024 * 1024,
        onUploadProgress: event => setProgress(Math.max(1, Math.min(99, event.percentage))),
      });

      await fetch(`/api/attachments/images/${encodeURIComponent(attachmentId)}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobPathname: blob.pathname,
          blobUrl: blob.url,
          contentType: blob.contentType,
        }),
      }).catch(() => undefined);

      const imageUrl = await pollApprovedImageUrl(attachmentId);
      onUploaded(imageUrl);
      notification.success("Image uploaded and approved.");
    } catch (error) {
      notification.error(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setIsUploading(false);
      setProgress(0);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={isDisabled}
          onClick={() => inputRef.current?.click()}
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
          {isUploading ? "Uploading" : "Upload image"}
        </button>
        <span className="text-sm text-base-content/60">
          JPG, PNG, or WEBP up to {maxSizeMb} MB. Images are moderated and become public question context.
        </span>
      </div>
      {isUploading ? (
        <progress className="progress progress-primary mt-3 h-2 w-full" value={progress} max={100} />
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={isDisabled}
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}
