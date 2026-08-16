/** Remove undefined and NaN values recursively — Firestore rejects undefined fields at any depth. */
export function cleanFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'number' && Number.isNaN(data)) {
    return undefined as unknown as T;
  }

  if (Array.isArray(data)) {
    return data
      .map((item) => cleanFirestoreData(item))
      .filter((item) => item !== undefined && !(typeof item === 'number' && Number.isNaN(item))) as unknown as T;
  }

  if (typeof data === 'object') {
    // Preserve Firestore special sentinel objects (Timestamp, FieldValue, DocumentReference, Blob)
    const isFirestoreSpecial =
      typeof (data as any).toDate === 'function' ||
      (data as any)._methodName !== undefined ||
      typeof (data as any).toBase64 === 'function';

    if (isFirestoreSpecial) {
      return data;
    }

    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value !== undefined) {
        const cleanedValue = cleanFirestoreData(value);
        if (cleanedValue !== undefined && !(typeof cleanedValue === 'number' && Number.isNaN(cleanedValue))) {
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
