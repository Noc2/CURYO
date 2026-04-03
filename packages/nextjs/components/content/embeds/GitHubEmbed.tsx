"use client";

import { useEffect, useState } from "react";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import { getEmbedImageLoadingProps } from "~~/lib/content/embedLoadStrategy";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
import type { PlatformInfo } from "~~/utils/platforms";

interface GitHubEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
  prefetchedMetadata?: ContentMetadataResult;
}

interface GitHubRepo {
  name: string;
  description?: string;
  imageUrl?: string;
  stars?: number;
  forks?: number;
  language?: string;
}

/** GitHub Octomark icon */
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 98 96" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
    </svg>
  );
}

/** Star icon */
function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
    </svg>
  );
}

/** Fork icon */
function ForkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
    </svg>
  );
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function getPrefetchedGitHubRepo(repoSlug: string, prefetchedMetadata?: ContentMetadataResult): GitHubRepo {
  return {
    name: prefetchedMetadata?.title ?? repoSlug,
    description: prefetchedMetadata?.description,
    imageUrl: prefetchedMetadata?.imageUrl ?? prefetchedMetadata?.thumbnailUrl ?? undefined,
    stars: prefetchedMetadata?.stars,
    forks: prefetchedMetadata?.forks,
    language: prefetchedMetadata?.language,
  };
}

/**
 * GitHub repository embed component.
 * Fetches repo data via server-side proxy and displays a rich card.
 */
export function GitHubEmbed({ info, compact, prefetchedMetadata }: GitHubEmbedProps) {
  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const repoSlug =
    info.id || (info.metadata?.owner && info.metadata?.repo ? `${info.metadata.owner}/${info.metadata.repo}` : null);
  const imageLoadingProps = getEmbedImageLoadingProps(compact);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(false);

    if (!repoSlug) {
      setRepo(null);
      setLoading(false);
      return;
    }

    if (prefetchedMetadata !== undefined) {
      setRepo(getPrefetchedGitHubRepo(repoSlug, prefetchedMetadata));
      setLoading(false);
      return;
    }

    setLoading(true);
    setRepo(null);

    let cancelled = false;
    const displayName = repoSlug;

    fetch(`/api/thumbnail?url=${encodeURIComponent(info.url)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled) {
          setRepo({
            name: data?.title ?? displayName,
            description: data?.description,
            imageUrl: data?.imageUrl ?? data?.thumbnailUrl ?? undefined,
            stars: data?.stars,
            forks: data?.forks,
            language: data?.language,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setRepo({ name: displayName });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repoSlug, info.url, prefetchedMetadata]);

  if (loading) {
    return (
      <div className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface ${compact ? "p-3" : "p-5"}`}>
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#2b3137] to-[#24292e] flex items-center justify-center shrink-0">
          <span className="loading loading-spinner loading-sm text-white"></span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Loading from GitHub...</p>
          <p className="text-base text-base-content/50 mt-0.5">{repoSlug}</p>
        </div>
      </div>
    );
  }

  if (!repo) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#2b3137] to-[#24292e] flex items-center justify-center shrink-0">
          <GitHubIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Repository not found</p>
          <p className="text-base text-base-content/50 mt-0.5">View on GitHub</p>
        </div>
      </SafeExternalLink>
    );
  }

  // No image — show link card with metadata
  if (!repo.imageUrl || imageError) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#2b3137] to-[#24292e] flex items-center justify-center shrink-0">
          <GitHubIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium truncate">{repo.name}</p>
          <p className="text-base text-base-content/50 mt-0.5 line-clamp-1">{repo.description || "View on GitHub"}</p>
          {(repo.stars !== undefined || repo.forks !== undefined || repo.language) && (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-base-content/50">
              {repo.language && <span>{repo.language}</span>}
              {repo.stars !== undefined && (
                <span className="flex items-center gap-0.5">
                  <StarIcon className="w-3 h-3" />
                  {formatCount(repo.stars)}
                </span>
              )}
              {repo.forks !== undefined && (
                <span className="flex items-center gap-0.5">
                  <ForkIcon className="w-3 h-3" />
                  {formatCount(repo.forks)}
                </span>
              )}
            </div>
          )}
        </div>
      </SafeExternalLink>
    );
  }

  // Image card with owner avatar and metadata
  return (
    <div className="block w-full overflow-hidden rounded-xl bg-base-200 embed-surface relative h-full flex flex-col">
      <SafeExternalLink href={info.url} className="flex-1 flex items-center justify-center relative group">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center embed-surface">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        )}
        <div className="flex h-full w-full items-center justify-center p-10 embed-surface">
          <img
            src={`/api/image-proxy?url=${encodeURIComponent(repo.imageUrl)}`}
            alt={repo.name}
            width={192}
            height={192}
            {...imageLoadingProps}
            className={`aspect-square h-auto w-[clamp(11rem,58%,24rem)] max-h-[72%] rounded-2xl shadow-lg transition-transform group-hover:scale-[1.05] object-cover ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </div>
      </SafeExternalLink>
      {/* Repository info bar */}
      <div className="flex items-center justify-between gap-2 rounded-b-xl px-3 py-2 embed-surface">
        <div className="flex items-center gap-2 min-w-0">
          <GitHubIcon className="w-4 h-4 text-base-content/50 shrink-0" />
          <span className="text-xs text-base-content/50 truncate">{repo.name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-base-content/50 shrink-0">
          {repo.language && <span>{repo.language}</span>}
          {repo.stars !== undefined && (
            <span className="flex items-center gap-0.5">
              <StarIcon className="w-3 h-3" />
              {formatCount(repo.stars)}
            </span>
          )}
          {repo.forks !== undefined && (
            <span className="flex items-center gap-0.5">
              <ForkIcon className="w-3 h-3" />
              {formatCount(repo.forks)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
