type ClipboardApi = Pick<Clipboard, "writeText">;

type LegacyCopyTextarea = Pick<HTMLTextAreaElement, "value" | "select">;

type LegacyCopyDocument = Pick<Document, "createElement" | "execCommand"> & {
  body: Pick<HTMLElement, "appendChild" | "removeChild">;
};

function legacyCopyText(text: string, documentRef: LegacyCopyDocument): boolean {
  const textArea = documentRef.createElement("textarea") as LegacyCopyTextarea;
  textArea.value = text;
  documentRef.body.appendChild(textArea as unknown as Node);
  textArea.select();
  const copied = documentRef.execCommand("copy");
  documentRef.body.removeChild(textArea as unknown as Node);
  return copied;
}

export async function copyTextToClipboard(
  text: string,
  options?: {
    clipboard?: ClipboardApi | null;
    document?: LegacyCopyDocument | null;
  },
): Promise<boolean> {
  const clipboardRef = options?.clipboard ?? globalThis.navigator?.clipboard ?? null;
  if (clipboardRef?.writeText) {
    try {
      await clipboardRef.writeText(text);
      return true;
    } catch {
      // Fall back to the legacy textarea copy path below.
    }
  }

  const documentRef = options?.document ?? globalThis.document ?? null;
  if (!documentRef?.body) {
    return false;
  }

  return legacyCopyText(text, documentRef);
}
