"use client";

import React from "react";
import dynamic from "next/dynamic";
import { GenericLinkCard } from "./embeds";
import { detectPlatform } from "~~/utils/platforms";

const EmbedSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <span className="loading loading-spinner loading-md text-base-content/30" />
  </div>
);

const YouTubeEmbed = dynamic(() => import("./embeds/YouTubeEmbed").then(m => m.YouTubeEmbed), {
  loading: EmbedSpinner,
});
const TwitchEmbed = dynamic(() => import("./embeds/TwitchEmbed").then(m => m.TwitchEmbed), {
  ssr: false,
  loading: EmbedSpinner,
});
const ScryfallEmbed = dynamic(() => import("./embeds/ScryfallEmbed").then(m => m.ScryfallEmbed), {
  loading: EmbedSpinner,
});
const TmdbEmbed = dynamic(() => import("./embeds/TmdbEmbed").then(m => m.TmdbEmbed), { loading: EmbedSpinner });
const WikipediaEmbed = dynamic(() => import("./embeds/WikipediaEmbed").then(m => m.WikipediaEmbed), {
  loading: EmbedSpinner,
});
const RawgEmbed = dynamic(() => import("./embeds/RawgEmbed").then(m => m.RawgEmbed), { loading: EmbedSpinner });
const OpenLibraryEmbed = dynamic(() => import("./embeds/OpenLibraryEmbed").then(m => m.OpenLibraryEmbed), {
  loading: EmbedSpinner,
});
const CoinGeckoEmbed = dynamic(() => import("./embeds/CoinGeckoEmbed").then(m => m.CoinGeckoEmbed), {
  loading: EmbedSpinner,
});
const HuggingFaceEmbed = dynamic(() => import("./embeds/HuggingFaceEmbed").then(m => m.HuggingFaceEmbed), {
  loading: EmbedSpinner,
});
const TwitterEmbed = dynamic(() => import("./embeds/TwitterEmbed").then(m => m.TwitterEmbed), {
  ssr: false,
  loading: EmbedSpinner,
});

interface ContentEmbedProps {
  url: string;
  compact?: boolean;
}

/** Error boundary that catches render errors in embed components and falls back to a link card. */
class EmbedErrorBoundary extends React.Component<
  { url: string; compact: boolean; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <GenericLinkCard url={this.props.url} compact={this.props.compact} />;
    }
    return this.props.children;
  }
}

/**
 * Renders platform-appropriate embedded content.
 * Embeds are code-split via next/dynamic — only the needed embed is loaded.
 */
export function ContentEmbed({ url, compact = false }: ContentEmbedProps) {
  const platformInfo = detectPlatform(url);

  let embed: React.ReactNode;
  switch (platformInfo.type) {
    case "youtube":
      embed = <YouTubeEmbed info={platformInfo} compact={compact} />;
      break;
    case "twitch":
      embed = <TwitchEmbed info={platformInfo} compact={compact} />;
      break;
    case "scryfall":
      embed = <ScryfallEmbed info={platformInfo} compact={compact} />;
      break;
    case "tmdb":
      embed = <TmdbEmbed info={platformInfo} compact={compact} />;
      break;
    case "wikipedia":
      embed = <WikipediaEmbed info={platformInfo} compact={compact} />;
      break;
    case "rawg":
      embed = <RawgEmbed info={platformInfo} compact={compact} />;
      break;
    case "openlibrary":
      embed = <OpenLibraryEmbed info={platformInfo} compact={compact} />;
      break;
    case "coingecko":
      embed = <CoinGeckoEmbed info={platformInfo} compact={compact} />;
      break;
    case "huggingface":
      embed = <HuggingFaceEmbed info={platformInfo} compact={compact} />;
      break;
    case "twitter":
      embed = <TwitterEmbed info={platformInfo} compact={compact} />;
      break;
    default:
      return <GenericLinkCard url={url} compact={compact} />;
  }

  return (
    <EmbedErrorBoundary url={url} compact={compact}>
      {embed}
    </EmbedErrorBoundary>
  );
}
