"use client";

import { AvatarComponent } from "@rainbow-me/rainbowkit";
import { getReputationAvatarUrl } from "~~/utils/profileImage";

// Custom Avatar for RainbowKit
export const BlockieAvatar: AvatarComponent = ({ address, ensImage, size }) => {
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
