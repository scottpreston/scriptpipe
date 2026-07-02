/**
 * Map `items` through `fn` with at most `limit` calls in flight at once, returning results in
 * input order. This is the one place ScriptPipe owns a concurrency pool — partitioned steps
 * get parallelism from here instead of reaching for `Promise.all` themselves.
 *
 * `limit` must be a positive integer (validation enforces this upstream). If any call rejects,
 * the error propagates and no further items are started; in-flight calls are not cancelled
 * (JavaScript cannot), but their results are discarded.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R> | R,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Concurrency limit must be a positive integer, got ${limit}.`);
  }

  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
