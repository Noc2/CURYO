import { inAppWalletConnector } from "@thirdweb-dev/wagmi-adapter";
import { getThirdwebWalletAuthConfig } from "~~/services/thirdweb/auth";
import {
  getPreferredThirdwebChainId,
  getThirdwebWalletExecutionMode,
  thirdwebClient,
} from "~~/services/thirdweb/client";

const CURYO_THIRDWEB_ICON = "/curyo-thirdweb-logo.png";

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
        auth: getThirdwebWalletAuthConfig(),
        client: thirdwebClient,
        executionMode: getThirdwebWalletExecutionMode(preferredChainId),
        metadata: {
          icon: CURYO_THIRDWEB_ICON,
          name: "Curyo Wallet",
        },
      }),
    );
  }

  return connectors;
};
