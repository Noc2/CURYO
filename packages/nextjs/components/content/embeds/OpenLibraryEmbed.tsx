"use client";

import { useEffect, useState } from "react";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
import type { PlatformInfo } from "~~/utils/platforms";

interface OpenLibraryEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
  prefetchedMetadata?: ContentMetadataResult;
}

interface OpenLibraryBook {
  title: string;
  description?: string;
  coverUrl?: string;
  authors?: string[];
}

/** Book icon */
function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
    </svg>
  );
}

function getPrefetchedOpenLibraryBook(prefetchedMetadata?: ContentMetadataResult): OpenLibraryBook | null {
  if (!prefetchedMetadata?.title) return null;

  return {
    title: prefetchedMetadata.title,
    description: prefetchedMetadata.description,
    coverUrl: prefetchedMetadata.imageUrl ?? prefetchedMetadata.thumbnailUrl ?? undefined,
    authors: prefetchedMetadata.authors,
  };
}

/**
 * Open Library book embed component.
 * Fetches book data via server-side proxy (resolves authors server-side, cached 24h).
 */
export function OpenLibraryEmbed({ info, compact, prefetchedMetadata }: OpenLibraryEmbedProps) {
  const [book, setBook] = useState<OpenLibraryBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const olId = info.id || (info.metadata?.olId as string);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);

    if (!olId) {
      setBook(null);
      setLoading(false);
      return;
    }

    if (prefetchedMetadata !== undefined) {
      setBook(getPrefetchedOpenLibraryBook(prefetchedMetadata));
      setLoading(false);
      return;
    }

    setLoading(true);
    setBook(null);

    let cancelled = false;

    fetch(`/api/thumbnail?url=${encodeURIComponent(info.url)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data?.title) {
          setBook({
            title: data.title,
            description: data.description,
            coverUrl: data.imageUrl,
            authors: data.authors,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [olId, info.url, prefetchedMetadata]);

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center gap-3 bg-base-200 rounded-xl ${compact ? "p-3" : "p-5"}`}>
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3d3929] to-[#5c553e] flex items-center justify-center shrink-0">
          <span className="loading loading-spinner loading-sm text-white"></span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Loading from Open Library...</p>
          <p className="text-base text-base-content/50 mt-0.5">{olId}</p>
        </div>
      </div>
    );
  }

  // Error state or not found
  if (!book) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3d3929] to-[#5c553e] flex items-center justify-center shrink-0">
          <BookIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Book not found</p>
          <p className="text-base text-base-content/50 mt-0.5">View on Open Library</p>
        </div>
      </SafeExternalLink>
    );
  }

  const subtitle = book.authors ? `by ${book.authors.join(", ")}` : undefined;

  // No cover available — show link card
  if (!book.coverUrl || imageError) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3d3929] to-[#5c553e] flex items-center justify-center shrink-0">
          <BookIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">{book.title}</p>
          <p className="text-base text-base-content/50 mt-0.5 line-clamp-1">
            {subtitle || book.description || "View on Open Library"}
          </p>
        </div>
      </SafeExternalLink>
    );
  }

  // Cover card with image and attribution
  return (
    <div
      className={`block w-full overflow-hidden rounded-xl bg-base-200 relative ${
        compact ? "max-w-[200px] mx-auto" : "h-full max-w-full flex flex-col"
      }`}
    >
      <SafeExternalLink href={info.url} className={`relative group ${compact ? "block" : "flex-1 min-h-0"}`}>
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-base-200">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        )}
        <img
          src={book.coverUrl}
          alt={book.title}
          loading="lazy"
          className={`rounded-t-xl shadow-lg transition-transform group-hover:scale-[1.02] ${
            compact ? "w-full h-auto aspect-[2/3] object-cover" : "h-full w-full object-contain object-center"
          } ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-base font-bold text-center">{book.title}</p>
          {subtitle && <p className="text-white/70 text-base text-center mt-0.5 line-clamp-1">{subtitle}</p>}
        </div>
      </SafeExternalLink>
      {/* Open Library Attribution */}
      <div className="flex items-center justify-center gap-2 py-2 px-3 bg-base-300/50 rounded-b-xl">
        <BookIcon className="w-4 h-4 text-base-content/50" />
        <span className="text-xs text-base-content/50">Data from Open Library</span>
      </div>
    </div>
  );
}
