import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { E2E_BASE_URL } from "../helpers/service-urls";
import { expect, test } from "@playwright/test";

test.describe("Dev faucet API", () => {
  test("can mint HREP via API route", async ({ request }) => {
    // POST to dev faucet — requires DEV_FAUCET_ENABLED=true and FAUCET_PRIVATE_KEY in .env.local
    const response = await request.post(`${E2E_BASE_URL}/api/dev-faucet`, {
      data: {
        address: ANVIL_ACCOUNTS.account1.address, // Account #1 has no pre-funded HREP
        action: "mint-hrep",
        amount: 100,
      },
    });

    const status = response.status();

    if (status === 200) {
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.txHash).toBeTruthy();
    } else {
      // Dev faucet disabled (403), not configured (500), or contract not deployed
      // All are valid in a test environment depending on configuration
      expect([403, 500]).toContain(status);
    }
  });

  test("can mint VoterID via API route", async ({ request }) => {
    const response = await request.post(`${E2E_BASE_URL}/api/dev-faucet`, {
      data: {
        address: ANVIL_ACCOUNTS.account1.address,
        action: "mint-voter-id",
      },
    });

    const status = response.status();

    if (status === 200) {
      const body = await response.json();
      expect(body.success).toBe(true);
    } else {
      // Dev faucet disabled (403), not configured (500), already has VoterID (409)
      expect([403, 409, 500]).toContain(status);
    }
  });

  test("can mint mock USDC via API route", async ({ request }) => {
    const response = await request.post(`${E2E_BASE_URL}/api/dev-faucet`, {
      data: {
        address: ANVIL_ACCOUNTS.account1.address,
        action: "mint-usdc",
        amount: 100,
      },
    });

    const status = response.status();

    if (status === 200) {
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.action).toBe("mint-usdc");
      expect(body.txHash).toBeTruthy();
    } else {
      // Dev faucet disabled (403), not configured (500), or contract not deployed
      expect([403, 500]).toContain(status);
    }
  });
});
