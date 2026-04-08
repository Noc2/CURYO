"use client";

import React from "react";
import dynamic from "next/dynamic";
import { GenericLinkCard } from "./embeds";
import { ExternalLinkBehaviorProvider } from "~~/components/shared/SafeExternalLink";
import { shouldWaitForPrefetchedMetadata } from "~~/lib/content/embedLoadStrategy";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
import { detectPlatform } from "~~/utils/platforms";

const EmbedSpinner = () => (
  <div className="flex h-full w-full items-center justify-center p-8">
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
const SpotifyEmbed = dynamic(() => import("./embeds/SpotifyEmbed").then(m => m.SpotifyEmbed), {
  loading: EmbedSpinner,
});
const CoinGeckoEmbed = dynamic(() => import("./embeds/CoinGeckoEmbed").then(m => m.CoinGeckoEmbed), {
  loading: EmbedSpinner,
});
const GitHubEmbed = dynamic(() => import("./embeds/GitHubEmbed").then(m => m.GitHubEmbed), {
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
  isActive?: boolean;
  deferClientFetch?: boolean;
  prefetchedMetadata?: ContentMetadataResult;
  interactionMode?: "default" | "vote";
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
export function ContentEmbed({
  url,
  compact = false,
  isActive = true,
  deferClientFetch = false,
  prefetchedMetadata,
  interactionMode = "default",
}: ContentEmbedProps) {
  const platformInfo = detectPlatform(url);
  const disableExternalNavigation = interactionMode === "vote";

  if (shouldWaitForPrefetchedMetadata(platformInfo.type, deferClientFetch, prefetchedMetadata)) {
    return (
      <ExternalLinkBehaviorProvider disableNavigation={disableExternalNavigation}>
        <GenericLinkCard url={url} compact={compact} />
      </ExternalLinkBehaviorProvider>
    );
  }

  let embed: React.ReactNode;
  switch (platformInfo.type) {
    case "youtube":
      embed = <YouTubeEmbed key={url} info={platformInfo} compact={compact} isActive={isActive} />;
      break;
    case "twitch":
      embed = <TwitchEmbed key={url} info={platformInfo} compact={compact} />;
      break;
    case "scryfall":
      embed = <ScryfallEmbed key={url} info={platformInfo} compact={compact} />;
      break;
    case "tmdb":
      embed = <TmdbEmbed key={url} info={platformInfo} compact={compact} prefetchedMetadata={prefetchedMetadata} />;
      break;
    case "wikipedia":
      embed = (
        <WikipediaEmbed key={url} info={platformInfo} compact={compact} prefetchedMetadata={prefetchedMetadata} />
      );
      break;
    case "rawg":
      embed = <RawgEmbed key={url} info={platformInfo} compact={compact} prefetchedMetadata={prefetchedMetadata} />;
      break;
    case "openlibrary":
      embed = (
        <OpenLibraryEmbed key={url} info={platformInfo} compact={compact} prefetchedMetadata={prefetchedMetadata} />
      );
      break;
    case "spotify":
      embed = <SpotifyEmbed key={url} info={platformInfo} compact={compact} />;
      break;
    case "coingecko":
      embed = (
        <CoinGeckoEmbed key={url} info={platformInfo} compact={compact} prefetchedMetadata={prefetchedMetadata} />
      );
      break;
    case "huggingface":
      embed = (
        <HuggingFaceEmbed key={url} info={platformInfo} compact={compact} prefetchedMetadata={prefetchedMetadata} />
      );
      break;
    case "twitter":
      embed = <TwitterEmbed key={url} info={platformInfo} compact={compact} />;
      break;
    case "github":
      embed = <GitHubEmbed key={url} info={platformInfo} compact={compact} prefetchedMetadata={prefetchedMetadata} />;
      break;
    default:
      return (
        <ExternalLinkBehaviorProvider disableNavigation={disableExternalNavigation}>
          <GenericLinkCard url={url} compact={compact} />
        </ExternalLinkBehaviorProvider>
      );
  }

  return (
    <ExternalLinkBehaviorProvider disableNavigation={disableExternalNavigation}>
      <EmbedErrorBoundary key={url} url={url} compact={compact}>
        {embed}
      </EmbedErrorBoundary>
    </ExternalLinkBehaviorProvider>
  );
}
