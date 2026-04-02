import { SelfAppBuilder, getUniversalLink } from "@selfxyz/qrcode";
import type { SelfApp } from "@selfxyz/qrcode";
import { isAddress } from "viem";

export const SELF_VERIFICATION_SCOPE = "curyo-faucet";

type SupportedSelfVerificationChainId = 42220 | 11142220;

type SelfVerificationEndpointType = "celo" | "staging_celo";

type SelfVerificationDisclosures = {
  minimumAge?: number;
  ofac: true;
  excludedCountries: [];
  issuing_state: false;
  name: false;
  passport_number: false;
  nationality: false;
  date_of_birth: false;
  gender: false;
  expiry_date: false;
};

type SelfVerificationAppConfig = {
  appName: "Curyo";
  scope: typeof SELF_VERIFICATION_SCOPE;
  endpoint: string;
  endpointType: SelfVerificationEndpointType;
  deeplinkCallback: string;
  userId: string;
  userIdType: "hex";
  userDefinedData: string;
  devMode: boolean;
  version: 2;
  disclosures: SelfVerificationDisclosures;
};

type BuildSelfVerificationAppParams = {
  address: string;
  contractAddress: string;
  chainId: number;
  deeplinkCallback?: string;
  referrer?: string | null;
};

const SELF_ENDPOINT_TYPES: Record<SupportedSelfVerificationChainId, SelfVerificationEndpointType> = {
  42220: "celo",
  11142220: "staging_celo",
};

const SELF_WEBSOCKET_URLS: Record<SupportedSelfVerificationChainId, string> = {
  42220: "wss://websocket.self.xyz",
  11142220: "wss://websocket.staging.self.xyz",
};

export function isSelfVerificationSupportedChain(
  chainId: number | null | undefined,
): chainId is SupportedSelfVerificationChainId {
  return chainId === 42220 || chainId === 11142220;
}

export function getSelfVerificationWebsocketUrl(chainId: number | null | undefined): string | null {
  if (!isSelfVerificationSupportedChain(chainId)) {
    return null;
  }

  return SELF_WEBSOCKET_URLS[chainId];
}

export function buildSelfVerificationAppConfig({
  address,
  contractAddress,
  chainId,
  deeplinkCallback = "",
  referrer,
}: BuildSelfVerificationAppParams): SelfVerificationAppConfig | null {
  if (!isSelfVerificationSupportedChain(chainId)) {
    return null;
  }

  const userDefinedData = typeof referrer === "string" && isAddress(referrer) ? referrer.toLowerCase() : "";

  return {
    appName: "Curyo",
    scope: SELF_VERIFICATION_SCOPE,
    endpoint: contractAddress.toLowerCase(),
    endpointType: SELF_ENDPOINT_TYPES[chainId],
    deeplinkCallback,
    userId: address,
    userIdType: "hex",
    userDefinedData,
    // Self uses dev mode for mock document flows on staging/testnet.
    devMode: chainId === 11142220,
    version: 2,
    disclosures: {
      ofac: true,
      excludedCountries: [],
      issuing_state: false,
      name: false,
      passport_number: false,
      nationality: false,
      date_of_birth: false,
      gender: false,
      expiry_date: false,
    },
  };
}

export function buildSelfVerificationApp(params: BuildSelfVerificationAppParams): SelfApp | null {
  const appConfig = buildSelfVerificationAppConfig(params);
  return appConfig ? new SelfAppBuilder(appConfig).build() : null;
}

export function getSelfVerificationUniversalLink(selfApp: SelfApp): string {
  return getUniversalLink(selfApp);
}
