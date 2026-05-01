import { BrowserSigningPage } from "~~/components/agent/BrowserSigningPage";

export const dynamic = "force-dynamic";

export default async function AgentSigningIntentPage({ params }: { params: Promise<{ intentId: string }> }) {
  const { intentId } = await params;
  return <BrowserSigningPage intentId={intentId} />;
}
