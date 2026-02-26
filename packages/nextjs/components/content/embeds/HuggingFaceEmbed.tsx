"use client";

import { useEffect, useState } from "react";
import type { PlatformInfo } from "~~/utils/platforms";

interface HuggingFaceEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
}

interface HuggingFaceModel {
  name: string;
  description?: string;
  imageUrl?: string;
}

/** HuggingFace logo icon (simplified hugging face emoji) */
function HuggingFaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 95 88" fill="currentColor">
      <path d="M47.5 0C26.7 0 9.8 13.7 3.5 32.5c5.1-11.7 14.8-21 27-25.2C37 5.3 42.1 4.2 47.5 4.2s10.5 1.1 17 3.1c12.2 4.2 21.9 13.5 27 25.2C85.2 13.7 68.3 0 47.5 0zM30.8 36.6c-3.6 0-6.5 2.9-6.5 6.5 0 3.6 2.9 6.5 6.5 6.5s6.5-2.9 6.5-6.5c0-3.6-2.9-6.5-6.5-6.5zm33.4 0c-3.6 0-6.5 2.9-6.5 6.5 0 3.6 2.9 6.5 6.5 6.5s6.5-2.9 6.5-6.5c0-3.6-2.9-6.5-6.5-6.5zM47.5 70.1c-8.3 0-15.7-4.2-20.1-10.6 4.3 8.5 13.1 14.3 23.1 14.3s15.8-5.8 20.1-14.3c-4.4 6.4-11.8 10.6-23.1 10.6z" />
    </svg>
  );
}

/**
 * HuggingFace model embed component.
 * Fetches model data and org avatar via server-side proxy.
 */
export function HuggingFaceEmbed({ info, compact }: HuggingFaceEmbedProps) {
  const [model, setModel] = useState<HuggingFaceModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const modelId = info.id || (info.metadata?.modelId as string);

  useEffect(() => {
    if (!modelId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const displayName = modelId.includes("/") ? modelId.split("/")[1] : modelId;

    fetch(`/api/thumbnail?url=${encodeURIComponent(info.url)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled) {
          setModel({
            name: data?.title ?? displayName,
            description: data?.description,
            imageUrl: data?.imageUrl ?? data?.thumbnailUrl ?? undefined,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setModel({ name: displayName });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [modelId, info.url]);

  if (loading) {
    return (
      <div className={`flex items-center gap-3 bg-base-200 rounded-xl ${compact ? "p-3" : "p-5"}`}>
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#ff9d00] to-[#ff5a00] flex items-center justify-center shrink-0">
          <span className="loading loading-spinner loading-sm text-white"></span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Loading from Hugging Face...</p>
          <p className="text-base text-base-content/50 mt-0.5">{modelId}</p>
        </div>
      </div>
    );
  }

  if (!model) {
    return (
      <a
        href={info.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#ff9d00] to-[#ff5a00] flex items-center justify-center shrink-0">
          <HuggingFaceIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Model not found</p>
          <p className="text-base text-base-content/50 mt-0.5">View on Hugging Face</p>
        </div>
      </a>
    );
  }

  // No image — show link card with metadata
  if (!model.imageUrl || imageError) {
    return (
      <a
        href={info.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#ff9d00] to-[#ff5a00] flex items-center justify-center shrink-0">
          <HuggingFaceIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">{model.name}</p>
          <p className="text-base text-base-content/50 mt-0.5 line-clamp-1">
            {model.description || "View on Hugging Face"}
          </p>
        </div>
      </a>
    );
  }

  // Image card with org avatar and metadata
  return (
    <div className="block w-full overflow-hidden rounded-xl bg-base-200 relative h-full flex flex-col">
      <a
        href={info.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center relative group"
      >
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-base-200">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        )}
        <div className="flex items-center justify-center p-10 bg-gradient-to-br from-base-200 to-base-300 w-full h-full">
          <img
            src={`/api/image-proxy?url=${encodeURIComponent(model.imageUrl)}`}
            alt={model.name}
            className={`w-40 h-40 lg:w-48 lg:h-48 rounded-2xl shadow-lg transition-transform group-hover:scale-[1.05] ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </div>
      </a>
      {/* HuggingFace Attribution */}
      <div className="flex items-center justify-center gap-2 py-2 px-3 bg-base-300/50 rounded-b-xl">
        <HuggingFaceIcon className="w-4 h-4 text-base-content/50" />
        <span className="text-xs text-base-content/50">Data from Hugging Face</span>
      </div>
    </div>
  );
}
