"use client";

import { getReputationAvatarUrl } from "~~/utils/profileImage";

type BlockieAvatarProps = {
  address: string;
  ensImage?: string | null;
  size: number;
};

export const BlockieAvatar = ({ address, ensImage, size }: BlockieAvatarProps) => {
  const fallbackAvatar = getReputationAvatarUrl(address, size);

  return (
    <img
      className="rounded-full"
      src={ensImage || fallbackAvatar || ""}
      width={size}
      height={size}
      alt={`${address} avatar`}
    />
  );
};
