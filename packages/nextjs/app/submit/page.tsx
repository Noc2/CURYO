import { redirect } from "next/navigation";
import { ASK_ROUTE, buildRouteWithSearchParams } from "~~/constants/routes";

interface LegacySubmitPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LegacySubmitPage({ searchParams }: LegacySubmitPageProps) {
  redirect(buildRouteWithSearchParams(ASK_ROUTE, await searchParams));
}
