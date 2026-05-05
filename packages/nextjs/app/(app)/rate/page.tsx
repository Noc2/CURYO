import type { Metadata } from "next";
import VotePageClient from "~~/components/vote/VotePageClient";
import { getContentShareDataForParam } from "~~/lib/social/contentShare.server";

interface RatePageProps {
  searchParams?: Promise<{
    content?: string | string[];
  }>;
}

export async function generateMetadata({ searchParams }: RatePageProps): Promise<Metadata> {
  const params = await searchParams;
  const shareData = await getContentShareDataForParam(params?.content);
  if (!shareData) return {};

  return {
    title: shareData.title,
    description: shareData.description,
    openGraph: {
      title: shareData.title,
      description: shareData.description,
      type: "website",
      url: shareData.shareUrl,
      siteName: "Curyo",
      images: [
        {
          url: shareData.imageUrl,
          width: 1200,
          height: 630,
          alt: shareData.imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: shareData.title,
      description: shareData.description,
      images: [
        {
          url: shareData.imageUrl,
          width: 1200,
          height: 630,
          alt: shareData.imageAlt,
        },
      ],
    },
  };
}

export default function RatePage() {
  return <VotePageClient />;
}
