"use client";

import { type ButtonHTMLAttributes, type ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useCuryoConnectModal } from "~~/hooks/useCuryoConnectModal";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { HUMAN_SIGN_IN_LABEL, getHumanSignInRoute } from "~~/lib/home/humanSignInRoute";

type HumanSignInButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onClick" | "type"> & {
  children?: ReactNode;
};

export function HumanSignInButton({ children, className, disabled, ...props }: HumanSignInButtonProps) {
  const router = useRouter();
  const { address } = useAccount();
  const { openConnectModal, isConnecting, thirdwebEnabled } = useCuryoConnectModal();
  const { hasVoterId, isResolved: voterIdResolved } = useVoterIdNFT(address);
  const [shouldRouteAfterSignIn, setShouldRouteAfterSignIn] = useState(false);

  const routeSignedInHuman = useCallback(() => {
    if (!address) {
      return false;
    }

    if (!voterIdResolved) {
      setShouldRouteAfterSignIn(true);
      return true;
    }

    setShouldRouteAfterSignIn(false);
    router.push(getHumanSignInRoute(hasVoterId));
    return true;
  }, [address, hasVoterId, router, voterIdResolved]);

  useEffect(() => {
    if (!shouldRouteAfterSignIn) {
      return;
    }

    routeSignedInHuman();
  }, [routeSignedInHuman, shouldRouteAfterSignIn]);

  const handleClick = useCallback(async () => {
    if (routeSignedInHuman()) {
      return;
    }

    setShouldRouteAfterSignIn(true);
    const wallet = await openConnectModal();
    if (!wallet) {
      setShouldRouteAfterSignIn(false);
    }
  }, [openConnectModal, routeSignedInHuman]);

  return (
    <button
      {...props}
      type="button"
      className={className}
      disabled={disabled || (!address && !thirdwebEnabled) || isConnecting || shouldRouteAfterSignIn}
      aria-busy={isConnecting || shouldRouteAfterSignIn || undefined}
      onClick={() => {
        void handleClick();
      }}
    >
      {children ?? HUMAN_SIGN_IN_LABEL}
    </button>
  );
}
