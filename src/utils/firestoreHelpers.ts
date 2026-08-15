/** Remove undefined values recursively — Firestore rejects undefined fields at any depth. */
export function cleanFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => cleanFirestoreData(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const isPlainObject =
      data.constructor === Object ||
      Object.getPrototypeOf(data) === null ||
      !data.constructor;

    if (!isPlainObject) {
      return data;
    }

    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value !== undefined) {
        const cleanedValue = cleanFirestoreData(value);
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
    }
    return cleaned as T;
  }

  return data;
}

/** Firestore batch writes are limited to 500 operations per commit. */
export const FIRESTORE_BATCH_LIMIT = 500;

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
