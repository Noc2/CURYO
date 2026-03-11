import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import {
  getContentById,
  getContentList,
  getFollowState,
  getFollowing,
  getStats,
  ponderGet,
} from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Ponder REST API endpoint verification.
 * Pure API tests — no browser needed, uses fetch directly.
 * Ponder must be running at localhost:42069.
 */
test.describe("Ponder API endpoints", () => {
  test("GET /content returns paginated list", async () => {
    const data = await getContentList({ status: "all", limit: 5 });
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("total");
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);

    // Each item should have expected fields
    const item = data.items[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("url");
    expect(item).toHaveProperty("submitter");
    expect(item).toHaveProperty("status");
  });

  test("GET /content/:id returns single item with rounds", async () => {
    const data = await getContentById(1);
    expect(data).toHaveProperty("content");
    expect(data).toHaveProperty("rounds");
    expect(data.content.id).toBe("1");
    expect(data.content).toHaveProperty("categoryId");
    expect(data.content).toHaveProperty("submitter");
    expect(data.content).toHaveProperty("url");
    expect(Array.isArray(data.rounds)).toBe(true);
  });

  test("GET /content with categoryId filter", async () => {
    // First, get categories to find a valid ID
    const categories = await ponderGet("/categories?status=all");
    expect(categories).toHaveProperty("items");
    expect(categories.items.length).toBeGreaterThan(0);

    const categoryId = categories.items[0].id;
    const data = await getContentList({ status: "all", categoryId: String(categoryId) });
    expect(data).toHaveProperty("items");
    // All returned items should have the matching category
    for (const item of data.items) {
      expect(item.categoryId).toBe(String(categoryId));
    }
  });

  test("GET /leaderboard returns ranked list", async () => {
    const data = await ponderGet("/leaderboard?type=voters&limit=10");
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("type");
    expect(data.type).toBe("voters");
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);

    const entry = data.items[0];
    expect(entry).toHaveProperty("address");
  });

  test("GET /rewards returns reward data for voter", async () => {
    const voter = ANVIL_ACCOUNTS.account3.address.toLowerCase();
    const data = await ponderGet(`/rewards?voter=${voter}`);
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
  });

  test("GET /submission-stakes returns stake count", async () => {
    const submitter = ANVIL_ACCOUNTS.account2.address.toLowerCase();
    const data = await ponderGet(`/submission-stakes?submitter=${submitter}`);
    expect(data).toHaveProperty("activeCount");
    expect(data).toHaveProperty("submitter");
    expect(data.submitter).toBe(submitter);
  });

  test("GET /balance-history returns transfer structure", async () => {
    const address = ANVIL_ACCOUNTS.account2.address.toLowerCase();
    const data = await ponderGet(`/balance-history?address=${address}&limit=5`);
    expect(data).toHaveProperty("transfers");
    expect(data).toHaveProperty("address");
    expect(Array.isArray(data.transfers)).toBe(true);
    expect(data.address).toBe(address);
  });

  test("GET /category-popularity returns vote counts", async () => {
    const data = await ponderGet("/category-popularity");
    // Returns a Record<string, number> where keys are category IDs
    expect(typeof data).toBe("object");
    expect(data).not.toBeNull();
  });

  test("GET /stats returns global statistics", async () => {
    const data = await getStats();
    expect(data).toHaveProperty("totalContent");
    expect(data).toHaveProperty("totalVotes");
    expect(data).toHaveProperty("totalRoundsSettled");
  });

  test("GET /profile/:address returns profile or 404", async () => {
    const address = ANVIL_ACCOUNTS.account2.address.toLowerCase();
    // Use retry logic — Ponder may return 429 during rapid test runs
    let res = await fetch(`http://localhost:42069/profile/${address}`);
    for (let attempt = 0; attempt < 3 && res.status === 429; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      res = await fetch(`http://localhost:42069/profile/${address}`);
    }
    // Profile may or may not exist on fresh chain (requires on-chain setProfile tx)
    expect([200, 404]).toContain(res.status);

    if (res.status === 200) {
      const data = await res.json();
      expect(data).toHaveProperty("profile");
      expect(data.profile.address).toBe(address);
    }
  });

  test("GET /votes returns vote list", async () => {
    const data = await ponderGet("/votes?limit=5");
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
  });

  test("GET /following and /follow-state return follow graph structures", async () => {
    const follower = ANVIL_ACCOUNTS.account2.address.toLowerCase();
    const target = ANVIL_ACCOUNTS.account8.address.toLowerCase();

    const following = await getFollowing(follower);
    expect(following).toHaveProperty("items");
    expect(following).toHaveProperty("total");
    expect(Array.isArray(following.items)).toBe(true);

    const state = await getFollowState(follower, target);
    expect(state.follower).toBe(follower);
    expect(state.target).toBe(target);
    expect(typeof state.following).toBe("boolean");
  });

  test("GET /submitter-rewards returns reward data for submitter", async () => {
    const submitter = ANVIL_ACCOUNTS.account2.address.toLowerCase();
    const data = await ponderGet(`/submitter-rewards?submitter=${submitter}`);
    expect(data).toHaveProperty("items");
    expect(Array.isArray(data.items)).toBe(true);
  });

  test("GET /voting-stakes returns stake breakdown for voter", async () => {
    const voter = ANVIL_ACCOUNTS.account3.address.toLowerCase();
    const data = await ponderGet(`/voting-stakes?voter=${voter}`);
    expect(data).toHaveProperty("activeStake");
    expect(data).toHaveProperty("activeCount");
    expect(data).toHaveProperty("voter");
    expect(data.voter).toBe(voter);
  });
});
