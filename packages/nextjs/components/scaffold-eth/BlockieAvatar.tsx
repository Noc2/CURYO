"use client";

import { useEffect, useMemo, useState } from "react";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getFallbackReputationAvatarDataUrl, getReputationAvatarUrl } from "~~/utils/profileImage";

type BlockieAvatarProps = {
  address: string;
  ensImage?: string | null;
  size: number;
};

export const BlockieAvatar = ({ address, ensImage, size }: BlockieAvatarProps) => {
  const { targetNetwork } = useTargetNetwork();
  const remoteAvatar = ensImage || getReputationAvatarUrl(address, size, null, targetNetwork.id);
  const fallbackAvatar = useMemo(() => getFallbackReputationAvatarDataUrl(address, size), [address, size]);
  const [hasLoaded, setHasLoaded] = useState(Boolean(ensImage));
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setHasLoaded(Boolean(ensImage));
    setHasFailed(false);
  }, [ensImage, remoteAvatar]);

  if (!remoteAvatar || remoteAvatar === fallbackAvatar || hasFailed) {
    return (
      <img
        className="rounded-full"
        src={fallbackAvatar || remoteAvatar || ""}
        width={size}
        height={size}
        alt={`${address} avatar`}
      />
    );
  }

  return (
    <span
      className="relative block overflow-hidden rounded-full"
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      <img
        className="absolute inset-0 h-full w-full rounded-full"
        src={fallbackAvatar || ""}
        alt=""
        aria-hidden="true"
      />
      <img
        className={`absolute inset-0 h-full w-full rounded-full transition-opacity duration-150 ${
          hasLoaded ? "opacity-100" : "opacity-0"
        }`}
        src={remoteAvatar}
        width={size}
        height={size}
        alt={`${address} avatar`}
        onLoad={() => setHasLoaded(true)}
        onError={() => setHasFailed(true)}
      />
    </span>
  );
};
