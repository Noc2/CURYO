"use client";

import { useEffect, useState } from "react";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
import type { PlatformInfo } from "~~/utils/platforms";

interface WikipediaEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
  prefetchedMetadata?: ContentMetadataResult;
}

interface WikipediaPerson {
  title: string;
  description?: string;
  extract?: string;
  imageUrl?: string;
}

/** Wikipedia "W" icon */
function WikipediaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176l-.564.031c-.485.029-.727.164-.727.407 0 .2.11.566.328 1.093l3.038 7.537s.131-.282.393-.841l1.472-3.199c.285-.628.449-1.059.449-1.289 0-.187-.089-.441-.264-.755L7.32 4.351c-.158-.263-.281-.449-.383-.556-.093-.099-.244-.166-.455-.2l-.655-.09c-.163 0-.248-.06-.248-.18v-.455l.045-.051c.846-.005 4.465 0 4.465 0l.051.045v.434c0 .119-.075.176-.225.176l-.391.019c-.392.016-.588.139-.588.366 0 .205.127.558.38 1.062l1.612 3.421 1.462-2.835c.321-.621.482-1.075.482-1.362 0-.27-.153-.46-.456-.567l-.569-.155c-.163 0-.244-.06-.244-.18v-.455l.044-.051c.735-.005 3.676 0 3.676 0l.051.045v.434c0 .119-.075.176-.225.176l-.327.013c-.563.023-.944.333-1.139.929L11.83 8.682l-.353.733 2.076 4.383c.285.627.449 1.059.449 1.289 0 .045-.003.088-.009.131l.581-1.165c.285-.628.449-1.059.449-1.289 0-.187-.089-.441-.264-.755l-1.104-2.087c-.158-.263-.281-.449-.383-.556-.093-.099-.244-.166-.455-.2l-.655-.09c-.163 0-.248-.06-.248-.18v-.455l.045-.051c.846-.005 4.465 0 4.465 0l.051.045v.434c0 .119-.075.176-.225.176l-.391.019c-.392.016-.588.139-.588.366 0 .205.127.558.38 1.062l1.612 3.421 1.462-2.835c.321-.621.482-1.075.482-1.362 0-.27-.153-.46-.456-.567l-.569-.155c-.163 0-.244-.06-.244-.18v-.455l.044-.051c.735-.005 3.676 0 3.676 0l.051.045v.434c0 .119-.075.176-.225.176l-.327.013c-.563.023-.944.333-1.139.929l-2.835 5.593z" />
    </svg>
  );
}

function getPrefetchedWikipediaPerson(prefetchedMetadata?: ContentMetadataResult): WikipediaPerson | null {
  if (!prefetchedMetadata?.title) return null;

  return {
    title: prefetchedMetadata.title,
    description: prefetchedMetadata.description,
    imageUrl: prefetchedMetadata.imageUrl ?? prefetchedMetadata.thumbnailUrl ?? undefined,
  };
}

/**
 * Wikipedia person/article embed component.
 * Fetches data via server-side proxy to avoid CORS and cache results.
 */
export function WikipediaEmbed({ info, compact, prefetchedMetadata }: WikipediaEmbedProps) {
  const [person, setPerson] = useState<WikipediaPerson | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const title = info.id || (info.metadata?.title as string);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);

    if (!title) {
      setPerson(null);
      setLoading(false);
      return;
    }

    if (prefetchedMetadata !== undefined) {
      setPerson(getPrefetchedWikipediaPerson(prefetchedMetadata));
      setLoading(false);
      return;
    }

    setLoading(true);
    setPerson(null);

    let cancelled = false;

    fetch(`/api/thumbnail?url=${encodeURIComponent(info.url)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data?.title) {
          setPerson({
            title: data.title,
            description: data.description,
            imageUrl: data.imageUrl,
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
  }, [title, info.url, prefetchedMetadata]);

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface ${compact ? "p-3" : "p-5"}`}>
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#636466] to-[#3a3a3c] flex items-center justify-center shrink-0">
          <span className="loading loading-spinner loading-sm text-white"></span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Loading from Wikipedia...</p>
          <p className="text-base text-base-content/50 mt-0.5">{title?.replace(/_/g, " ")}</p>
        </div>
      </div>
    );
  }

  // Error state or not found
  if (!person) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#636466] to-[#3a3a3c] flex items-center justify-center shrink-0">
          <WikipediaIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Article not found</p>
          <p className="text-base text-base-content/50 mt-0.5">View on Wikipedia</p>
        </div>
      </SafeExternalLink>
    );
  }

  // No image available — show link card with bio
  if (!person.imageUrl || imageError) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#636466] to-[#3a3a3c] flex items-center justify-center shrink-0">
          <WikipediaIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">{person.title}</p>
          <p className="text-base text-base-content/50 mt-0.5 line-clamp-1">
            {person.description || person.extract || "View on Wikipedia"}
          </p>
        </div>
      </SafeExternalLink>
    );
  }

  // Image card with photo and attribution
  return (
    <div
      className={`block w-full overflow-hidden rounded-xl bg-base-200 embed-surface relative ${
        compact ? "max-w-[200px] mx-auto" : "h-full max-w-full flex flex-col"
      }`}
    >
      <SafeExternalLink href={info.url} className={`relative group ${compact ? "block" : "flex-1 min-h-0"}`}>
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center embed-surface">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        )}
        <img
          src={person.imageUrl}
          alt={person.title}
          loading="lazy"
          className={`rounded-t-xl shadow-lg transition-transform group-hover:scale-[1.02] ${
            compact ? "w-full h-auto aspect-[3/4] object-cover" : "h-full w-full object-contain object-center"
          } ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-base font-bold text-center">{person.title}</p>
          {person.description && (
            <p className="text-white/70 text-base text-center mt-0.5 line-clamp-1">{person.description}</p>
          )}
        </div>
      </SafeExternalLink>
      {/* Wikipedia Attribution */}
      <div className="flex items-center justify-center gap-2 rounded-b-xl px-3 py-2 embed-surface">
        <WikipediaIcon className="w-4 h-4 text-base-content/50" />
        <span className="text-xs text-base-content/50">Data from Wikipedia</span>
      </div>
    </div>
  );
}
