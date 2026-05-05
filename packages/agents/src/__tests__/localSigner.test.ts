import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  askHumansWithLocalSigner,
  signX402AuthorizationRequest,
  withLocalSignerWallet,
} from "../localSigner.js";
import type { AskHumansRequest, AskHumansResponse, CuryoAgentClient } from "@curyo/sdk/agent";

const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const account = privateKeyToAccount(PRIVATE_KEY);

function x402AuthorizationRequest(from = account.address) {
  const authorization = {
    from,
    nonce: `0x${"1".repeat(64)}`,
    to: "0x00000000000000000000000000000000000000bb",
    validAfter: "0",
    validBefore: "9999999999",
    value: "1500000",
  };

  return {
    authorization,
    typedData: {
      domain: {
        chainId: 42220,
        name: "USDC",
        verifyingContract: "0x00000000000000000000000000000000000000cc",
        version: "2",
      },
      message: authorization,
      primaryType: "ReceiveWithAuthorization",
      types: {
        ReceiveWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
    },
  };
}

function askPayload(walletAddress?: string): AskHumansRequest {
  return {
    bounty: { amount: "1500000", requiredVoters: "3" },
    clientRequestId: "local-signer-test",
    question: {
      categoryId: "1",
      contextUrl: "https://example.com",
      tags: ["agent"],
      title: "Should this agent proceed?",
    },
    walletAddress,
  };
}

describe("local signer", () => {
  it("sets and guards the ask wallet address", () => {
    expect(withLocalSignerWallet(askPayload(), account.address).walletAddress).toBe(account.address);

    expect(() =>
      withLocalSignerWallet(
        askPayload("0x00000000000000000000000000000000000000aa"),
        account.address,
      ),
    ).toThrow(/does not match local signer/);
  });

  it("signs native x402 authorization requests", async () => {
    const paymentAuthorization = await signX402AuthorizationRequest(account, x402AuthorizationRequest());

    expect(paymentAuthorization).toMatchObject({
      from: account.address,
      nonce: `0x${"1".repeat(64)}`,
      to: "0x00000000000000000000000000000000000000bb",
      validAfter: "0",
      validBefore: "9999999999",
      value: "1500000",
    });
    expect(paymentAuthorization.signature).toMatch(/^0x[0-9a-f]{130}$/i);
  });

  it("re-calls askHumans with a signed x402 authorization", async () => {
    const askCalls: AskHumansRequest[] = [];
    const agent = {
      askHumans: async (request: AskHumansRequest): Promise<AskHumansResponse> => {
        askCalls.push(request);
        if (!request.paymentAuthorization) {
          return {
            operationKey: `0x${"2".repeat(64)}`,
            paymentMode: "x402_authorization",
            x402AuthorizationRequest: x402AuthorizationRequest(),
          };
        }

        return {
          operationKey: `0x${"2".repeat(64)}`,
          paymentMode: "x402_authorization",
          transactionPlan: { calls: [], requiresOrderedExecution: true },
        };
      },
      confirmAskTransactions: async () => {
        throw new Error("confirmAskTransactions should not run without transaction hashes.");
      },
    } satisfies Pick<CuryoAgentClient, "askHumans" | "confirmAskTransactions">;

    const result = await askHumansWithLocalSigner({
      account,
      agent,
      config: {
        chainName: "test",
        pollingIntervalMs: 1,
        receiptTimeoutMs: 1,
      },
      payload: askPayload(),
      paymentMode: "x402_authorization",
    });

    expect(result.signedX402Authorization).toBe(true);
    expect(askCalls).toHaveLength(2);
    expect(askCalls[0]).toMatchObject({
      paymentMode: "x402_authorization",
      walletAddress: account.address,
    });
    expect(askCalls[1].paymentAuthorization?.signature).toMatch(/^0x[0-9a-f]{130}$/i);
    expect(result.transactions).toBeUndefined();
  });
});
