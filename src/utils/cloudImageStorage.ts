import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, ProductVariant } from '../types';
import { compressImage } from './localProductStorage';

// High-speed, dedicated image hosting API keys with automatic failover
const IMGBB_API_KEYS = [
  '6d207e021d9de7484aa17d26e5424ac2',
  '1c36056b2fc05d67ff9b0df48cf3d4fb',
  '06b12f71ee27435f3066a33994d50cf4'
];

let currentKeyIndex = 0;

function getNextApiKey(): string {
  const key = IMGBB_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % IMGBB_API_KEYS.length;
  return key;
}

/**
 * Upload image to ImgBB Free Cloud CDN.
 * Returns direct permanent HTTPS image URL (e.g. https://i.ibb.co/xyz/prod.jpg).
 * Zero CORS issues, completely free, and works without Firebase Storage.
 */
async function uploadToImgBB(base64DataUrl: string): Promise<string | null> {
  const base64Clean = base64DataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

  for (let attempt = 0; attempt < IMGBB_API_KEYS.length; attempt++) {
    try {
      const apiKey = getNextApiKey();
      const formData = new FormData();
      formData.append('image', base64Clean);

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.data) {
          const directUrl = data.data.display_url || data.data.url;
          if (directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')) {
            return directUrl;
          }
        }
      }
    } catch (err) {
      console.warn(`ImgBB upload attempt ${attempt + 1} notice:`, err);
    }
  }

  return null;
}

/**
 * Secondary Cloud Backup: FreeImage.host API
 */
async function uploadToFreeImageHost(base64DataUrl: string): Promise<string | null> {
  try {
    const base64Clean = base64DataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const formData = new FormData();
    formData.append('key', '6d207e021d9de7484aa17d26e5424ac2');
    formData.append('action', 'upload');
    formData.append('source', base64Clean);
    formData.append('format', 'json');

    const res = await fetch('https://freeimage.host/api/1/upload', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.image?.url) {
        return data.image.url;
      }
    }
  } catch (err) {
    console.warn('FreeImage.host fallback notice:', err);
  }
  return null;
}

/**
 * Universal Standalone Cloud Image Uploader:
 * 1. Resizes and compresses image to lightweight Web-optimized JPEG (~30KB-40KB).
 * 2. Uploads directly to high-speed Cloud CDN (ImgBB / FreeImage).
 * 3. Returns permanent, direct HTTPS image URL.
 * 4. Safe offline fallback to local compressed format if no internet.
 */
export async function uploadImageToCloud(
  fileOrBase64: File | string,
  _folder = 'products'
): Promise<string> {
  if (!fileOrBase64) return '';

  // If already a valid remote URL, keep it
  if (typeof fileOrBase64 === 'string' && (fileOrBase64.startsWith('http://') || fileOrBase64.startsWith('https://'))) {
    return fileOrBase64;
  }

  // 1. High-efficiency client-side compression (650x650 max, 0.74 quality)
  const compressedBase64 = await compressImage(fileOrBase64, 650, 650, 0.74);
  if (!compressedBase64) return typeof fileOrBase64 === 'string' ? fileOrBase64 : '';

  // 2. Upload to Cloud CDN (Primary: ImgBB)
  try {
    const imgbbUrl = await uploadToImgBB(compressedBase64);
    if (imgbbUrl && imgbbUrl.startsWith('http')) {
      return imgbbUrl;
    }
  } catch (err) {
    console.warn('Primary cloud upload notice:', err);
  }

  // 3. Upload to Secondary Cloud Provider (FreeImage.host)
  try {
    const backupUrl = await uploadToFreeImageHost(compressedBase64);
    if (backupUrl && backupUrl.startsWith('http')) {
      return backupUrl;
    }
  } catch (err) {
    console.warn('Secondary cloud upload notice:', err);
  }

  // 4. Safe fallback: Return ultra-lightweight compressed base64
  return compressedBase64;
}

export interface MigrationProgress {
  current: number;
  total: number;
  currentProduct: string;
  percentage: number;
}

/**
 * One-Click Magic Migration Tool:
 * Scans all products in Firestore. Finds any products or variants with embedded Base64 images,
 * uploads each image to Cloud Storage, replaces it with the permanent direct public URL,
 * and updates the document in Firestore.
 */
export async function migrateAllProductsToCloud(
  onProgress?: (progress: MigrationProgress) => void
): Promise<{ success: number; failed: number; skipped: number }> {
  const productsCol = collection(db, 'products');
  const snapshot = await getDocs(productsCol);

  const allProducts: Product[] = [];
  snapshot.forEach((docSnap) => {
    const p = { ...(docSnap.data() as Product), id: docSnap.id };
    if (!p.isDeleted) allProducts.push(p);
  });

  // Filter products needing migration (has base64 image or variant with base64)
  const productsToMigrate = allProducts.filter((p) => {
    const mainHasBase64 = typeof p.image === 'string' && p.image.startsWith('data:image');
    const variantHasBase64 = Array.isArray(p.variants) && p.variants.some((v) => typeof v.image === 'string' && v.image.startsWith('data:image'));
    return mainHasBase64 || variantHasBase64;
  });

  let success = 0;
  let failed = 0;
  let skipped = allProducts.length - productsToMigrate.length;
  const total = productsToMigrate.length;

  for (let i = 0; i < productsToMigrate.length; i++) {
    const p = productsToMigrate[i];

    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        currentProduct: p.name || `Product #${p.id}`,
        percentage: Math.round(((i + 1) / total) * 100)
      });
    }

    try {
      let updatedImage = p.image;
      let hasChanges = false;

      // 1. Migrate main product image if base64
      if (typeof p.image === 'string' && p.image.startsWith('data:image')) {
        const cloudUrl = await uploadImageToCloud(p.image, 'products');
        if (cloudUrl && cloudUrl.startsWith('http')) {
          updatedImage = cloudUrl;
          hasChanges = true;
        }
      }

      // 2. Migrate variant images if base64
      let updatedVariants = p.variants;
      if (Array.isArray(p.variants) && p.variants.length > 0) {
        const newVariants: ProductVariant[] = [];
        for (const v of p.variants) {
          if (typeof v.image === 'string' && v.image.startsWith('data:image')) {
            const vCloudUrl = await uploadImageToCloud(v.image, 'variants');
            if (vCloudUrl && vCloudUrl.startsWith('http')) {
              newVariants.push({ ...v, image: vCloudUrl });
              hasChanges = true;
              continue;
            }
          }
          newVariants.push(v);
        }
        updatedVariants = newVariants;
      }

      // 3. Save updated URLs back to Firestore
      if (hasChanges) {
        const docRef = doc(db, 'products', p.id);
        const updates: Partial<Product> = {
          image: updatedImage
        };
        if (updatedVariants) {
          updates.variants = updatedVariants;
        }
        await updateDoc(docRef, updates);
        success++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`Failed to migrate product ${p.name}:`, err);
      failed++;
    }

    // Small delay between migrations for smooth rate limiting
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return { success, failed, skipped };
}
