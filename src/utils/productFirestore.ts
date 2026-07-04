import {
  collection, doc, getDoc, getDocs, query, where, writeBatch, DocumentReference
} from 'firebase/firestore';
import { db } from '../firebase';
import { Product } from '../types';

const FIRESTORE_BATCH_LIMIT = 500;

/** Build catalog from snapshot — doc.id is always the canonical id. */
export function productsFromSnapshot(
  docs: { id: string; data: () => Record<string, unknown> }[]
): Product[] {
  const items: Product[] = [];
  const seenDocIds = new Set<string>();

  docs.forEach((docSnap) => {
    if (seenDocIds.has(docSnap.id)) return;
    seenDocIds.add(docSnap.id);
    const data = docSnap.data() as Product;
    items.push({ ...data, id: docSnap.id });
  });

  return dedupeProductsByIdentity(items);
}

/** Hide duplicate rows (same barcode or same name+price) — keeps newest doc id. */
export function dedupeProductsByIdentity(products: Product[]): Product[] {
  const byKey = new Map<string, Product>();

  for (const p of products) {
    const barcodeKey = p.barcode?.trim();
    const key = barcodeKey
      ? `bc:${barcodeKey}`
      : `nm:${p.name.trim().toLowerCase()}::${p.price}`;

    const existing = byKey.get(key);
    if (!existing || p.id.localeCompare(existing.id) > 0) {
      byKey.set(key, p);
    }
  }

  return Array.from(byKey.values());
}

export function findProductByCode(products: Product[], code: string): Product | undefined {
  const normalized = code.trim();
  if (!normalized) return undefined;

  const exact = products.find(
    (p) =>
      (p.barcode && p.barcode === normalized) ||
      p.id === normalized
  );
  if (exact) return exact;

  return products.find(
    (p) =>
      (p.barcode && (p.barcode.endsWith(normalized) || normalized.endsWith(p.barcode))) ||
      (normalized.length >= 10 && p.barcode?.includes(normalized))
  );
}

/** Fully delete product from database by removing all matching documents */
export async function deleteProductFully(product: Product): Promise<number> {
  const refIds = new Set<string>([product.id]);

  if ((await getDoc(doc(db, 'products', product.id))).exists()) {
    refIds.add(product.id);
  }

  const legacyById = await getDocs(
    query(collection(db, 'products'), where('id', '==', product.id))
  );
  legacyById.forEach((d) => refIds.add(d.id));

  if (product.barcode?.trim()) {
    const byBarcode = await getDocs(
      query(collection(db, 'products'), where('barcode', '==', product.barcode.trim()))
    );
    byBarcode.forEach((d) => refIds.add(d.id));
  }

  const byName = await getDocs(
    query(collection(db, 'products'), where('name', '==', product.name))
  );
  byName.forEach((d) => refIds.add(d.id));

  // Hard delete by actually removing documents from database
  for (let i = 0; i < Array.from(refIds).length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    Array.from(refIds).slice(i, i + FIRESTORE_BATCH_LIMIT).forEach((id) => {
      batch.delete(doc(db, 'products', id));
    });
    await batch.commit();
  }

  return refIds.size;
}
