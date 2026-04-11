"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const EMBED_IMAGE_FALLBACK_TIMEOUT_MS = 4000;

interface ImageLoadSnapshot {
  complete: boolean;
  naturalWidth: number;
}

function getImageLoadState(image: ImageLoadSnapshot | null): "pending" | "loaded" | "error" {
  if (!image || !image.complete) return "pending";
  return image.naturalWidth > 0 ? "loaded" : "error";
}

export function useEmbedImageLoadState(imageSrc?: string, enabled = true) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const markImageLoaded = useCallback(() => {
    setImageLoaded(true);
    setImageError(false);
  }, []);

  const markImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const handleImageRef = useCallback(
    (node: HTMLImageElement | null) => {
      imageRef.current = node;

      const loadState = getImageLoadState(node);
      if (loadState === "loaded") {
        markImageLoaded();
        return;
      }

      if (loadState === "error") {
        markImageError();
      }
    },
    [markImageError, markImageLoaded],
  );

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);

    const loadState = getImageLoadState(imageRef.current);
    if (loadState === "loaded") {
      markImageLoaded();
      return;
    }

    if (loadState === "error") {
      markImageError();
    }
  }, [imageSrc, markImageError, markImageLoaded]);

  useEffect(() => {
    if (!enabled || !imageSrc || imageLoaded || imageError) return;

    const timeout = window.setTimeout(() => {
      const loadState = getImageLoadState(imageRef.current);
      if (loadState === "loaded") {
        markImageLoaded();
        return;
      }

      markImageError();
    }, EMBED_IMAGE_FALLBACK_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [enabled, imageError, imageLoaded, imageSrc, markImageError, markImageLoaded]);

  return {
    handleImageError: markImageError,
    handleImageLoad: markImageLoaded,
    handleImageRef,
    imageError,
    imageLoaded,
  };
}
