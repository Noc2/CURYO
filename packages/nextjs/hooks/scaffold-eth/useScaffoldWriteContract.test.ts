import { pickTransactorOptions } from "./useScaffoldWriteContract";
import assert from "node:assert/strict";
import test from "node:test";

test("pickTransactorOptions forwards transaction toast controls to the transactor", () => {
  const onBlockConfirmation = () => undefined;
  const getErrorMessage = () => "custom failure";

  assert.deepEqual(
    pickTransactorOptions({
      action: "content submission",
      blockConfirmations: 2,
      getErrorMessage,
      mutationKey: ["write"],
      onBlockConfirmation,
      retry: 1,
      suppressErrorToast: true,
      suppressStatusToast: true,
      suppressSuccessToast: true,
    } as any),
    {
      action: "content submission",
      blockConfirmations: 2,
      getErrorMessage,
      onBlockConfirmation,
      suppressErrorToast: true,
      suppressStatusToast: true,
      suppressSuccessToast: true,
    },
  );
});
