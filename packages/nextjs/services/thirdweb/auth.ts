type ThirdwebAuthOption = "google" | "apple" | "email" | "passkey" | "wallet";

const THIRDWEB_AUTH_OPTIONS: ThirdwebAuthOption[] = ["google", "apple", "email", "passkey", "wallet"];
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function getCurrentLocation() {
  if (typeof window === "undefined") {
    return null;
  }

  return {
    hostname: window.location.hostname,
    href: window.location.href,
  };
}

export function getThirdwebAuthMode(hostname?: string): "popup" | "redirect" {
  return hostname && LOCALHOST_HOSTNAMES.has(hostname) ? "redirect" : "popup";
}

export function getThirdwebWalletAuthConfig(args?: {
  currentUrl?: string;
  hostname?: string;
  includeWalletOption?: boolean;
}) {
  const location = getCurrentLocation();
  const hostname = args?.hostname ?? location?.hostname;
  const currentUrl = args?.currentUrl ?? location?.href;
  const mode = getThirdwebAuthMode(hostname);
  const options: ThirdwebAuthOption[] =
    args?.includeWalletOption === false
      ? THIRDWEB_AUTH_OPTIONS.filter(option => option !== "wallet")
      : [...THIRDWEB_AUTH_OPTIONS];

  if (mode === "redirect" && currentUrl) {
    return {
      options,
      mode,
      redirectUrl: currentUrl,
    };
  }

  return {
    options,
    mode,
  };
}
