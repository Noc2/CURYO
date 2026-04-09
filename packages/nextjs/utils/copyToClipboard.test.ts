import { copyTextToClipboard } from "./copyToClipboard";
import assert from "node:assert/strict";
import test from "node:test";

test("copyTextToClipboard prefers the Clipboard API when available", async () => {
  let copiedText: string | null = null;

  const copied = await copyTextToClipboard("hello", {
    clipboard: {
      writeText: async value => {
        copiedText = value;
      },
    },
    document: null,
  });

  assert.equal(copied, true);
  assert.equal(copiedText, "hello");
});

test("copyTextToClipboard falls back to document.execCommand when the Clipboard API fails", async () => {
  let appended = 0;
  let removed = 0;
  let selected = false;
  let copiedValue = "";

  const copied = await copyTextToClipboard("fallback", {
    clipboard: {
      writeText: async () => {
        throw new Error("Clipboard unavailable");
      },
    },
    document: {
      body: {
        appendChild: (node: Node) => {
          appended += 1;
          copiedValue = (node as { value?: string }).value ?? "";
          return node;
        },
        removeChild: (node: Node) => {
          removed += 1;
          return node;
        },
      },
      createElement: () =>
        ({
          value: "",
          select: () => {
            selected = true;
          },
        }) as HTMLTextAreaElement,
      execCommand: (command: string) => command === "copy",
    } as unknown as Document,
  });

  assert.equal(copied, true);
  assert.equal(appended, 1);
  assert.equal(removed, 1);
  assert.equal(selected, true);
  assert.equal(copiedValue, "fallback");
});

test("copyTextToClipboard returns false when no copy mechanism is available", async () => {
  const copied = await copyTextToClipboard("nope", {
    clipboard: null,
    document: null,
  });

  assert.equal(copied, false);
});
