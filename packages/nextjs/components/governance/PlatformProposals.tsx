"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { usePonderAvailability } from "~~/hooks/usePonderAvailability";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

type FilterState = "all" | "pending" | "approved" | "rejected" | "canceled";

// Map CategoryStatus enum to filter state
const STATUS_MAP: Record<number, FilterState> = {
  0: "pending",
  1: "approved",
  2: "rejected",
  3: "canceled",
};

// Category status from contract
interface Category {
  id: bigint;
  name: string;
  domain: string;
  subcategories: readonly string[];
  submitter: `0x${string}`;
  stakeAmount: bigint;
  status: number;
  proposalId: bigint;
  createdAt: bigint;
}

/**
 * Platform Proposals section showing pending platform submissions
 */
export function PlatformProposals() {
  const [filter, setFilter] = useState<FilterState>("all");
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const ponderAvailable = usePonderAvailability(rpcFallbackEnabled);
  const rpcFallbackActive = rpcFallbackEnabled && ponderAvailable === false;

  // Fetch CategorySubmitted events to get all submitted category IDs
  const { data: categoryEvents, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "CategoryRegistry",
    eventName: "CategorySubmitted",
    watch: rpcFallbackActive,
    enabled: rpcFallbackActive,
  });

  const rpcCategories = useMemo(() => {
    if (!categoryEvents) return [];
    return categoryEvents.map(e => ({
      id: e.args.categoryId as bigint,
      name: e.args.name as string,
      domain: e.args.domain as string,
      submitter: e.args.submitter as `0x${string}`,
      proposalId: e.args.proposalId as bigint,
    }));
  }, [categoryEvents]);

  const {
    data: result,
    isLoading,
    error,
  } = usePonderQuery({
    queryKey: ["platformProposals"],
    ponderFn: async () => {
      const response = await ponderApi.getCategories("all");
      return response.items.map(item => ({
        id: BigInt(item.id),
        name: item.name,
        domain: item.domain,
        submitter: item.submitter as `0x${string}`,
        proposalId: item.proposalId ? BigInt(item.proposalId) : 0n,
      }));
    },
    rpcFn: async () => rpcCategories,
    rpcEnabled: rpcFallbackEnabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const categories = result?.data ?? rpcCategories;
  const proposalsLoading = isLoading || (rpcFallbackActive && eventsLoading);

  return (
    <div className="surface-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className={surfaceSectionHeadingClassName}>Platform Proposals</h2>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "pending", "approved", "rejected", "canceled"] as FilterState[]).map(f => (
          <button
            key={f}
            className={`px-3 py-1.5 rounded-lg text-base font-medium transition-colors capitalize ${
              filter === f ? "pill-active" : "pill-inactive"
            }`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {proposalsLoading && (
        <div className="text-center py-8">
          <span className="loading loading-spinner loading-md" />
          <p className="text-base text-base-content/60 mt-2">Loading proposals...</p>
        </div>
      )}

      {/* Error State */}
      {!proposalsLoading && error && (
        <div className="text-center py-8">
          <p className="text-base text-base-content/50">Unable to load proposals</p>
        </div>
      )}

      {/* Proposals List */}
      {!proposalsLoading && !error && categories.length > 0 ? (
        <div className="space-y-3">
          {categories.map(category => (
            <PlatformProposalCard key={category.id.toString()} categoryId={category.id} filter={filter} />
          ))}
        </div>
      ) : !proposalsLoading && !error ? (
        <div className="text-center py-8">
          <GlobeAltIcon className="w-12 h-12 text-base-content/20 mx-auto mb-4" />
          <p className="text-base-content/60 mb-2">No platform proposals yet</p>
          <p className="text-base text-base-content/40">
            <Link href="/submit?tab=category" className="link link-primary">
              Submit a new platform →
            </Link>
          </p>
        </div>
      ) : null}

      {/* Info Box */}
      <div className="mt-6 p-4 bg-base-200 rounded-xl">
        <h3 className="text-base font-medium mb-2">How Platform Proposals Work</h3>
        <ol className="text-base text-base-content/60 space-y-1 list-decimal list-inside">
          <li>Submit a platform on the Submit page (100 cREP stake)</li>
          <li>Sponsor an approval proposal from the Governance composer</li>
          <li>The original submitter links the sponsored proposal from the same wallet that posted the stake</li>
          <li>Community votes for 1 week (4% circulating supply quorum required)</li>
          <li>If approved, stake is returned and platform is added</li>
          <li>If rejected, stake is sent to the consensus reserve</li>
          <li>
            If the sponsor proposal is canceled or expires, the submitter can clear it, retry within 7 days, or cancel
            and reclaim the stake after 7 days
          </li>
        </ol>
      </div>
    </div>
  );
}

/**
 * Individual platform proposal card that fetches its own category details
 */
function PlatformProposalCard({ categoryId, filter }: { categoryId: bigint; filter: FilterState }) {
  // Fetch full category details
  const { data: category } = useScaffoldReadContract({
    contractName: "CategoryRegistry",
    functionName: "getCategory",
    args: [categoryId],
  }) as { data: Category | undefined };

  // Don't render if category doesn't match filter
  if (!category) return null;

  const status = STATUS_MAP[category.status] || "pending";
  if (filter !== "all" && status !== filter) return null;

  // Status badge
  const getStatusBadge = () => {
    switch (status) {
      case "pending":
        return (
          <span className="px-2 py-0.5 rounded-full text-base font-medium bg-warning/20 text-warning">
            {category.proposalId > 0n ? "Pending Vote" : "Awaiting Sponsor"}
          </span>
        );
      case "approved":
        return (
          <span className="px-2 py-0.5 rounded-full text-base font-medium bg-success/20 text-success">Approved</span>
        );
      case "rejected":
        return <span className="px-2 py-0.5 rounded-full text-base font-medium bg-error/20 text-error">Rejected</span>;
      case "canceled":
        return (
          <span className="px-2 py-0.5 rounded-full text-base font-medium bg-base-300 text-base-content/70">
            Canceled
          </span>
        );
      default:
        return null;
    }
  };

  // Format address
  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // Format stake
  const stakeFormatted = Number(category.stakeAmount) / 1e6;

  return (
    <div className="bg-base-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{category.name}</h3>
            {getStatusBadge()}
          </div>
          <p className="text-base text-base-content/60">{category.domain}</p>
        </div>
        {stakeFormatted > 0 && (
          <div className="text-right">
            <p className="text-base text-base-content/50">Stake</p>
            <p className="font-medium">{stakeFormatted} cREP</p>
          </div>
        )}
      </div>

      {/* Categories */}
      {category.subcategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {category.subcategories.slice(0, 5).map((subcat, i) => (
            <span key={i} className="px-2 py-0.5 bg-base-300 text-base rounded-full">
              {subcat}
            </span>
          ))}
          {category.subcategories.length > 5 && (
            <span className="px-2 py-0.5 bg-base-300 text-base rounded-full text-base-content/50">
              +{category.subcategories.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Submitter */}
      <div className="flex items-center justify-between gap-3 text-base text-base-content/50 flex-wrap">
        <p>Submitted by {formatAddress(category.submitter)}</p>
        {category.proposalId > 0n && <p>Proposal #{category.proposalId.toString()}</p>}
      </div>
    </div>
  );
}
