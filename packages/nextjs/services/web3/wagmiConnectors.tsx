import { inAppWalletConnector } from "@thirdweb-dev/wagmi-adapter";
import {
  getPreferredThirdwebChainId,
  getThirdwebWalletExecutionMode,
  thirdwebClient,
} from "~~/services/thirdweb/client";

/**
 * wagmi connectors for the wagmi context
 */
export const wagmiConnectors = () => {
  // Only create connectors on client-side to avoid SSR issues
  if (typeof window === "undefined") {
    return [];
  }

  const connectors = [];

  if (thirdwebClient) {
    const preferredChainId = getPreferredThirdwebChainId();

    connectors.push(
      inAppWalletConnector({
        auth: {
          options: ["google", "apple", "email", "passkey"],
          mode: "popup",
        },
        client: thirdwebClient,
        executionMode: getThirdwebWalletExecutionMode(preferredChainId),
        metadata: {
          icon: "/favicon.png",
          name: "Curyo Wallet",
        },
      }),
    );
  }

  return connectors;
};
