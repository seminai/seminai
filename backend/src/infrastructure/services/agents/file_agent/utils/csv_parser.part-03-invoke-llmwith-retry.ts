// ---------------------------------------------------------------------------
// LLM invocation with retry
// ---------------------------------------------------------------------------

/**
 * Invoke an LLM extractor with retry and timeout.
 */
export async function invokeLLMWithRetry<TInput, TOptions, TResult>(
  invoker: (messages: TInput, options?: TOptions) => Promise<TResult>,
  messages: TInput,
  invokeOptions?: TOptions,
  retryOptions: { maxRetries?: number; timeoutMs?: number } = {},
): Promise<TResult> {
  const { maxRetries = 2, timeoutMs = 30_000 } = retryOptions;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        invokeOptions ? invoker(messages, invokeOptions) : invoker(messages),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM timeout')), timeoutMs),
        ),
      ]);
      return result;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = 1000 * (attempt + 1);
      console.warn(
        `[CSV-PARSER] LLM attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
        error instanceof Error ? error.message : String(error),
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable – the loop always either returns or rethrows
  throw new Error('LLM invocation failed after retries');
}
