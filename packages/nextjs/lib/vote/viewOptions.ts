import { DISCOVER_FEED_MODE_OPTIONS, type DiscoverFeedMode } from "~~/lib/vote/feedModes";

export type ActivityViewOption = "watched" | "my_votes" | "my_submissions" | "settling_soon" | "followed_curators";
export type VoteView = DiscoverFeedMode | ActivityViewOption;

interface VoteViewOption {
  value: VoteView;
  label: string;
  description?: string;
}

interface VoteViewGroup {
  label: string;
  options: VoteViewOption[];
}

const ACTIVITY_VIEW_OPTIONS: VoteViewOption[] = [
  { value: "watched", label: "Watched" },
  { value: "my_votes", label: "My Votes" },
  { value: "my_submissions", label: "My Submissions" },
  { value: "settling_soon", label: "Your Settling Soon" },
  { value: "followed_curators", label: "Curators You Follow" },
];

const ACTIVITY_VIEW_VALUES = new Set<ActivityViewOption>([
  "watched",
  "my_votes",
  "my_submissions",
  "settling_soon",
  "followed_curators",
]);

export function isActivityViewOption(value: VoteView): value is ActivityViewOption {
  return ACTIVITY_VIEW_VALUES.has(value as ActivityViewOption);
}

export function getVoteViewGroups(hasWallet: boolean): VoteViewGroup[] {
  const groups: VoteViewGroup[] = [
    {
      label: "Discover",
      options: DISCOVER_FEED_MODE_OPTIONS.filter(option => option.value !== "contested").map(option => ({
        value: option.value,
        label: option.label,
        description: option.description,
      })),
    },
  ];

  if (hasWallet) {
    groups.push({
      label: "Your Activity",
      options: ACTIVITY_VIEW_OPTIONS,
    });
  }

  return groups;
}
