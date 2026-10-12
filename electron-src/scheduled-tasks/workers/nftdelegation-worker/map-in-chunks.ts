/** Bounded concurrent reads, preserving input order and rejecting failed batches. */
export async function mapInChunks<T, R>(
  items: T[],
  size: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(map))));
  }
  return results;
}
