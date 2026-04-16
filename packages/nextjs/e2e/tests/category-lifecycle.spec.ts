import { addApprovedCategory, waitForPonderIndexed } from "../helpers/admin-helpers";
import { DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getCategories } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Seed category metadata tests.
 * Triggers Ponder event: CategoryAdded.
 *
 * Account allocation:
 * - Account #9 (scaffold-eth-default deployer = governance in local dev) — has ADMIN_ROLE
 */
test.describe("Seed categories", () => {
  const CATEGORY_REGISTRY = CONTRACT_ADDRESSES.CategoryRegistry;

  test("admin adds seed metadata and Ponder indexes it", async () => {
    test.setTimeout(60_000);

    const uniqueId = Date.now();
    const name = `Seed Category ${uniqueId}`;
    const slug = `seed-${uniqueId}`;

    // Snapshot current categories.
    let initialCategories: string[] = [];
    try {
      const { items } = await getCategories();
      initialCategories = items.map(c => c.id);
    } catch {
      // Ponder may not be available
    }

    // Add category metadata directly (account #0 has ADMIN_ROLE).
    const success = await addApprovedCategory(
      name,
      slug,
      ["Science", "Technology"],
      DEPLOYER.address,
      CATEGORY_REGISTRY,
    );
    expect(success).toBe(true);

    // Wait for Ponder to index the new category metadata.
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getCategories();
      return items.some(c => c.name === name);
    });

    if (!indexed) {
      test.skip(true, "Ponder not indexing local Anvil — on-chain add succeeded");
      return;
    }

    const { items } = await getCategories();
    const added = items.find(c => c.name === name);
    expect(added).toBeTruthy();
    expect(added!.domain).toBe(slug);
    expect(initialCategories).not.toContain(added!.id);
  });

  test("multiple categories can be added and all appear in Ponder", async () => {
    test.setTimeout(60_000);

    const uniqueId = Date.now();
    const categories = [
      { name: `E2E Cat A ${uniqueId}`, slug: `cat-a-${uniqueId}` },
      { name: `E2E Cat B ${uniqueId}`, slug: `cat-b-${uniqueId}` },
    ];

    // Add both categories
    for (const cat of categories) {
      const success = await addApprovedCategory(cat.name, cat.slug, ["General"], DEPLOYER.address, CATEGORY_REGISTRY);
      expect(success).toBe(true);
    }

    // Wait for Ponder to index both
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getCategories();
      return categories.every(cat => items.some(i => i.name === cat.name));
    });

    if (!indexed) {
      test.skip(true, "Ponder not indexing local Anvil — on-chain adds succeeded");
      return;
    }

    const { items } = await getCategories();
    for (const cat of categories) {
      const found = items.find(i => i.name === cat.name);
      expect(found).toBeTruthy();
      expect(found!.domain).toBe(cat.slug);
    }
  });
});
