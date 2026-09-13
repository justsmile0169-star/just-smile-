import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
 * Upload to ImgBB Cloud CDN (Free, zero-CORS issues, high-speed permanent URLs)
 */
async function uploadToImgBB(base64DataUrl: string): Promise<string | null> {
  try {
    const base64Clean = base64DataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const formData = new FormData();
    formData.append('image', base64Clean);

    // Reliable public ImgBB CDN endpoint
    const res = await fetch('https://api.imgbb.com/1/upload?key=6d207e021d9de7484aa17d26e5424ac2', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.data?.url) {
        return data.data.display_url || data.data.url;
      }
    }
  } catch (err) {
    console.warn('ImgBB fallback upload error:', err);
  }
  return null;
}

/**
 * Multi-Tier Cloud Image Uploader:
 * 1. Tries Firebase Storage
 * 2. If Firebase Storage fails (CORS or permissions), uploads to ImgBB Cloud CDN
 * 3. If offline, falls back to lightweight compressed base64 (~30KB)
 */
export async function uploadImageToCloud(
  fileOrBase64: File | string,
  folder = 'products'
): Promise<string> {
  if (!fileOrBase64) return '';

  // If it's already an external http/https URL, no need to re-upload
  if (typeof fileOrBase64 === 'string' && (fileOrBase64.startsWith('http://') || fileOrBase64.startsWith('https://'))) {
    return fileOrBase64;
  }

  // 1. First, compress image down to max 650px & ~30KB
  const compressedBase64 = await compressImage(fileOrBase64, 650, 650, 0.74);
  if (!compressedBase64) return typeof fileOrBase64 === 'string' ? fileOrBase64 : '';

  // 2. Try Firebase Storage
  try {
    const blob = dataURLtoBlob(compressedBase64);
    const storagePath = generateFileName(folder, 'jpg');
    const storageRef = ref(storage, storagePath);

    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000'
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);
    if (downloadUrl && downloadUrl.startsWith('http')) {
      return downloadUrl;
    }
  } catch (firebaseErr) {
    console.warn('Firebase Storage encountered CORS/config notice, switching to ImgBB Cloud CDN:', firebaseErr);
  }

  // 3. Try ImgBB Cloud CDN fallback
  try {
    const imgbbUrl = await uploadToImgBB(compressedBase64);
    if (imgbbUrl && imgbbUrl.startsWith('http')) {
      return imgbbUrl;
    }
  } catch (imgbbErr) {
    console.warn('ImgBB CDN notice:', imgbbErr);
  }

  // 4. Safe fallback to compressed base64
  return compressedBase64;
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
 * uploads each image to Cloud Storage, replaces it with the lightweight public URL,
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
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { success, failed, skipped };
}
