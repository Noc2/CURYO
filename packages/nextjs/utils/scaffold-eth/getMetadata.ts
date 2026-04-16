import type { Metadata } from "next";

const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : `http://localhost:${process.env.PORT || 3000}`;
const titleTemplate = "%s | Curyo";
const socialImageAlt =
  "Curyo brand banner with the headline Human Reputation at Stake and the subline Get Verified, Rate with Stake, and Earn USDC";

export const getMetadata = ({ title, description }: { title: string; description: string }): Metadata => {
  const openGraphImageUrl = `${baseUrl}/og-image.png`;
  const twitterImageUrl = `${baseUrl}/twitter-image.png`;

  return {
    metadataBase: new URL(baseUrl),
    manifest: "/manifest.json",
    title: {
      default: title,
      template: titleTemplate,
    },
    description: description,
    openGraph: {
      title: {
        default: title,
        template: titleTemplate,
      },
      description: description,
      images: [
        {
          url: openGraphImageUrl,
          width: 1200,
          height: 630,
          alt: socialImageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: {
        default: title,
        template: titleTemplate,
      },
      description: description,
      images: [
        {
          url: twitterImageUrl,
          width: 1200,
          height: 600,
          alt: socialImageAlt,
        },
      ],
    },
    icons: {
      icon: [
        {
          url: "/favicon.svg",
          type: "image/svg+xml",
        },
        {
          url: "/favicon.png",
          type: "image/png",
          sizes: "64x64",
        },
      ],
      apple: [
        {
          url: "/favicon.png",
          type: "image/png",
          sizes: "64x64",
        },
      ],
    },
  };
};
