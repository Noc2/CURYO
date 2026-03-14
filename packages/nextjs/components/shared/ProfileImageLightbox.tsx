"use client";

import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface ProfileImageLightboxProps {
  src: string;
  fallbackSrc?: string;
  alt: string;
  width: number;
  height: number;
  triggerLabel?: string;
  modalLabel?: string;
  buttonClassName?: string;
  imageClassName?: string;
  modalImageClassName?: string;
}

export function ProfileImageLightbox({
  src,
  fallbackSrc,
  alt,
  width,
  height,
  triggerLabel = "Open profile image",
  modalLabel = "Profile image",
  buttonClassName = "",
  imageClassName = "",
  modalImageClassName = "",
}: ProfileImageLightboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState(src || fallbackSrc || "");

  useEffect(() => {
    setImageSrc(src || fallbackSrc || "");
  }, [src, fallbackSrc]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleImageError = () => {
    if (fallbackSrc && imageSrc !== fallbackSrc) {
      setImageSrc(fallbackSrc);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-label={triggerLabel}
        className={`cursor-zoom-in transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${buttonClassName}`.trim()}
      >
        <img
          src={imageSrc}
          onError={handleImageError}
          width={width}
          height={height}
          className={imageClassName}
          alt={alt}
        />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={modalLabel}
          onClick={() => setIsOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-base-200/90 text-white transition-colors hover:bg-base-200"
            aria-label="Close profile image"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          <div
            className="flex max-h-full w-full max-w-3xl items-center justify-center"
            onClick={event => event.stopPropagation()}
          >
            <img
              src={imageSrc}
              onError={handleImageError}
              width={width}
              height={height}
              className={`h-auto max-h-[min(80vh,48rem)] w-auto max-w-full object-contain ${modalImageClassName}`.trim()}
              alt={alt}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
