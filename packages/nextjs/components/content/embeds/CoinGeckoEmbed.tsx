"use client";

import { useEffect, useRef, useState } from "react";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import { getCoinGeckoImageCandidates, getImageLoadState } from "~~/lib/content/coinGeckoImage";
import { getEmbedImageLoadingProps } from "~~/lib/content/embedLoadStrategy";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
import type { PlatformInfo } from "~~/utils/platforms";

interface CoinGeckoEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
  isActive?: boolean;
  prefetchedMetadata?: ContentMetadataResult;
}

interface CoinGeckoToken {
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  marketCapRank?: number;
}

const IMAGE_FALLBACK_TIMEOUT_MS = 4000;

/** CoinGecko gecko icon */
function CoinGeckoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 276 276" fill="currentColor">
      <path d="M138 0C61.8 0 0 61.8 0 138s61.8 138 138 138 138-61.8 138-138S214.2 0 138 0zm-7.2 37.2c12 0 23.4 2.4 33.6 6.6-3 1.8-6 3.6-8.4 6-10.2-3-19.2-3.6-27.6-1.2-9 2.4-16.8 8.4-22.8 15-4.2 4.8-7.8 10.2-10.2 15.6-1.2-.6-2.4-.6-3.6-.6-1.8 0-3.6.6-5.4 1.2C100.2 60 116.4 37.2 130.8 37.2zm-45 40.8c4.2 0 7.8 3.6 7.8 7.8s-3.6 7.8-7.8 7.8-7.8-3.6-7.8-7.8 3.6-7.8 7.8-7.8zm79.8 12c4.2 0 7.2 3 7.2 7.2s-3 7.2-7.2 7.2-7.2-3-7.2-7.2 3-7.2 7.2-7.2zm-25.8-6c20.4 0 37.8 12.6 45 30.6-9-10.2-22.2-16.8-37.2-16.8-18 0-33.6 9.6-42 24-1.2-2.4-3-4.8-4.8-6.6 7.8-18.6 21.6-31.2 39-31.2zm39.6 40.2c0 30-24.6 54.6-54.6 54.6S70.2 154.2 70.2 124.2s24.6-54.6 54.6-54.6 54.6 24.6 54.6 54.6zm-108 21.6c-7.2 0-13.2-6-13.2-13.2s6-13.2 13.2-13.2 13.2 6 13.2 13.2-6 13.2-13.2 13.2zm36.6 73.8c-34.8-7.2-63-33-73.8-66 2.4 1.2 5.4 1.8 8.4 1.8 10.2 0 18.6-7.2 20.4-16.8 8.4 18.6 24.6 33 44.4 39.6-7.2 10.2-5.4 26.4 .6 41.4zm15 10.8c-3.6-1.2-6-4.8-6-9 0-5.4 4.2-9.6 9.6-9.6s9.6 4.2 9.6 9.6c0 4.2-2.4 7.8-6 9-1.2.6-2.4.6-3.6.6-.6 0-2.4 0-3.6-.6zm31.2-7.2c-4.2-14.4-2.4-29.4 4.2-39.6 7.8-2.4 15-6 21.6-10.8 3-2.4 6-4.8 8.4-7.8 1.2 5.4 1.8 10.8 1.8 16.8-.6 19.2-9.6 36-24 46.8-3.6-1.8-7.8-3.6-12-5.4z" />
    </svg>
  );
}

function getCoinDisplayName(coinId: string) {
  return coinId.charAt(0).toUpperCase() + coinId.slice(1).replace(/-/g, " ");
}

function getPrefetchedCoinGeckoToken(coinId: string, prefetchedMetadata?: ContentMetadataResult): CoinGeckoToken {
  return {
    name: prefetchedMetadata?.title ?? getCoinDisplayName(coinId),
    symbol: prefetchedMetadata?.symbol ?? coinId.toUpperCase().replace(/-/g, ""),
    imageUrl: prefetchedMetadata?.imageUrl ?? undefined,
    thumbnailUrl: prefetchedMetadata?.thumbnailUrl ?? undefined,
  };
}

/**
 * CoinGecko token embed component.
 * Fetches coin image via server-side proxy to avoid CORS/rate-limit issues.
 */
export function CoinGeckoEmbed({ info, compact, isActive = !compact, prefetchedMetadata }: CoinGeckoEmbedProps) {
  const [token, setToken] = useState<CoinGeckoToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageCandidateIndex, setImageCandidateIndex] = useState(0);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const coinId = info.id || (info.metadata?.coinId as string);
  const imageCandidates = getCoinGeckoImageCandidates(token);
  const activeImageUrl = imageCandidates[imageCandidateIndex];
  const canFallbackImage = imageCandidateIndex < imageCandidates.length - 1;
  const imageSrc = activeImageUrl ? `/api/image-proxy?url=${encodeURIComponent(activeImageUrl)}` : undefined;
  const imageLoadingProps = getEmbedImageLoadingProps(compact, isActive);

  function advanceImageCandidate() {
    if (!canFallbackImage) {
      setImageError(true);
      return;
    }

    setImageCandidateIndex(currentIndex => Math.min(currentIndex + 1, imageCandidates.length - 1));
  }

  function handleImageRef(node: HTMLImageElement | null) {
    imageRef.current = node;

    const loadState = getImageLoadState(node);
    if (loadState === "loaded") {
      setImageLoaded(true);
      setImageError(false);
      return;
    }

    if (loadState === "error") {
      advanceImageCandidate();
    }
  }

  useEffect(() => {
    if (!coinId) {
      setToken(null);
      setLoading(false);
      return;
    }

    if (prefetchedMetadata !== undefined) {
      setToken(getPrefetchedCoinGeckoToken(coinId, prefetchedMetadata));
      setLoading(false);
      return;
    }

    setLoading(true);
    setToken(null);

    let cancelled = false;
    const name = getCoinDisplayName(coinId);
    const symbol = coinId.toUpperCase().replace(/-/g, "");

    // Fetch coin image through the thumbnail proxy (prefer large image)
    fetch(`/api/thumbnail?url=${encodeURIComponent(info.url)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled) {
          setToken({
            name,
            symbol,
            imageUrl: data?.imageUrl ?? undefined,
            thumbnailUrl: data?.thumbnailUrl ?? undefined,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setToken({ name, symbol });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [coinId, info.url, prefetchedMetadata]);

  useEffect(() => {
    imageRef.current = null;
    setImageCandidateIndex(0);
    setImageError(false);
    setImageLoaded(false);
  }, [token?.imageUrl, token?.thumbnailUrl]);

  useEffect(() => {
    if (!imageSrc || imageLoaded) return;

    const timeout = window.setTimeout(() => {
      const loadState = getImageLoadState(imageRef.current);
      if (loadState === "loaded") {
        setImageLoaded(true);
        setImageError(false);
        return;
      }

      if (canFallbackImage) {
        setImageCandidateIndex(currentIndex => Math.min(currentIndex + 1, imageCandidates.length - 1));
        return;
      }

      setImageError(loadState === "error" || loadState === "pending");
    }, IMAGE_FALLBACK_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [canFallbackImage, imageLoaded, imageSrc, imageCandidates.length]);

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface ${compact ? "p-3" : "p-5"}`}>
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8dc63f] to-[#4e8b2f] flex items-center justify-center shrink-0">
          <span className="loading loading-spinner loading-sm text-white"></span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Loading from CoinGecko...</p>
          <p className="text-base text-base-content/50 mt-0.5">{coinId}</p>
        </div>
      </div>
    );
  }

  // Error state or not found
  if (!token) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8dc63f] to-[#4e8b2f] flex items-center justify-center shrink-0">
          <CoinGeckoIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Token not found</p>
          <p className="text-base text-base-content/50 mt-0.5">View on CoinGecko</p>
        </div>
      </SafeExternalLink>
    );
  }

  // No image available — show link card
  if (!activeImageUrl || imageError) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8dc63f] to-[#4e8b2f] flex items-center justify-center shrink-0">
          <CoinGeckoIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">
            {token.name} ({token.symbol})
          </p>
          <p className="text-base text-base-content/50 mt-0.5 line-clamp-1">
            {token.marketCapRank ? `#${token.marketCapRank} by market cap` : "View on CoinGecko"}
          </p>
        </div>
      </SafeExternalLink>
    );
  }

  // Image card with coin logo and metadata
  return (
    <div className="block w-full overflow-hidden rounded-xl bg-base-200 embed-surface relative h-full flex flex-col">
      <SafeExternalLink href={info.url} className="flex-1 flex items-center justify-center relative group">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center embed-surface">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        )}
        <div className="flex h-full w-full items-center justify-center p-8 embed-surface">
          <img
            ref={handleImageRef}
            src={imageSrc}
            alt={token.name}
            width={192}
            height={192}
            {...imageLoadingProps}
            className={`aspect-square h-auto w-[clamp(10rem,48%,18rem)] max-h-[68%] shadow-lg transition-transform group-hover:scale-[1.05] object-contain ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => {
              setImageLoaded(true);
              setImageError(false);
            }}
            onError={advanceImageCandidate}
          />
        </div>
      </SafeExternalLink>
      {/* CoinGecko Attribution */}
      <div className="flex items-center justify-center gap-2 rounded-b-xl px-3 py-2 embed-surface">
        <CoinGeckoIcon className="w-4 h-4 text-base-content/50" />
        <span className="text-xs text-base-content/50">Data from CoinGecko</span>
      </div>
    </div>
  );
}
