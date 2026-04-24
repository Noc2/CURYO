import { E2E_BASE_URL } from "./service-urls";
import { expect, type APIRequestContext } from "@playwright/test";

export async function mintMockUsdc(
  request: APIRequestContext,
  address: string,
  amount = 100,
): Promise<void> {
  const response = await request.post(`${E2E_BASE_URL}/api/dev-faucet`, {
    data: {
      address,
      action: "mint-usdc",
      amount,
    },
  });

  const bodyText = await response.text();
  expect(response.status(), `Failed to mint mock USDC for ${address}: ${bodyText}`).toBe(200);

  const body = JSON.parse(bodyText) as { success?: boolean; action?: string };
  expect(body.success).toBe(true);
  expect(body.action).toBe("mint-usdc");
}
