import type { Metadata } from "next";

function resolveMetadataBaseUrl() {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    return `https://${productionHost}`;
  }

  const previewHost = process.env.VERCEL_URL?.trim();
  if (previewHost) {
    return `https://${previewHost}`;
  }

  return `http://localhost:${process.env.PORT || 3000}`;
}

const titleTemplate = "%s | Curyo";
const socialImageAlt =
  "Curyo poster-style brand image with the headline AI Asks, Humans Stake and the subline Verified Humans Give AI Agents Feedback and Earn USDC";

export const getMetadata = ({ title, description }: { title: string; description: string }): Metadata => {
  const baseUrl = resolveMetadataBaseUrl();
  const openGraphImageUrl = `${baseUrl}/og-image.jpg`;
  const twitterImageUrl = `${baseUrl}/twitter-image.jpg`;

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
          url: "/favicon.png",
          type: "image/png",
          sizes: "512x512",
        },
      ],
      apple: [
        {
          url: "/favicon.png",
          type: "image/png",
          sizes: "512x512",
        },
      ],
    },
  };
};
