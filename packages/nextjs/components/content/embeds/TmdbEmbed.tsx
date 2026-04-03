"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import { getEmbedImageLoadingProps } from "~~/lib/content/embedLoadStrategy";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
import type { PlatformInfo } from "~~/utils/platforms";

interface TmdbEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
  prefetchedMetadata?: ContentMetadataResult;
}

interface TmdbMovie {
  title: string;
  overview?: string;
  posterUrl?: string;
  releaseYear?: string;
}

function getPosterImageSrc(posterUrl: string) {
  try {
    const parsed = new URL(posterUrl);
    if (parsed.protocol === "https:" && parsed.hostname === "image.tmdb.org") {
      return `/api/image-proxy?url=${encodeURIComponent(posterUrl)}`;
    }
  } catch {
    return posterUrl;
  }

  return posterUrl;
}

/** TMDB brand icon */
function TmdbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 12H9.5v-2H11V9H9.5v1.5h-2V9H6v6h1.5v-2H9v2h2zm3 0h-2V9h2v6zm6-4.5h-1.5V12h-2v-1.5H15V9h1.5v1.5h2V9H20v1.5z" />
    </svg>
  );
}

function getPrefetchedTmdbMovie(movieId: string, prefetchedMetadata?: ContentMetadataResult): TmdbMovie {
  return {
    title: prefetchedMetadata?.title ?? `TMDB #${movieId}`,
    overview: prefetchedMetadata?.description,
    posterUrl: prefetchedMetadata?.imageUrl ?? prefetchedMetadata?.thumbnailUrl ?? undefined,
    releaseYear: prefetchedMetadata?.releaseYear,
  };
}

/**
 * TMDB movie embed component.
 * Fetches movie data via server-side proxy to hide API key and cache results.
 * Includes required TMDB attribution.
 */
export function TmdbEmbed({ info, compact, prefetchedMetadata }: TmdbEmbedProps) {
  const [movie, setMovie] = useState<TmdbMovie | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const movieId = info.id || (info.metadata?.movieId as string);
  const posterImageSrc = movie?.posterUrl ? getPosterImageSrc(movie.posterUrl) : undefined;
  const imageLoadingProps = getEmbedImageLoadingProps(compact);

  useEffect(() => {
    setFetchError(false);

    if (!movieId) {
      setMovie(null);
      setLoading(false);
      return;
    }

    if (prefetchedMetadata !== undefined) {
      setMovie(getPrefetchedTmdbMovie(movieId, prefetchedMetadata));
      setLoading(false);
      return;
    }

    setLoading(true);
    setMovie(null);

    let cancelled = false;

    fetch(`/api/thumbnail?url=${encodeURIComponent(info.url)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data?.title) {
          setMovie({
            title: data.title,
            overview: data.description,
            posterUrl: data.imageUrl,
            releaseYear: data.releaseYear,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [movieId, info.url, prefetchedMetadata]);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);
  }, [posterImageSrc]);

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface ${compact ? "p-3" : "p-5"}`}>
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0d253f] to-[#01b4e4] flex items-center justify-center shrink-0">
          <span className="loading loading-spinner loading-sm text-white"></span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Loading from TMDB...</p>
          <p className="text-base text-base-content/50 mt-0.5">Movie ID: {movieId}</p>
        </div>
      </div>
    );
  }

  // Error state or no movie found
  if (!movie) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0d253f] to-[#01b4e4] flex items-center justify-center shrink-0">
          <TmdbIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">{fetchError ? "Failed to load movie" : "Movie not found"}</p>
          <p className="text-base text-base-content/50 mt-0.5">View on TMDB</p>
        </div>
      </SafeExternalLink>
    );
  }

  // No poster available - show link card
  if (!movie.posterUrl || imageError) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0d253f] to-[#01b4e4] flex items-center justify-center shrink-0">
          <TmdbIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">
            {movie.title} {movie.releaseYear && `(${movie.releaseYear})`}
          </p>
          <p className="text-base text-base-content/50 mt-0.5 line-clamp-1">{movie.overview || "View on TMDB"}</p>
        </div>
      </SafeExternalLink>
    );
  }

  // Image card with poster and TMDB attribution
  return (
    <div
      className={`block w-full overflow-hidden rounded-xl bg-base-200 embed-surface relative ${
        compact ? "max-w-[200px] mx-auto" : "h-full max-w-full flex flex-col"
      }`}
    >
      <SafeExternalLink
        href={info.url}
        className={`relative group ${compact ? "block" : "flex min-h-0 flex-1 items-center justify-center bg-black"}`}
      >
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center embed-surface">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        )}
        <img
          src={posterImageSrc}
          alt={movie.title}
          {...imageLoadingProps}
          className={`rounded-t-xl shadow-lg transition-transform group-hover:scale-[1.02] ${
            compact ? "w-full h-auto aspect-[2/3] object-cover" : "h-full w-full object-contain object-center"
          } ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-base font-bold text-center">
            {movie.title} {movie.releaseYear && `(${movie.releaseYear})`}
          </p>
          {movie.overview && (
            <p className="text-white/70 text-base text-center mt-0.5 line-clamp-2">{movie.overview}</p>
          )}
        </div>
      </SafeExternalLink>
      {/* TMDB Attribution - Required by TMDB Terms of Use */}
      <div className="flex items-center justify-center gap-2 rounded-b-xl px-3 py-2 embed-surface">
        <Image src="/tmdb-logo.svg" alt="TMDB" width={60} height={14} className="opacity-70" />
        <span className="text-xs text-base-content/50">Data provided by TMDB</span>
      </div>
    </div>
  );
}
