export async function runCommitAttempts<TResult>(params: {
  attempt: (attemptIndex: number) => Promise<TResult>;
  attempts?: number;
  isSuccess: (result: TResult) => boolean;
  shouldRetry?: (result: TResult) => boolean;
  onRetry?: (attemptIndex: number, result: TResult) => void;
}): Promise<TResult> {
  const attempts = Math.max(1, Math.floor(params.attempts ?? 1));
  let lastResult: TResult | undefined;

  for (let attemptIndex = 0; attemptIndex < attempts; attemptIndex += 1) {
    const result = await params.attempt(attemptIndex);
    if (params.isSuccess(result)) {
      return result;
    }

    lastResult = result;
    if (attemptIndex < attempts - 1 && (params.shouldRetry?.(result) ?? true)) {
      params.onRetry?.(attemptIndex, result);
      continue;
    }

    return result;
  }

  if (lastResult === undefined) {
    throw new Error("runCommitAttempts requires at least one attempt");
  }

  return lastResult;
}
