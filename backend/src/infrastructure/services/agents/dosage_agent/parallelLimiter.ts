/**
 * Simple parallel execution limiter without external dependencies
 * Limits the number of concurrent async operations to avoid rate limiting
 */

type AsyncFunction<T> = () => Promise<T>;

/**
 * Creates a limiter that allows at most `concurrency` async operations at once
 * @param concurrency Maximum number of concurrent operations
 * @returns A function that wraps async operations with the limit
 */
export function createLimiter(concurrency: number): <T>(fn: AsyncFunction<T>) => Promise<T> {
  let running = 0;
  const queue: Array<{
    fn: AsyncFunction<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];

  const runNext = (): void => {
    if (running >= concurrency || queue.length === 0) {
      return;
    }

    const { fn, resolve, reject } = queue.shift()!;
    running++;

    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        running--;
        runNext();
      });
  };

  return <T>(fn: AsyncFunction<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      queue.push({
        fn: fn as AsyncFunction<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      runNext();
    });
  };
}

/**
 * Runs an array of async functions with limited concurrency
 * @param functions Array of async functions to execute
 * @param concurrency Maximum number of concurrent operations (default: 10)
 * @returns Promise that resolves to an array of results
 */
export async function runWithLimit<T>(
  functions: ReadonlyArray<AsyncFunction<T>>,
  concurrency: number = 10,
): Promise<T[]> {
  const limiter = createLimiter(concurrency);
  return Promise.all(functions.map((fn) => limiter(fn)));
}

/**
 * Maps an array with limited concurrency
 * @param items Array of items to process
 * @param mapper Function to apply to each item
 * @param concurrency Maximum number of concurrent operations (default: 10)
 * @returns Promise that resolves to an array of results
 */
export async function mapWithLimit<T, R>(
  items: ReadonlyArray<T>,
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number = 10,
): Promise<R[]> {
  const limiter = createLimiter(concurrency);
  return Promise.all(items.map((item, index) => limiter(() => mapper(item, index))));
}
