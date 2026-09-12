import { ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { storage, db } from '../firebase';
import { Product, ProductVariant } from '../types';
import { compressImage } from './localProductStorage';

/**
 * Convert a base64 Data URL to a Blob
 */
function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Generate a clean safe storage path
 */
function generateFileName(prefix: string, ext = 'jpg'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}/${timestamp}_${random}.${ext}`;
}

/**
 * Upload a single image (File or Base64) to Firebase Storage and return its public CDN URL.
 * Falls back safely to compressed base64 if Firebase Storage encounters an error.
 */
export async function uploadImageToCloud(
  fileOrBase64: File | string,
  folder = 'products'
): Promise<string> {
  if (!fileOrBase64) return '';

  // If it's already an http/https URL, no need to re-upload
  if (typeof fileOrBase64 === 'string' && (fileOrBase64.startsWith('http://') || fileOrBase64.startsWith('https://'))) {
    return fileOrBase64;
  }

  try {
    // 1. Compress image to clean lightweight JPEG (max 700px, 0.75 quality)
    const compressedBase64 = await compressImage(fileOrBase64, 700, 700, 0.75);
    if (!compressedBase64) return typeof fileOrBase64 === 'string' ? fileOrBase64 : '';

    const blob = dataURLtoBlob(compressedBase64);
    const storagePath = generateFileName(folder, 'jpg');
    const storageRef = ref(storage, storagePath);

    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000'
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error) {
    console.warn('Firebase Storage upload notice, using compressed local fallback:', error);
    // Fallback: return compressed base64 so functionality is never broken
    if (typeof fileOrBase64 === 'string' && fileOrBase64.startsWith('data:image')) {
      return fileOrBase64;
    }
    return await compressImage(fileOrBase64, 600, 600, 0.72);
  }
}

export interface MigrationProgress {
  current: number;
  total: number;
  currentProduct: string;
  percentage: number;
}

/**
 * Magic Migration Tool:
 * Scans all products in Firestore. Finds any products or variants with embedded Base64 images,
 * uploads each image to Firebase Storage, replaces it with the lightweight public URL,
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

    // Small delay between migrations to prevent rate limits
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { success, failed, skipped };
}
