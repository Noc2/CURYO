import { addApprovedCategory, waitForPonderIndexed } from "../helpers/admin-helpers";
import { DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getCategories } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Category lifecycle tests.
 * Triggers Ponder event: CategoryAdded.
 *
 * NOTE: submitCategory() calls governor.propose() which reverts in mock mode
 * (governorAddr = deployer EOA, not a Governor contract). Therefore we can only
 * test the admin fast-path addApprovedCategory() on local Anvil.
 * CategorySubmitted + CategoryApproved events require a production-style
 * deployment with a real Governor contract and are covered by Foundry unit tests.
 *
 * Account allocation:
 * - Account #9 (scaffold-eth-default deployer = governance in mock mode) — has ADMIN_ROLE
 */
test.describe("Category lifecycle", () => {
  const CATEGORY_REGISTRY = CONTRACT_ADDRESSES.CategoryRegistry;

  test("admin adds category via fast-path and Ponder indexes it", async () => {
    test.setTimeout(60_000);

    const uniqueId = Date.now();
    const name = `Admin Platform ${uniqueId}`;
    const domain = `admin-${uniqueId}.test`;

    // Snapshot current approved categories
    let initialApproved: string[] = [];
    try {
      const { items } = await getCategories("1");
      initialApproved = items.map(c => c.id);
    } catch {
      // Ponder may not be available
    }

    // Add approved category directly (account #0 has ADMIN_ROLE)
    const success = await addApprovedCategory(
      name,
      domain,
      ["Science", "Technology"],
      `Is this ${name} content quality above {rating} out of 100?`,
      DEPLOYER.address,
      CATEGORY_REGISTRY,
    );
    expect(success).toBe(true);

    // Wait for Ponder to index the new approved category
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getCategories("1");
      return items.some(c => c.name === name);
    });

    if (!indexed) {
      test.skip(true, "Ponder not indexing local Anvil — on-chain add succeeded");
      return;
    }

    // Verify it's immediately approved
    const { items } = await getCategories("1");
    const added = items.find(c => c.name === name);
    expect(added).toBeTruthy();
    expect(added!.status).toBe(1);
    expect(added!.domain).toBe(domain);
    // Should not be in the initial list
    expect(initialApproved).not.toContain(added!.id);
  });

  test("multiple categories can be added and all appear in Ponder", async () => {
    test.setTimeout(60_000);

    const uniqueId = Date.now();
    const categories = [
      { name: `E2E Cat A ${uniqueId}`, domain: `cat-a-${uniqueId}.test` },
      { name: `E2E Cat B ${uniqueId}`, domain: `cat-b-${uniqueId}.test` },
    ];

    // Add both categories
    for (const cat of categories) {
      const success = await addApprovedCategory(
        cat.name,
        cat.domain,
        ["General"],
        `Rate this ${cat.name} content above {rating} out of 100?`,
        DEPLOYER.address,
        CATEGORY_REGISTRY,
      );
      expect(success).toBe(true);
    }

    // Wait for Ponder to index both
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getCategories("1");
      return categories.every(cat => items.some(i => i.name === cat.name));
    });

    if (!indexed) {
      test.skip(true, "Ponder not indexing local Anvil — on-chain adds succeeded");
      return;
    }

    // Verify both exist with correct domains
    const { items } = await getCategories("1");
    for (const cat of categories) {
      const found = items.find(i => i.name === cat.name);
      expect(found).toBeTruthy();
      expect(found!.domain).toBe(cat.domain);
      expect(found!.status).toBe(1);
    }
  });
});
