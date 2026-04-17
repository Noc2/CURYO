import { redirect } from "next/navigation";
import { RATE_ROUTE, buildRouteWithSearchParams } from "~~/constants/routes";

interface LegacyDiscoverPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LegacyDiscoverPage({ searchParams }: LegacyDiscoverPageProps) {
  redirect(buildRouteWithSearchParams(RATE_ROUTE, await searchParams));
}
