import { Product } from '../types';

/**
 * Enhanced Normalization for Arabic, French, and English:
 * - Strips all Arabic diacritics (tashkeel), tatweel, normalizes alef, ta marbuta, ya/alif maqsura
 * - Normalizes French accents (é, è, ê, à, ç, etc.)
 * - Strips redundant punctuation/symbols while preserving alphanumeric tokens
 */
export function normalizeSearchText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove Arabic tashkeel / harakat
    .replace(/\u0640/g, '') // remove tatweel / kashida (ـ)
    .replace(/[أإآٱٲٵ]/g, 'ا') // normalize all alef variants to bare alef
    .replace(/ة/g, 'ه') // normalize ta marbuta to ha for fuzzy equivalence
    .replace(/[ىيئ]/g, 'ي') // normalize ya / alif maqsura / ya with hamza
    .replace(/ؤ/g, 'و') // normalize waw with hamza
    .replace(/ء/g, '') // strip standalone hamza
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove French/Latin diacritics
    .replace(/['"`,.\-_/\\()\[\]{}#+*&;:|~!?]/g, ' ') // replace punctuation with space to allow word separation
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .trim();
}

/**
 * Generate search variants for a single query token:
 * - Direct normalized token
 * - If Arabic starts with 'ال' (definite article), also include without 'ال' (e.g. 'الكمبوزيت' -> 'كمبوزيت')
 * - If token does NOT start with 'ال', also test with 'ال' (e.g. 'كمبوزيت' -> 'الكمبوزيت')
 * - If token starts with 'لل' (e.g. 'للأسنان' -> 'اسنان' / 'الاسنان')
 * - If token starts with 'و' or 'ب' or 'ف' (Arabic conjunction prefixes)
 * - Compact alphanumeric version (e.g. 'k-file' -> 'kfile')
 */
export function getQueryTokenVariants(token: string): string[] {
  const normalized = normalizeSearchText(token);
  if (!normalized) return [];

  const variants = new Set<string>();
  variants.add(normalized);

  // Compact variant without spaces
  const compact = normalized.replace(/\s+/g, '');
  if (compact) variants.add(compact);

  // Arabic 'ال' (Al-) prefix handling
  if (normalized.startsWith('ال') && normalized.length > 3) {
    variants.add(normalized.slice(2)); // without 'ال'
  } else if (!normalized.startsWith('ال') && /^[\u0600-\u06FF]/.test(normalized) && normalized.length >= 3) {
    variants.add('ال' + normalized); // with 'ال'
  }

  // Arabic 'لل' prefix handling (e.g. للأسنان -> اسنان / الاسنان)
  if (normalized.startsWith('لل') && normalized.length > 4) {
    variants.add(normalized.slice(2));
    variants.add('ال' + normalized.slice(2));
  }

  // Arabic 'و' or 'ب' or 'ف' prefix handling (e.g. والمعقمات -> معقمات / المعقمات)
  if ((normalized.startsWith('و') || normalized.startsWith('ب') || normalized.startsWith('ف')) && normalized.length > 4 && /^[\u0600-\u06FF]/.test(normalized)) {
    const stripped = normalized.slice(1);
    variants.add(stripped);
    if (stripped.startsWith('ال') && stripped.length > 3) {
      variants.add(stripped.slice(2));
    }
  }

  return Array.from(variants).filter(Boolean);
}

/**
 * Check if a product matches a search query.
 * Matches if ALL search tokens match somewhere in product name, description, category, barcode, variants, attributes, etc.
 * Supports matching anywhere inside words (start, middle, end)!
 */
export function matchProductSearch(product: Product, query: string, selectedCategory?: string): boolean {
  if (selectedCategory && selectedCategory !== 'all') {
    const prodCatNorm = normalizeSearchText(product.category || '');
    const selCatNorm = normalizeSearchText(selectedCategory);
    if (product.category !== selectedCategory && prodCatNorm !== selCatNorm) {
      return false;
    }
  }

  const cleanQuery = query.trim();
  if (!cleanQuery) return true;

  const rawTokens = cleanQuery.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return true;

  // Build searchable corpus
  const nameNorm = normalizeSearchText(product.name || '');
  const categoryNorm = normalizeSearchText(product.category || '');
  const descNorm = normalizeSearchText(product.description || '');
  const barcodeNorm = normalizeSearchText(product.barcode || '');
  const techSheetNorm = normalizeSearchText(product.technicalSheet || '');
  
  const variantTokens = (product.variants || []).map(v => 
    normalizeSearchText(`${v.name || ''} ${v.barcode || ''} ${Object.values(v.attributes || {}).join(' ')}`)
  ).join(' ');

  const attributeTokens = (product.attributes || []).map(a => 
    normalizeSearchText(`${a.name || ''} ${(a.options || []).join(' ')}`)
  ).join(' ');

  const fullCorpus = `${nameNorm} ${categoryNorm} ${descNorm} ${barcodeNorm} ${techSheetNorm} ${variantTokens} ${attributeTokens}`;
  const compactName = nameNorm.replace(/\s+/g, '');
  const compactCorpus = fullCorpus.replace(/\s+/g, '');

  // For every search token entered by the user, at least one of its variants must be found in the product corpus
  return rawTokens.every((rawToken) => {
    const tokenVariants = getQueryTokenVariants(rawToken);
    return tokenVariants.some((variant) => {
      if (!variant) return false;
      const compactVariant = variant.replace(/\s+/g, '');
      return (
        nameNorm.includes(variant) ||
        compactName.includes(compactVariant) ||
        fullCorpus.includes(variant) ||
        compactCorpus.includes(compactVariant)
      );
    });
  });
}

/**
 * Score a product for ranking search results.
 * Higher score = higher relevance in search results!
 * Priorities:
 * - Matches in product name: very high score (whether start, middle, or end of name)
 * - Exact phrase match in name: massive bonus
 * - Matches all query tokens in name: huge bonus
 * - Matches in category / barcode: medium score
 * - Matches in description / variants: base score
 */
export function scoreProductSearch(product: Product, query: string): number {
  const cleanQuery = query.trim();
  if (!cleanQuery) return 0;

  const rawTokens = cleanQuery.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return 0;

  let score = 0;
  const nameNorm = normalizeSearchText(product.name || '');
  const normQuery = normalizeSearchText(cleanQuery);
  const compactName = nameNorm.replace(/\s+/g, '');
  const compactQuery = normQuery.replace(/\s+/g, '');

  // Exact full name match
  if (nameNorm === normQuery || compactName === compactQuery) {
    score += 1000;
  }
  // Name starts with full query
  else if (nameNorm.startsWith(normQuery) || compactName.startsWith(compactQuery)) {
    score += 500;
  }
  // Name contains full query as a continuous substring (middle or end)
  else if (nameNorm.includes(normQuery) || compactName.includes(compactQuery)) {
    score += 300;
  }

  // Token-by-token scoring
  let nameMatchesCount = 0;
  const nameWords = nameNorm.split(/\s+/).filter(Boolean);

  for (const rawToken of rawTokens) {
    const variants = getQueryTokenVariants(rawToken);
    let tokenMatchedInName = false;

    for (const variant of variants) {
      if (!variant) continue;
      
      // Check if any word in name is exactly this token
      if (nameWords.includes(variant)) {
        score += 80;
        tokenMatchedInName = true;
        break;
      }
      // Check if any word in name starts with this token
      else if (nameWords.some(w => w.startsWith(variant))) {
        score += 50;
        tokenMatchedInName = true;
        break;
      }
      // Check if any word in name contains this token (middle or end of word)
      else if (nameNorm.includes(variant) || compactName.includes(variant.replace(/\s+/g, ''))) {
        score += 35;
        tokenMatchedInName = true;
        break;
      }
    }

    if (tokenMatchedInName) {
      nameMatchesCount++;
    } else {
      // Check category, barcode, variants, description
      const catNorm = normalizeSearchText(product.category || '');
      const barcodeNorm = normalizeSearchText(product.barcode || '');
      const descNorm = normalizeSearchText(product.description || '');

      for (const variant of variants) {
        if (barcodeNorm && barcodeNorm.includes(variant)) {
          score += 40;
          break;
        } else if (catNorm && catNorm.includes(variant)) {
          score += 20;
          break;
        } else if (descNorm && descNorm.includes(variant)) {
          score += 10;
          break;
        }
      }
    }
  }

  // If ALL tokens match somewhere in product name, give huge bonus
  if (nameMatchesCount === rawTokens.length && rawTokens.length > 0) {
    score += 250;
  }

  // Slight boost for products with positive stock
  if (product.stock && product.stock > 0) {
    score += 15;
  }

  // Slight boost for popular products with sales count
  if (product.salesCount && product.salesCount > 0) {
    score += Math.min(product.salesCount, 20);
  }

  return score;
}

/**
 * Check if a product has available stock (considering simple products & variable products)
 */
export function isProductInStock(product: Product): boolean {
  if (!product) return false;
  if (product.isVariable && Array.isArray(product.variants) && product.variants.length > 0) {
    const totalVariantStock = product.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    if (totalVariantStock > 0) return true;
  }
  return (Number(product.stock) || 0) > 0;
}

/**
 * Filter and sort products by stock availability, search relevance, and optional category.
 * Out-of-stock products are ALWAYS placed at the very end of the list.
 */
export function filterAndRankProducts(
  products: Product[],
  query: string,
  selectedCategory?: string
): Product[] {
  const trimmed = query.trim();

  // If no query and no category filter (or 'all'), sort in-stock first
  if (!trimmed && (!selectedCategory || selectedCategory === 'all')) {
    return [...products].sort((a, b) => {
      const inStockA = isProductInStock(a) ? 1 : 0;
      const inStockB = isProductInStock(b) ? 1 : 0;
      if (inStockA !== inStockB) return inStockB - inStockA; // in-stock first, out-of-stock last
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }

  const matching = products.filter((p) => matchProductSearch(p, trimmed, selectedCategory));

  // If no query string, only category filtered, return matched list with in-stock first
  if (!trimmed) {
    return matching.sort((a, b) => {
      const inStockA = isProductInStock(a) ? 1 : 0;
      const inStockB = isProductInStock(b) ? 1 : 0;
      if (inStockA !== inStockB) return inStockB - inStockA; // in-stock first, out-of-stock last
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }

  // Sort matched products: in-stock ALWAYS first, then by search relevance score descending
  return matching.sort((a, b) => {
    const inStockA = isProductInStock(a) ? 1 : 0;
    const inStockB = isProductInStock(b) ? 1 : 0;
    if (inStockA !== inStockB) {
      return inStockB - inStockA; // in-stock products appear first, out-of-stock ALWAYS at the end
    }

    const scoreB = scoreProductSearch(b, trimmed);
    const scoreA = scoreProductSearch(a, trimmed);
    return scoreB - scoreA;
  });
}
