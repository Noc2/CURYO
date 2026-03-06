"use client";

import { hardhat } from "viem/chains";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

export const LocalBlockExplorerGuard = ({ children }: { children: React.ReactNode }) => {
  const { targetNetwork } = useTargetNetwork();

  if (targetNetwork.id === hardhat.id) {
    return <>{children}</>;
  }

  return (
    <div className="container mx-auto my-10 px-4">
      <div className="max-w-2xl rounded-3xl border border-base-300 bg-base-100 p-8 shadow-lg">
        <h1 className="text-2xl font-semibold">Local Block Explorer Only</h1>
        <p className="mt-3 text-base text-base-content/70">
          The built-in block explorer only works against the local Foundry chain. Your current target network is{" "}
          <span className="font-medium">{targetNetwork.name}</span>.
        </p>
        {targetNetwork.blockExplorers?.default && (
          <p className="mt-4 text-base">
            Use{" "}
            <a
              className="link link-primary"
              href={targetNetwork.blockExplorers.default.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {targetNetwork.blockExplorers.default.name}
            </a>{" "}
            for this network instead.
          </p>
        )}
      </div>
    </div>
  );
};
