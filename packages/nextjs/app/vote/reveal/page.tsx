import type { Metadata, NextPage } from "next";
import { ManualRevealPage } from "~~/components/vote/ManualRevealPage";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata: Metadata = {
  ...getMetadata({
    title: "Reveal My Vote",
    description: "Hidden fallback page for manually revealing a vote if automatic keeper reveal is delayed.",
  }),
  robots: {
    index: false,
    follow: false,
  },
};

const VoteRevealPage: NextPage = () => {
  return <ManualRevealPage />;
};

export default VoteRevealPage;
