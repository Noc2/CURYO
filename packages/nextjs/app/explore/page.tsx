import { redirect } from "next/navigation";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  redirect(params.q ? `/vote?q=${encodeURIComponent(params.q)}` : "/vote");
}
