import { submitContentDirect, waitForPonderIndexed } from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getContentList } from "../helpers/ponder-api";
import { E2E_BASE_URL } from "../helpers/service-urls";
import { findVoteableContent, getVisibleConnectedWallet, gotoWithRetry } from "../helpers/wait-helpers";
import { swapWalletSession } from "../helpers/wallet-session";
import { type Locator, type Page, chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.resolve(__dirname, "../artifacts/demo");
const VIEWPORT = { width: 1280, height: 800 };
const CAPTION_ID = "curyo-demo-caption";
const VERIFIED_DEMO_WALLETS = [
  ANVIL_ACCOUNTS.account3,
  ANVIL_ACCOUNTS.account4,
  ANVIL_ACCOUNTS.account5,
  ANVIL_ACCOUNTS.account6,
  ANVIL_ACCOUNTS.account7,
  ANVIL_ACCOUNTS.account8,
  ANVIL_ACCOUNTS.account9,
  ANVIL_ACCOUNTS.account10,
] as const;

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function formatWalletLabel(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function pause(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}

async function ensureWalletVisible(page: Page, address: string): Promise<void> {
  const walletLabel = formatWalletLabel(address);
  const connectedWallet = getVisibleConnectedWallet(page).filter({ hasText: walletLabel }).first();
  await connectedWallet.waitFor({ state: "visible", timeout: 30_000 });
}

async function showCaption(page: Page, title: string, body: string): Promise<void> {
  await page.evaluate(
    ({ id, nextTitle, nextBody }) => {
      const existing = document.getElementById(id);
      if (existing) {
        existing.remove();
      }

      const root = document.createElement("div");
      root.id = id;
      root.setAttribute(
        "style",
        [
          "position: fixed",
          "left: 24px",
          "bottom: 24px",
          "z-index: 2147483647",
          "max-width: min(560px, calc(100vw - 48px))",
          "pointer-events: none",
          "border-radius: 18px",
          "padding: 18px 20px",
          "background: rgba(12, 16, 24, 0.88)",
          "color: #f8fafc",
          "box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28)",
          "backdrop-filter: blur(14px)",
          "font-family: Inter, ui-sans-serif, system-ui, sans-serif",
        ].join(";"),
      );

      const heading = document.createElement("div");
      heading.textContent = nextTitle;
      heading.setAttribute("style", "font-size: 16px; font-weight: 700; line-height: 1.3;");

      const copy = document.createElement("div");
      copy.textContent = nextBody;
      copy.setAttribute(
        "style",
        "margin-top: 8px; font-size: 14px; line-height: 1.45; color: rgba(248, 250, 252, 0.86);",
      );

      root.append(heading, copy);
      document.body.append(root);
    },
    {
      id: CAPTION_ID,
      nextTitle: title,
      nextBody: body,
    },
  );
}

async function hideCaption(page: Page): Promise<void> {
  await page.evaluate(id => {
    document.getElementById(id)?.remove();
  }, CAPTION_ID);
}

async function moveMouseTo(page: Page, target: Locator, steps = 28): Promise<{ x: number; y: number }> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("Target element is not visible for mouse movement");
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps });
  return { x, y };
}

async function clickTarget(page: Page, target: Locator, pauseAfterMs = 500): Promise<void> {
  const { x, y } = await moveMouseTo(page, target);
  await pause(page, 120);
  await page.mouse.click(x, y);
  await pause(page, pauseAfterMs);
}

async function prepareDemoContent(): Promise<{ searchQuery: string }> {
  console.log("Preparing deterministic demo content...");
  const submitter = ANVIL_ACCOUNTS.account10;
  const uniqueId = Date.now();
  const title = `Curyo Demo ${uniqueId}`;
  const demoUrl = `https://www.youtube.com/watch?v=curyo_demo_${uniqueId}`;

  const submitted = await submitContentDirect(
    demoUrl,
    title,
    "A dedicated piece of content created only for the Playwright demo recording.",
    "demo",
    1,
    submitter.address,
    CONTRACT_ADDRESSES.ContentRegistry,
  );
  if (!submitted) {
    throw new Error("Failed to submit deterministic demo content");
  }

  const indexed = await waitForPonderIndexed(
    async () => {
      const { items } = await getContentList({ status: "all", search: title, sortBy: "newest", limit: 5 });
      return items.some(item => item.title === title);
    },
    60_000,
    2_000,
    "record-demo:content-search",
  );

  if (!indexed) {
    throw new Error("Ponder did not index the deterministic demo content in time");
  }

  return { searchQuery: title };
}

async function waitForVoteFeedScene(page: Page, timeout = 30_000): Promise<void> {
  const indicators = page
    .getByRole("button", { name: "Vote up" })
    .or(page.getByRole("button", { name: "Vote down" }))
    .or(page.getByText(/Voted(?: hidden| Up| Down)?/i))
    .or(page.getByText("Your question"))
    .or(page.getByText(/Cooldown/i))
    .or(page.getByText("Round full"))
    .or(page.getByText("No questions have been asked yet"))
    .or(page.getByText(/No content found/i));

  await indicators.first().waitFor({ state: "visible", timeout });
}

async function recordFaucetIntro(page: Page): Promise<void> {
  console.log("Recording faucet intro...");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await swapWalletSession(page, ANVIL_ACCOUNTS.account1.privateKey);
  await gotoWithRetry(page, "/governance#faucet", { ensureWalletConnected: true, timeout: 60_000 });
  await ensureWalletVisible(page, ANVIL_ACCOUNTS.account1.address);

  await page.getByRole("heading", { name: "cREP Faucet" }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("heading", { name: "How it works" }).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);

  const verificationServiceLink = page.getByRole("link", { name: "Self.xyz" }).first();
  await moveMouseTo(page, verificationServiceLink, 32);
  await showCaption(
    page,
    "Voter ID setup",
    "Identity verification happens through Self.xyz. For this short demo, we skip the verification ceremony and switch to a pre-verified wallet.",
  );
  await pause(page, 2_600);
  await hideCaption(page);
  await pause(page, 250);
}

async function recordVoteScene(page: Page, searchQuery?: string): Promise<void> {
  console.log("Recording vote scene...");
  let selectedWallet: (typeof VERIFIED_DEMO_WALLETS)[number] | null = null;

  for (const wallet of VERIFIED_DEMO_WALLETS) {
    await swapWalletSession(page, wallet.privateKey);
    const voteUrl = searchQuery ? `/rate?q=${encodeURIComponent(searchQuery)}` : "/rate";
    await gotoWithRetry(page, voteUrl, {
      ensureWalletConnected: true,
      timeout: 60_000,
    });
    await ensureWalletVisible(page, wallet.address);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await waitForVoteFeedScene(page, 30_000);

    const hasVoteableContent = await findVoteableContent(page);
    if (hasVoteableContent) {
      selectedWallet = wallet;
      break;
    }
  }

  if (!selectedWallet) {
    throw new Error("No voteable content was visible for any verified demo wallet");
  }

  const voteButton = page.getByRole("button", { name: "Vote up" }).first();
  await voteButton.waitFor({ state: "visible", timeout: 20_000 });

  await moveMouseTo(page, voteButton, 30);
  await showCaption(
    page,
    "Blind vote with stake",
    "This wallet already has a Voter ID and cREP, so the demo can go straight into a live vote.",
  );
  await pause(page, 1_600);
  await hideCaption(page);

  await clickTarget(page, voteButton, 500);

  const stakeModal = page.locator("[role='dialog']").first();
  await stakeModal.waitFor({ state: "visible", timeout: 15_000 });

  const oneCrepButton = stakeModal.getByRole("button", { name: /^1$/ });
  if (await oneCrepButton.isVisible().catch(() => false)) {
    await clickTarget(page, oneCrepButton, 250);
  }

  const confirmButton = stakeModal.getByRole("button", { name: /Stake \d+/i });
  await confirmButton.waitFor({ state: "visible", timeout: 15_000 });
  await clickTarget(page, confirmButton, 600);

  const successIndicator = page.getByText(/Vote revealed\.|voted/i).first();
  const errorIndicator = page
    .getByText(/reverted/i)
    .or(page.getByText(/failed/i))
    .or(page.getByText(/error/i))
    .or(page.getByText(/rejected/i))
    .or(page.getByText(/not confirmed/i))
    .first();

  await Promise.race([
    successIndicator.waitFor({ state: "visible", timeout: 45_000 }),
    errorIndicator.waitFor({ state: "visible", timeout: 45_000 }).then(async () => {
      const text = (await errorIndicator.textContent())?.trim() || "Unknown voting error";
      throw new Error(`Vote failed during demo recording: ${text}`);
    }),
  ]);

  await pause(page, 1_600);
}

async function main(): Promise<void> {
  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const outputPath =
    process.env.CURYO_DEMO_VIDEO_PATH?.trim() || path.join(ARTIFACTS_DIR, `curyo-demo-${timestampSlug()}.webm`);
  const headless = process.env.CURYO_DEMO_HEADLESS !== "false";
  const mode = process.env.CURYO_DEMO_MODE?.trim() === "intro" ? "intro" : "full";

  console.log(`Recording ${mode} demo against ${E2E_BASE_URL}...`);
  const prepared = mode === "full" ? await prepareDemoContent() : null;
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    baseURL: E2E_BASE_URL,
    viewport: VIEWPORT,
    recordVideo: {
      dir: ARTIFACTS_DIR,
      size: VIEWPORT,
    },
  });
  const page = await context.newPage();
  const video = page.video();

  if (!video) {
    throw new Error("Playwright video recording is not available for the demo page");
  }

  try {
    await recordFaucetIntro(page);
    if (mode === "full") {
      await recordVoteScene(page, prepared?.searchQuery);
    } else {
      await pause(page, 400);
    }
  } finally {
    await hideCaption(page).catch(() => undefined);
    await context.close();
    await video.saveAs(outputPath);
    await browser.close();
  }

  console.log(`Curyo demo video saved to ${outputPath}`);
}

main().catch(error => {
  console.error("Demo recorder failed:", error);
  process.exitCode = 1;
});
