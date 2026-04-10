import { useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "~~/utils/copyToClipboard";

export const useCopyToClipboard = (options?: { successDurationMs?: number }) => {
  const [isCopiedToClipboard, setIsCopiedToClipboard] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const copyToClipboard = async (text: string) => {
    const copied = await copyTextToClipboard(text);
    if (!copied) {
      console.error("Failed to copy text.");
      return false;
    }

    setIsCopiedToClipboard(true);
    if (resetTimeoutRef.current !== null) {
      clearTimeout(resetTimeoutRef.current);
    }

    resetTimeoutRef.current = setTimeout(() => {
      setIsCopiedToClipboard(false);
      resetTimeoutRef.current = null;
    }, options?.successDurationMs ?? 800);

    return true;
  };

  return { copyToClipboard, isCopiedToClipboard };
};
