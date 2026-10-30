import React, { useState, useMemo } from 'react';
import { Product, ShopInfo } from '../types';
import { Language } from '../translations';
import {
  FileText, Download, Check, Search, Filter, Printer, Eye, Sliders,
  Layers, Package, DollarSign, TrendingUp, CheckSquare, Square,
  Sparkles, Table, FileSpreadsheet, X, ArrowUpDown
} from 'lucide-react';
import { filterAndRankProducts } from '../utils/productSearch';
import { getLogoUrl } from '../constants/brand';

interface CatalogGeneratorProps {
  products: Product[];
  lang: Language;
  shopInfo?: ShopInfo;
  hidePurchasePrices?: boolean;
}

export interface CatalogColumnsConfig {
  showIndex: boolean;
  showImage: boolean;
  showBarcode: boolean;
  showCategory: boolean;
  showDescription: boolean;
  showVariants: boolean;
  showSellingPrice: boolean;
  showPurchasePrice: boolean;
  showProfitMargin: boolean;
  showStockQty: boolean;
  showStockStatus: boolean;
  showTotalPurchaseValue: boolean;
  showTotalSellingValue: boolean;
  showExpiryDate: boolean;
}

type SortOption =
  | 'name_asc'
  | 'price_asc'
  | 'price_desc'
  | 'stock_desc'
  | 'stock_asc'
  | 'category_asc';

type StockFilterOption = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';

type PresetType = 'client_catalog' | 'admin_inventory' | 'price_list' | 'custom';

export default function CatalogGenerator({ products, lang, shopInfo, hidePurchasePrices = false }: CatalogGeneratorProps) {
  const isRtl = lang === 'ar';

  // Active valid products
  const validProducts = useMemo(() => products.filter((p) => !p.isDeleted), [products]);

  // Default: select all in-stock products initially or let user choose
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    () => new Set(validProducts.map((p) => p.id))
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<StockFilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('category_asc');

  // Preset & Layout options
  const [activePreset, setActivePreset] = useState<PresetType>('client_catalog');
  const [groupByCategory, setGroupByCategory] = useState<boolean>(true);
  const [showSummaryCards, setShowSummaryCards] = useState<boolean>(true);
  const [showTableTotals, setShowTableTotals] = useState<boolean>(true);
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [customTitle, setCustomTitle] = useState<string>(
    isRtl ? 'كتالوج المنتجات وقائمة الأسعار' : 'Catalogue des Produits & Tarifs'
  );
  const [customSubtitle, setCustomSubtitle] = useState<string>(
    isRtl
      ? 'قائمة تفصيلية للمستلزمات والمعدات الطبية المتوفرة'
      : 'Liste détaillée des consommables et équipements dentaires'
  );
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);

  // Column visibility state
  const [columns, setColumns] = useState<CatalogColumnsConfig>({
    showIndex: true,
    showImage: false,
    showBarcode: false,
    showCategory: false,
    showDescription: false,
    showVariants: true,
    showSellingPrice: true,
    showPurchasePrice: false,
    showProfitMargin: false,
    showStockQty: true,
    showStockStatus: true,
    showTotalPurchaseValue: false,
    showTotalSellingValue: false,
    showExpiryDate: false
  });

  const applyPreset = (preset: PresetType) => {
    setActivePreset(preset);
    if (preset === 'client_catalog') {
      setCustomTitle(isRtl ? 'كتالوج المنتجات وقائمة الأسعار' : 'Catalogue des Produits & Tarifs');
      setCustomSubtitle(
        isRtl
          ? 'قائمة تفصيلية للمستلزمات والمعدات الطبية المتوفرة'
          : 'Liste détaillée des consommables et équipements dentaires'
      );
      setGroupByCategory(true);
      setShowSummaryCards(true);
      setShowTableTotals(false);
      setPageOrientation('portrait');
      setColumns({
        showIndex: true,
        showImage: true,
        showBarcode: false,
        showCategory: false,
        showDescription: false,
        showVariants: true,
        showSellingPrice: true,
        showPurchasePrice: false,
        showProfitMargin: false,
        showStockQty: false,
        showStockStatus: true,
        showTotalPurchaseValue: false,
        showTotalSellingValue: false,
        showExpiryDate: false
      });
    } else if (preset === 'admin_inventory') {
      setCustomTitle(isRtl ? 'تقرير الجرد الشامل والتقييم المالي للمخزون' : 'Rapport d\'Inventaire & Valorisation du Stock');
      setCustomSubtitle(
        isRtl
          ? 'تقرير إداري مفصل يتضمن أسعار الشراء والبيع والكميات المتبقية والأرباح المتوقعة'
          : 'Rapport administratif détaillé incluant prix d\'achat, vente, quantités et marges'
      );
      setGroupByCategory(true);
      setShowSummaryCards(true);
      setShowTableTotals(true);
      setPageOrientation('landscape');
      setColumns({
        showIndex: true,
        showImage: false,
        showBarcode: true,
        showCategory: false,
        showDescription: false,
        showVariants: true,
        showSellingPrice: true,
        showPurchasePrice: true,
        showProfitMargin: true,
        showStockQty: true,
        showStockStatus: false,
        showTotalPurchaseValue: true,
        showTotalSellingValue: true,
        showExpiryDate: true
      });
    } else if (preset === 'price_list') {
      setCustomTitle(isRtl ? 'قائمة الأسعار والكميات المختصرة' : 'Liste de Prix & Stock Compacte');
      setCustomSubtitle(isRtl ? 'جدول مرجعي سريع للأسعار والكميات المتوفرة' : 'Tableau de référence rapide des prix et disponibilités');
      setGroupByCategory(true);
      setShowSummaryCards(false);
      setShowTableTotals(true);
      setPageOrientation('portrait');
      setColumns({
        showIndex: true,
        showImage: false,
        showBarcode: true,
        showCategory: false,
        showDescription: false,
        showVariants: true,
        showSellingPrice: true,
        showPurchasePrice: false,
        showProfitMargin: false,
        showStockQty: true,
        showStockStatus: true,
        showTotalPurchaseValue: false,
        showTotalSellingValue: false,
        showExpiryDate: false
      });
    }
  };

  const toggleColumn = (key: keyof CatalogColumnsConfig) => {
    setActivePreset('custom');
    setColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Get unique categories
  const categories = useMemo(
    () => Array.from(new Set(validProducts.map((p) => p.category))).filter(Boolean),
    [validProducts]
  );

  // Helper to get effective selling price (taking discount into account)
  const getEffectiveSellingPrice = (p: Product) => {
    if (p.discountPercent && p.discountPercent > 0) {
      return Math.round(p.price * (1 - p.discountPercent / 100));
    }
    return Number(p.price) || 0;
  };

  // Helper to get effective stock (sum of variants if variable product)
  const getEffectiveStock = (p: Product) => {
    if (p.isVariable && p.variants && p.variants.length > 0) {
      return p.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    }
    return Number(p.stock) || 0;
  };

  // Filter products for selection list
  const filteredProducts = useMemo(() => {
    let list = filterAndRankProducts(validProducts, searchTerm, categoryFilter);

    if (stockFilter === 'in_stock') {
      list = list.filter((p) => getEffectiveStock(p) > 0);
    } else if (stockFilter === 'low_stock') {
      list = list.filter((p) => {
        const st = getEffectiveStock(p);
        const threshold = p.lowStockAlert ?? 5;
        return st > 0 && st <= threshold;
      });
    } else if (stockFilter === 'out_of_stock') {
      list = list.filter((p) => getEffectiveStock(p) <= 0);
    }

    return list;
  }, [validProducts, searchTerm, categoryFilter, stockFilter]);

  // Selected products sorted according to sortBy
  const orderedSelectedProducts = useMemo(() => {
    const list = validProducts.filter((p) => selectedProducts.has(p.id));
    return [...list].sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'price_asc') return getEffectiveSellingPrice(a) - getEffectiveSellingPrice(b);
      if (sortBy === 'price_desc') return getEffectiveSellingPrice(b) - getEffectiveSellingPrice(a);
      if (sortBy === 'stock_desc') return getEffectiveStock(b) - getEffectiveStock(a);
      if (sortBy === 'stock_asc') return getEffectiveStock(a) - getEffectiveStock(b);
      // category_asc
      const catCmp = (a.category || '').localeCompare(b.category || '');
      if (catCmp !== 0) return catCmp;
      return a.name.localeCompare(b.name);
    });
  }, [validProducts, selectedProducts, sortBy]);

  // Compute financial & stock summary for selected products
  const catalogStats = useMemo(() => {
    let totalItems = orderedSelectedProducts.length;
    let totalStockUnits = 0;
    let totalPurchaseValue = 0;
    let totalSellingValue = 0;
    let inStockCount = 0;
    let outOfStockCount = 0;
    const categoriesSet = new Set<string>();

    orderedSelectedProducts.forEach((p) => {
      if (p.category) categoriesSet.add(p.category);

      if (p.isVariable && p.variants && p.variants.length > 0) {
        const varStock = p.variants.reduce((s, v) => s + Math.max(0, Number(v.stock) || 0), 0);
        if (varStock > 0) inStockCount++;
        else outOfStockCount++;

        p.variants.forEach((v) => {
          const st = Math.max(0, Number(v.stock) || 0);
          const sell = Number(v.price) || getEffectiveSellingPrice(p);
          const buy = Number(v.purchasePrice ?? p.purchasePrice) || 0;
          totalStockUnits += st;
          totalPurchaseValue += st * buy;
          totalSellingValue += st * sell;
        });
      } else {
        const st = Math.max(0, Number(p.stock) || 0);
        if (st > 0) inStockCount++;
        else outOfStockCount++;

        const sell = getEffectiveSellingPrice(p);
        const buy = Number(p.purchasePrice) || 0;
        totalStockUnits += st;
        totalPurchaseValue += st * buy;
        totalSellingValue += st * sell;
      }
    });

    const expectedProfit = totalSellingValue - totalPurchaseValue;

    return {
      totalItems,
      categoriesCount: categoriesSet.size,
      totalStockUnits,
      totalPurchaseValue,
      totalSellingValue,
      expectedProfit,
      inStockCount,
      outOfStockCount
    };
  }, [orderedSelectedProducts]);

  const toggleProduct = (productId: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      filteredProducts.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const selectOnlyInStock = () => {
    const inStockIds = validProducts.filter((p) => getEffectiveStock(p) > 0).map((p) => p.id);
    setSelectedProducts(new Set(inStockIds));
  };

  const deselectAll = () => {
    setSelectedProducts(new Set());
  };

  const fmtNum = (num: number) =>
    new Intl.NumberFormat(isRtl ? 'ar-DZ' : 'fr-FR').format(Math.round(num || 0));

  const currency = isRtl ? 'دج' : 'DA';

  // Generate standalone HTML for print / PDF / preview
  const buildCatalogHTML = (withPrintToolbar: boolean): string => {
    const companyName = shopInfo?.companyName || 'JUST SMILE';
    const companyActivity =
      shopInfo?.activity ||
      (isRtl ? 'بيع مستلزمات ومعدات طب الأسنان' : 'Vente de consommables et matériel dentaire');
    const companyPhone = shopInfo?.phone || '0770821021';
    const companyEmail = shopInfo?.email || 'justsmile0169@gmail.com';
    const companyAddress = shopInfo?.address || 'Algeria, Djelfa';
    const logoUrl = getLogoUrl();

    const dateStr = new Date().toLocaleDateString(isRtl ? 'ar-DZ' : 'fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeStr = new Date().toLocaleTimeString(isRtl ? 'ar-DZ' : 'fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Group products by category if groupByCategory is enabled
    const groups: { categoryName: string; items: Product[] }[] = [];
    if (groupByCategory) {
      const map = new Map<string, Product[]>();
      orderedSelectedProducts.forEach((p) => {
        const cat = p.category || (isRtl ? 'أخرى' : 'Autres');
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat)!.push(p);
      });
      map.forEach((items, categoryName) => {
        groups.push({ categoryName, items });
      });
    } else {
      groups.push({
        categoryName: isRtl ? 'جميع المنتجات المحددة' : 'Tous les produits sélectionnés',
        items: orderedSelectedProducts
      });
    }

    // Build table header cells dynamically based on chosen columns
    const buildTableHeaders = () => {
      const ths: string[] = [];
      if (columns.showIndex) ths.push(`<th style="width: 38px; text-align: center;">#</th>`);
      if (columns.showImage) ths.push(`<th style="width: 52px; text-align: center;">${isRtl ? 'الصورة' : 'Image'}</th>`);
      if (columns.showBarcode) ths.push(`<th style="width: 105px;">${isRtl ? 'الباركود / المرجع' : 'Code / Réf'}</th>`);
      ths.push(`<th>${isRtl ? 'اسم المنتج والبيانات' : 'Désignation du Produit'}</th>`);
      if (columns.showCategory && !groupByCategory) {
        ths.push(`<th>${isRtl ? 'الفئة' : 'Catégorie'}</th>`);
      }
      if (columns.showStockQty) {
        ths.push(`<th style="text-align: center;">${isRtl ? 'الكمية المتبقية' : 'Qté Restante'}</th>`);
      }
      if (columns.showStockStatus) {
        ths.push(`<th style="text-align: center;">${isRtl ? 'حالة التوفر' : 'Disponibilité'}</th>`);
      }
      if (columns.showPurchasePrice) {
        ths.push(`<th>${isRtl ? 'سعر الشراء' : 'Prix d\'Achat'}</th>`);
      }
      if (columns.showSellingPrice) {
        ths.push(`<th>${isRtl ? 'سعر البيع' : 'Prix de Vente'}</th>`);
      }
      if (columns.showProfitMargin) {
        ths.push(`<th>${isRtl ? 'ربح الوحدة' : 'Marge Unitaire'}</th>`);
      }
      if (columns.showTotalPurchaseValue) {
        ths.push(`<th>${isRtl ? 'إجمالي الشراء' : 'Total Achat'}</th>`);
      }
      if (columns.showTotalSellingValue) {
        ths.push(`<th>${isRtl ? 'إجمالي البيع' : 'Total Vente'}</th>`);
      }
      if (columns.showExpiryDate) {
        ths.push(`<th style="text-align: center;">${isRtl ? 'تاريخ الصلاحية' : 'Expiration'}</th>`);
      }
      return ths.join('');
    };

    // Build rows for a group of products
    const buildGroupTableHTML = (groupItems: Product[], groupTitle: string, groupIdx: number) => {
      let groupStock = 0;
      let groupPurchaseTotal = 0;
      let groupSellingTotal = 0;

      const rowsHTML = groupItems
        .map((p, idx) => {
          const effSellPrice = getEffectiveSellingPrice(p);
          const hasDiscount = (p.discountPercent || 0) > 0;
          const buyPrice = Number(p.purchasePrice) || 0;
          const stockQty = getEffectiveStock(p);

          // Compute product totals (accounting for variants if variable)
          let prodPurchaseVal = 0;
          let prodSellingVal = 0;
          if (p.isVariable && p.variants && p.variants.length > 0) {
            p.variants.forEach((v) => {
              const vst = Math.max(0, Number(v.stock) || 0);
              const vsell = Number(v.price) || effSellPrice;
              const vbuy = Number(v.purchasePrice ?? p.purchasePrice) || 0;
              prodPurchaseVal += vst * vbuy;
              prodSellingVal += vst * vsell;
            });
          } else {
            const st = Math.max(0, stockQty);
            prodPurchaseVal = st * buyPrice;
            prodSellingVal = st * effSellPrice;
          }

          groupStock += Math.max(0, stockQty);
          groupPurchaseTotal += prodPurchaseVal;
          groupSellingTotal += prodSellingVal;

          const unitProfit = effSellPrice - buyPrice;
          const profitPct = buyPrice > 0 ? Math.round((unitProfit / buyPrice) * 100) : null;

          // Stock status badge
          const lowThreshold = p.lowStockAlert ?? 5;
          let statusBadge = '';
          if (stockQty <= 0) {
            statusBadge = `<span class="badge badge-out">${isRtl ? 'نفذت الكمية' : 'Rupture'}</span>`;
          } else if (stockQty <= lowThreshold) {
            statusBadge = `<span class="badge badge-low">${isRtl ? 'مخزون منخفض' : 'Stock faible'}</span>`;
          } else {
            statusBadge = `<span class="badge badge-in">${isRtl ? 'متوفر' : 'Disponible'}</span>`;
          }

          // Variants pills/table if enabled
          let variantsHTML = '';
          if (columns.showVariants && p.isVariable && p.variants && p.variants.length > 0) {
            const vPills = p.variants
              .map((v) => {
                const vPriceStr = columns.showSellingPrice ? ` — <b>${fmtNum(v.price)} ${currency}</b>` : '';
                const vBuyStr =
                  columns.showPurchasePrice && v.purchasePrice
                    ? ` (${isRtl ? 'شراء:' : 'Achat:'} ${fmtNum(v.purchasePrice)} ${currency})`
                    : '';
                const vStockStr = columns.showStockQty ? ` [${isRtl ? 'الكمية:' : 'Qté:'} ${v.stock}]` : '';
                return `<span class="variant-chip">${v.name}${vPriceStr}${vBuyStr}${vStockStr}</span>`;
              })
              .join('');
            variantsHTML = `<div class="variants-wrap">${vPills}</div>`;
          }

          const descHTML =
            columns.showDescription && p.description
              ? `<div class="prod-desc">${p.description.slice(0, 140)}${p.description.length > 140 ? '...' : ''}</div>`
              : '';

          const cells: string[] = [];

          if (columns.showIndex) {
            cells.push(`<td style="text-align: center; font-weight: 800; color: #64748b;">${idx + 1}</td>`);
          }

          if (columns.showImage) {
            const imgTag = p.image
              ? `<img src="${p.image}" alt="" class="prod-thumb" />`
              : `<div class="prod-thumb-placeholder">🦷</div>`;
            cells.push(`<td style="text-align: center;">${imgTag}</td>`);
          }

          if (columns.showBarcode) {
            cells.push(
              `<td style="font-family: monospace; font-size: 11px; color: #334155; font-weight: 700;">${
                p.barcode || '-'
              }</td>`
            );
          }

          // Product Name + optional description + optional variants
          cells.push(`
            <td>
              <div class="prod-name">${p.name}</div>
              ${descHTML}
              ${variantsHTML}
            </td>
          `);

          if (columns.showCategory && !groupByCategory) {
            cells.push(`<td><span class="cat-pill">${p.category || '-'}</span></td>`);
          }

          if (columns.showStockQty) {
            const qtyColor = stockQty <= 0 ? '#dc2626' : stockQty <= lowThreshold ? '#d97706' : '#0f172a';
            cells.push(
              `<td style="text-align: center; font-weight: 900; color: ${qtyColor}; font-size: 13px;">${fmtNum(
                stockQty
              )}</td>`
            );
          }

          if (columns.showStockStatus) {
            cells.push(`<td style="text-align: center;">${statusBadge}</td>`);
          }

          if (columns.showPurchasePrice) {
            cells.push(
              `<td style="font-weight: 700; color: #475569; white-space: nowrap;">${
                buyPrice > 0 ? `${fmtNum(buyPrice)} ${currency}` : '-'
              }</td>`
            );
          }

          if (columns.showSellingPrice) {
            const origPriceHTML = hasDiscount
              ? `<div style="font-size: 10px; color: #94a3b8; text-decoration: line-through;">${fmtNum(
                  p.price
                )} ${currency} (-${p.discountPercent}%)</div>`
              : '';
            cells.push(`
              <td style="white-space: nowrap;">
                <div style="font-weight: 900; color: #0891b2; font-size: 13px;">${fmtNum(effSellPrice)} ${currency}</div>
                ${origPriceHTML}
              </td>
            `);
          }

          if (columns.showProfitMargin) {
            if (buyPrice > 0) {
              const pColor = unitProfit >= 0 ? '#059669' : '#dc2626';
              cells.push(`
                <td style="white-space: nowrap;">
                  <div style="font-weight: 800; color: ${pColor};">${unitProfit >= 0 ? '+' : ''}${fmtNum(
                unitProfit
              )} ${currency}</div>
                  ${
                    profitPct !== null
                      ? `<div style="font-size: 10px; color: #64748b; font-weight: 700;">(${profitPct}%)</div>`
                      : ''
                  }
                </td>
              `);
            } else {
              cells.push(`<td style="color: #94a3b8;">-</td>`);
            }
          }

          if (columns.showTotalPurchaseValue) {
            cells.push(
              `<td style="font-weight: 800; color: #334155; white-space: nowrap;">${fmtNum(
                prodPurchaseVal
              )} ${currency}</td>`
            );
          }

          if (columns.showTotalSellingValue) {
            cells.push(
              `<td style="font-weight: 900; color: #0f766e; white-space: nowrap;">${fmtNum(
                prodSellingVal
              )} ${currency}</td>`
            );
          }

          if (columns.showExpiryDate) {
            cells.push(
              `<td style="text-align: center; font-size: 11px; font-weight: 700; color: #475569; white-space: nowrap;">${
                p.expiryDate || '-'
              }</td>`
            );
          }

          return `<tr>${cells.join('')}</tr>`;
        })
        .join('');

      // Category section subtotal row if showTableTotals is enabled
      let subtotalRowHTML = '';
      if (
        showTableTotals &&
        (columns.showStockQty || columns.showTotalPurchaseValue || columns.showTotalSellingValue)
      ) {
        let leadingCols = 1; // Product name col
        if (columns.showIndex) leadingCols++;
        if (columns.showImage) leadingCols++;
        if (columns.showBarcode) leadingCols++;
        if (columns.showCategory && !groupByCategory) leadingCols++;

        const subCells: string[] = [];
        subCells.push(
          `<td colspan="${leadingCols}" style="text-align: ${
            isRtl ? 'left' : 'right'
          }; font-weight: 900; color: #0f172a;">${
            isRtl ? `مجموع الفئة (${groupItems.length} منتج):` : `Sous-total (${groupItems.length} réf.):`
          }</td>`
        );

        if (columns.showStockQty) {
          subCells.push(
            `<td style="text-align: center; font-weight: 900; color: #0f172a;">${fmtNum(groupStock)}</td>`
          );
        }
        if (columns.showStockStatus) subCells.push(`<td></td>`);
        if (columns.showPurchasePrice) subCells.push(`<td></td>`);
        if (columns.showSellingPrice) subCells.push(`<td></td>`);
        if (columns.showProfitMargin) {
          const grpProfit = groupSellingTotal - groupPurchaseTotal;
          subCells.push(
            `<td style="font-weight: 900; color: #059669; white-space: nowrap;">${
              groupPurchaseTotal > 0 ? `+${fmtNum(grpProfit)} ${currency}` : ''
            }</td>`
          );
        }
        if (columns.showTotalPurchaseValue) {
          subCells.push(
            `<td style="font-weight: 900; color: #1e293b; white-space: nowrap;">${fmtNum(
              groupPurchaseTotal
            )} ${currency}</td>`
          );
        }
        if (columns.showTotalSellingValue) {
          subCells.push(
            `<td style="font-weight: 900; color: #0f766e; white-space: nowrap;">${fmtNum(
              groupSellingTotal
            )} ${currency}</td>`
          );
        }
        if (columns.showExpiryDate) subCells.push(`<td></td>`);

        subtotalRowHTML = `<tr class="subtotal-row">${subCells.join('')}</tr>`;
      }

      return `
        <div class="category-section">
          <div class="category-banner">
            <div class="category-banner-title">
              <span class="category-num">${groupIdx + 1}</span>
              <span>${groupTitle}</span>
            </div>
            <div class="category-banner-meta">
              <span>${groupItems.length} ${isRtl ? 'صنف / منتج' : 'produit(s)'}</span>
              ${
                columns.showStockQty
                  ? `<span>• ${isRtl ? 'إجمالي الوحدات:' : 'Total unités:'} ${fmtNum(groupStock)}</span>`
                  : ''
              }
            </div>
          </div>
          <table class="catalog-table">
            <thead>
              <tr>${buildTableHeaders()}</tr>
            </thead>
            <tbody>
              ${rowsHTML}
              ${subtotalRowHTML}
            </tbody>
          </table>
        </div>
      `;
    };

    const allGroupsHTML = groups
      .map((g, i) => buildGroupTableHTML(g.items, g.categoryName, i))
      .join('');

    // Summary KPI cards at top of document
    let kpiCardsHTML = '';
    if (showSummaryCards) {
      const cards: string[] = [
        `
          <div class="kpi-card">
            <div class="kpi-label">${isRtl ? 'إجمالي الأصناف بالكتالوج' : 'Total Références'}</div>
            <div class="kpi-val" style="color: #0891b2;">${fmtNum(catalogStats.totalItems)}</div>
            <div class="kpi-sub">${catalogStats.categoriesCount} ${isRtl ? 'فئات' : 'catégories'} • ${
          catalogStats.inStockCount
        } ${isRtl ? 'متوفر' : 'en stock'}</div>
          </div>
        `
      ];

      if (columns.showStockQty) {
        cards.push(`
          <div class="kpi-card">
            <div class="kpi-label">${isRtl ? 'إجمالي الوحدات المتبقية' : 'Total Unités en Stock'}</div>
            <div class="kpi-val" style="color: #0f172a;">${fmtNum(catalogStats.totalStockUnits)}</div>
            <div class="kpi-sub">${isRtl ? 'مجموع الكميات المتوفرة' : 'Cumul des quantités'}</div>
          </div>
        `);
      }

      if (columns.showPurchasePrice || columns.showTotalPurchaseValue) {
        cards.push(`
          <div class="kpi-card">
            <div class="kpi-label">${isRtl ? 'قيمة المخزون (بسعر الشراء)' : 'Valeur Stock (Prix d\'Achat)'}</div>
            <div class="kpi-val" style="color: #475569;">${fmtNum(catalogStats.totalPurchaseValue)} ${currency}</div>
            <div class="kpi-sub">${isRtl ? 'رأس المال في المخزون المحدد' : 'Coût total d\'acquisition'}</div>
          </div>
        `);
      }

      if (columns.showTotalSellingValue || columns.showPurchasePrice || columns.showProfitMargin) {
        cards.push(`
          <div class="kpi-card">
            <div class="kpi-label">${isRtl ? 'قيمة المخزون (بسعر البيع)' : 'Valeur Stock (Prix de Vente)'}</div>
            <div class="kpi-val" style="color: #0f766e;">${fmtNum(catalogStats.totalSellingValue)} ${currency}</div>
            <div class="kpi-sub">${
              columns.showProfitMargin || columns.showPurchasePrice
                ? `${isRtl ? 'الربح المتوقع:' : 'Marge prévue:'} +${fmtNum(catalogStats.expectedProfit)} ${currency}`
                : isRtl
                ? 'إجمالي المبيعات المتوقعة'
                : 'Chiffre d\'affaires potentiel'
            }</div>
          </div>
        `);
      }

      kpiCardsHTML = `<div class="kpi-grid">${cards.join('')}</div>`;
    }

    return `<!DOCTYPE html>
<html lang="${lang}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8" />
  <title>${customTitle} - ${companyName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 ${pageOrientation};
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
      background: ${withPrintToolbar ? '#f1f5f9' : '#ffffff'};
      color: #0f172a;
      direction: ${isRtl ? 'rtl' : 'ltr'};
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 999;
      background: #0f172a;
      color: #fff;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 14px rgba(0,0,0,0.15);
    }
    .print-toolbar-actions {
      display: flex;
      gap: 10px;
    }
    .btn-print {
      background: #06b6d4;
      color: #fff;
      border: none;
      padding: 8px 18px;
      border-radius: 10px;
      font-family: inherit;
      font-weight: 800;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-close {
      background: #334155;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 10px;
      font-family: inherit;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
    .page-container {
      max-width: ${pageOrientation === 'landscape' ? '277mm' : '210mm'};
      margin: ${withPrintToolbar ? '20px auto' : '0 auto'};
      background: #ffffff;
      padding: ${withPrintToolbar ? '24px' : '8px'};
      border-radius: ${withPrintToolbar ? '16px' : '0'};
      box-shadow: ${withPrintToolbar ? '0 10px 30px rgba(15, 23, 42, 0.08)' : 'none'};
    }
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding-bottom: 16px;
      margin-bottom: 18px;
      border-bottom: 3px solid #06b6d4;
    }
    .brand-block {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo {
      width: 58px;
      height: 58px;
      object-fit: contain;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      padding: 4px;
      background: #fff;
    }
    .company-name {
      font-size: 22px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.3px;
    }
    .company-sub {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
    }
    .company-contact {
      font-size: 11px;
      color: #475569;
      font-weight: 700;
      margin-top: 3px;
    }
    .title-block {
      text-align: ${isRtl ? 'left' : 'right'};
    }
    .catalog-title {
      font-size: 19px;
      font-weight: 900;
      color: #0891b2;
    }
    .catalog-subtitle {
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      margin-top: 2px;
    }
    .catalog-date {
      font-size: 10px;
      font-weight: 700;
      color: #94a3b8;
      margin-top: 4px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 10px 14px;
    }
    .kpi-label {
      font-size: 10px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
    }
    .kpi-val {
      font-size: 17px;
      font-weight: 900;
      margin: 2px 0;
    }
    .kpi-sub {
      font-size: 10px;
      font-weight: 700;
      color: #94a3b8;
    }
    .category-section {
      margin-bottom: 22px;
      page-break-inside: auto;
    }
    .category-banner {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 10px 10px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #06b6d4;
      page-break-after: avoid;
    }
    .category-banner-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 900;
    }
    .category-num {
      background: #06b6d4;
      color: #fff;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 900;
    }
    .category-banner-meta {
      font-size: 11px;
      font-weight: 700;
      color: #cbd5e1;
      display: flex;
      gap: 6px;
    }
    .catalog-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #cbd5e1;
      font-size: 11.5px;
    }
    .catalog-table thead {
      display: table-header-group;
    }
    .catalog-table th {
      background: #f1f5f9;
      color: #1e293b;
      font-weight: 900;
      font-size: 11px;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      text-align: ${isRtl ? 'right' : 'left'};
      white-space: nowrap;
    }
    .catalog-table td {
      padding: 7px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    .catalog-table tbody tr:nth-child(even) {
      background-color: #f8fafc;
    }
    .catalog-table tr {
      page-break-inside: avoid;
    }
    .subtotal-row td {
      background: #e0f2fe !important;
      border-top: 2px solid #0284c7 !important;
      padding: 8px 10px;
    }
    .prod-name {
      font-weight: 800;
      color: #0f172a;
      font-size: 12px;
    }
    .prod-desc {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
      line-height: 1.35;
    }
    .variants-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }
    .variant-chip {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      color: #334155;
      border-radius: 5px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 700;
    }
    .cat-pill {
      background: #ecfeff;
      color: #0e7490;
      border: 1px solid #a5f3fc;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 800;
      white-space: nowrap;
    }
    .prod-thumb {
      width: 38px;
      height: 38px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      display: inline-block;
    }
    .prod-thumb-placeholder {
      width: 38px;
      height: 38px;
      border-radius: 6px;
      background: #f1f5f9;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      white-space: nowrap;
    }
    .badge-in {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .badge-low {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .badge-out {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    .doc-footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
    }
    @media print {
      body {
        background: #ffffff;
      }
      .print-toolbar {
        display: none !important;
      }
      .page-container {
        margin: 0;
        padding: 0;
        box-shadow: none;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  ${
    withPrintToolbar
      ? `
    <div class="print-toolbar">
      <div>
        <div style="font-weight: 900; font-size: 14px;">${customTitle}</div>
        <div style="font-size: 11px; color: #94a3b8;">${
          isRtl
            ? 'جاهز للطباعة أو الحفظ بصيغة PDF بجودة عالية'
            : 'Prêt pour impression ou enregistrement PDF haute qualité'
        }</div>
      </div>
      <div class="print-toolbar-actions">
        <button class="btn-print" onclick="window.print()">
          ${isRtl ? 'طباعة / حفظ كملف PDF 🖨️' : 'Imprimer / Enregistrer PDF 🖨️'}
        </button>
        <button class="btn-close" onclick="window.close()">
          ${isRtl ? 'إغلاق ✕' : 'Fermer ✕'}
        </button>
      </div>
    </div>
  `
      : ''
  }

  <div class="page-container">
    <!-- Document Header -->
    <div class="doc-header">
      <div class="brand-block">
        <img src="${logoUrl}" alt="${companyName}" class="brand-logo" onerror="this.style.display='none'" />
        <div>
          <div class="company-name">${companyName}</div>
          <div class="company-sub">${companyActivity}</div>
          <div class="company-contact">
            📞 ${companyPhone} &nbsp;|&nbsp; 📍 ${companyAddress} &nbsp;|&nbsp; ✉️ ${companyEmail}
          </div>
        </div>
      </div>
      <div class="title-block">
        <div class="catalog-title">${customTitle}</div>
        ${customSubtitle ? `<div class="catalog-subtitle">${customSubtitle}</div>` : ''}
        <div class="catalog-date">
          ${isRtl ? 'تاريخ الاستخراج:' : 'Date d\'édition:'} ${dateStr} — ${timeStr}
        </div>
      </div>
    </div>

    <!-- Summary KPI Cards -->
    ${kpiCardsHTML}

    <!-- Grouped or Unified Product Tables -->
    ${allGroupsHTML}

    <!-- Document Footer -->
    <div class="doc-footer">
      <span>${companyName} — ${customTitle}</span>
      <span>${
        isRtl
          ? `إجمالي الأصناف المدرجة: ${fmtNum(catalogStats.totalItems)} منتج`
          : `Total produits listés: ${fmtNum(catalogStats.totalItems)}`
      }</span>
      <span>${dateStr}</span>
    </div>
  </div>
</body>
</html>`;
  };

  const handleOpenPrintCatalog = () => {
    if (orderedSelectedProducts.length === 0) return;
    const printWin = window.open('', '_blank');
    if (!printWin) {
      window.alert(
        isRtl
          ? 'يرجى السماح بالنوافذ المنبثقة (Popups) لفتح صفحة طباعة وتصدير الكتالوج.'
          : 'Veuillez autoriser les fenêtres surgissantes (popups) pour exporter le catalogue.'
      );
      return;
    }
    printWin.document.open();
    printWin.document.write(buildCatalogHTML(true));
    printWin.document.close();
  };

  // Export selected products & chosen columns to Excel-compatible UTF-8 CSV
  const handleExportCSV = () => {
    if (orderedSelectedProducts.length === 0) return;

    const headers: string[] = [];
    if (columns.showIndex) headers.push('#');
    if (columns.showBarcode) headers.push(isRtl ? 'الباركود' : 'Code-barres');
    headers.push(isRtl ? 'اسم المنتج' : 'Produit');
    if (columns.showCategory || groupByCategory) headers.push(isRtl ? 'الفئة' : 'Catégorie');
    if (columns.showVariants) headers.push(isRtl ? 'الخيارات / المقاسات' : 'Variantes');
    if (columns.showStockQty) headers.push(isRtl ? 'الكمية المتبقية' : 'Quantité Restante');
    if (columns.showStockStatus) headers.push(isRtl ? 'حالة التوفر' : 'Disponibilité');
    if (columns.showPurchasePrice) headers.push(isRtl ? `سعر الشراء (${currency})` : `Prix d'Achat (${currency})`);
    if (columns.showSellingPrice) headers.push(isRtl ? `سعر البيع (${currency})` : `Prix de Vente (${currency})`);
    if (columns.showProfitMargin) headers.push(isRtl ? `ربح الوحدة (${currency})` : `Marge Unitaire (${currency})`);
    if (columns.showTotalPurchaseValue) headers.push(isRtl ? `إجمالي الشراء (${currency})` : `Total Achat (${currency})`);
    if (columns.showTotalSellingValue) headers.push(isRtl ? `إجمالي البيع (${currency})` : `Total Vente (${currency})`);
    if (columns.showExpiryDate) headers.push(isRtl ? 'تاريخ الصلاحية' : 'Date d\'expiration');

    const escapeCSV = (val: string | number) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = orderedSelectedProducts.map((p, idx) => {
      const effSell = getEffectiveSellingPrice(p);
      const buy = Number(p.purchasePrice) || 0;
      const st = getEffectiveStock(p);
      const unitProfit = effSell - buy;
      const totalBuy = Math.max(0, st) * buy;
      const totalSell = Math.max(0, st) * effSell;

      const row: (string | number)[] = [];
      if (columns.showIndex) row.push(idx + 1);
      if (columns.showBarcode) row.push(p.barcode || '');
      row.push(p.name);
      if (columns.showCategory || groupByCategory) row.push(p.category || '');
      if (columns.showVariants) {
        row.push(
          p.isVariable && p.variants && p.variants.length > 0
            ? p.variants.map((v) => `${v.name} (${v.price} ${currency} | Qté:${v.stock})`).join(' / ')
            : ''
        );
      }
      if (columns.showStockQty) row.push(st);
      if (columns.showStockStatus) {
        row.push(st > 0 ? (isRtl ? 'متوفر' : 'Disponible') : isRtl ? 'نفذت' : 'Rupture');
      }
      if (columns.showPurchasePrice) row.push(buy > 0 ? buy : '');
      if (columns.showSellingPrice) row.push(effSell);
      if (columns.showProfitMargin) row.push(buy > 0 ? unitProfit : '');
      if (columns.showTotalPurchaseValue) row.push(totalBuy);
      if (columns.showTotalSellingValue) row.push(totalSell);
      if (columns.showExpiryDate) row.push(p.expiryDate || '');

      return row.map(escapeCSV).join(';');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `just-smile-catalog-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columnOptionDefs = useMemo(() => {
    const allDefs: {
      key: keyof CatalogColumnsConfig;
      labelAr: string;
      labelFr: string;
      badge?: string;
    }[] = [
      { key: 'showIndex', labelAr: 'الرقم التسلسلي (#)', labelFr: 'Numéro (#)' },
      { key: 'showImage', labelAr: 'صورة المنتج المصغرة', labelFr: 'Miniature Image' },
      { key: 'showBarcode', labelAr: 'الباركود / المرجع', labelFr: 'Code-barres / Réf' },
      { key: 'showVariants', labelAr: 'الخيارات والمقاسات', labelFr: 'Variantes & Tailles' },
      { key: 'showDescription', labelAr: 'الوصف المختصر للمنتج', labelFr: 'Description courte' },
      { key: 'showSellingPrice', labelAr: 'سعر البيع', labelFr: 'Prix de Vente', badge: 'أساسي' },
      { key: 'showPurchasePrice', labelAr: 'سعر الشراء (التكلفة)', labelFr: 'Prix d\'Achat', badge: 'إداري' },
      { key: 'showProfitMargin', labelAr: 'ربح الوحدة وهامش الربح %', labelFr: 'Marge bénéficiaire', badge: 'إداري' },
      { key: 'showStockQty', labelAr: 'الكمية المتبقية بالعدد', labelFr: 'Quantité restante exacte' },
      { key: 'showStockStatus', labelAr: 'حالة التوفر (متوفر / نفذت)', labelFr: 'Statut de disponibilité' },
      { key: 'showTotalPurchaseValue', labelAr: 'إجمالي قيمة الشراء للمخزون', labelFr: 'Valeur totale d\'achat', badge: 'إداري' },
      { key: 'showTotalSellingValue', labelAr: 'إجمالي قيمة البيع للمخزون', labelFr: 'Valeur totale de vente', badge: 'إداري' },
      { key: 'showExpiryDate', labelAr: 'تاريخ انتهاء الصلاحية', labelFr: 'Date d\'expiration' }
    ];
    if (hidePurchasePrices) {
      return allDefs.filter(
        (d) =>
          d.key !== 'showPurchasePrice' &&
          d.key !== 'showProfitMargin' &&
          d.key !== 'showTotalPurchaseValue'
      );
    }
    return allDefs;
  }, [hidePurchasePrices]);

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top Header & Quick Stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-cyan/10 rounded-2xl text-brand-cyan">
            <Table size={26} />
          </div>
          <div>
            <h3 className="text-lg md:text-xl font-black text-slate-900">
              {isRtl ? 'مولد الكتالوج وتقارير جرد المخزون الاحترافي' : 'Générateur de Catalogue & Rapports de Stock Pro'}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {isRtl
                ? 'صمّم جداول الأسعار أو تقارير الجرد المالي (بيع، شراء، كميات متبقية، أرباح) مع تحكم كامل في الأعمدة والعناوين'
                : 'Concevez vos tableaux de tarifs ou rapports d\'inventaire avec contrôle total des colonnes et sections'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            disabled={orderedSelectedProducts.length === 0}
            className="px-4 py-2.5 rounded-xl font-extrabold text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Eye size={16} className="text-brand-cyan" />
            <span>{isRtl ? 'معاينة الجدول مباشرة' : 'Aperçu en direct'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={orderedSelectedProducts.length === 0}
            className="px-4 py-2.5 rounded-xl font-extrabold text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
          >
            <FileSpreadsheet size={16} />
            <span>{isRtl ? 'تصدير Excel (CSV)' : 'Exporter Excel (CSV)'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenPrintCatalog}
            disabled={orderedSelectedProducts.length === 0}
            className="px-5 py-2.5 rounded-xl font-extrabold text-xs bg-brand-cyan hover:bg-brand-cyan/90 text-white shadow-sm flex items-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Printer size={16} />
            <span>{isRtl ? 'استخراج وطباعة الكتالوج (PDF)' : 'Générer & Imprimer PDF'}</span>
          </button>
        </div>
      </div>

      {/* Step 1: Ready Presets (قوالب سريعة جاهزة) */}
      <div className="bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
            <Sparkles size={15} className="text-brand-cyan" />
            <span>{isRtl ? '1. اختر قالباً جاهزاً أو خصص أعمدتك بحرية:' : '1. Choisissez un modèle rapide ou personnalisez :'}</span>
          </h4>
          <span className="text-[11px] font-bold text-slate-400">
            {isRtl ? 'يمكنك تعديل أي عمود بعد اختيار القالب' : 'Modifiable à tout moment'}
          </span>
        </div>

        <div className={`grid grid-cols-1 ${hidePurchasePrices ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-3`}>
          <button
            type="button"
            onClick={() => applyPreset('client_catalog')}
            className={`p-3.5 rounded-xl border text-right rtl:text-right ltr:text-left transition-all cursor-pointer ${
              activePreset === 'client_catalog'
                ? 'bg-white border-brand-cyan ring-2 ring-brand-cyan/20 shadow-xs'
                : 'bg-white/70 border-slate-200 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black text-slate-900">
                {isRtl ? '📘 كتالوج الزبائن والأطباء (سعر البيع فقط)' : '📘 Catalogue Clients (Prix de vente)'}
              </span>
              {activePreset === 'client_catalog' && <Check size={15} className="text-brand-cyan" />}
            </div>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              {isRtl
                ? 'جداول مصنفة حسب الفئات تعرض صورة المنتج، الاسم، الخيارات، سعر البيع وحالة التوفر (بدون أسعار الشراء).'
                : 'Tableaux par catégorie avec image, nom, variantes, prix de vente et disponibilité.'}
            </p>
          </button>

          {!hidePurchasePrices && (
            <button
              type="button"
              onClick={() => applyPreset('admin_inventory')}
              className={`p-3.5 rounded-xl border text-right rtl:text-right ltr:text-left transition-all cursor-pointer ${
                activePreset === 'admin_inventory'
                  ? 'bg-white border-brand-cyan ring-2 ring-brand-cyan/20 shadow-xs'
                  : 'bg-white/70 border-slate-200 hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-black text-slate-900">
                  {isRtl ? '📊 جرد الإدارة الشامل (شراء + بيع + كميات + أرباح)' : '📊 Inventaire Admin (Achat + Vente + Stock + Marges)'}
                </span>
                {activePreset === 'admin_inventory' && <Check size={15} className="text-brand-cyan" />}
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                {isRtl
                  ? 'تقرير مالي وإداري متكامل يعرض الكمية المتبقية، سعر الشراء، سعر البيع، ربح الوحدة، وإجمالي رأس المال والأرباح.'
                  : 'Rapport complet incluant quantité restante, prix d\'achat, prix de vente, marge et valorisation totale.'}
              </p>
            </button>
          )}

          <button
            type="button"
            onClick={() => applyPreset('price_list')}
            className={`p-3.5 rounded-xl border text-right rtl:text-right ltr:text-left transition-all cursor-pointer ${
              activePreset === 'price_list'
                ? 'bg-white border-brand-cyan ring-2 ring-brand-cyan/20 shadow-xs'
                : 'bg-white/70 border-slate-200 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black text-slate-900">
                {isRtl ? '📋 قائمة الأسعار والكميات المختصرة' : '📋 Liste de Prix & Quantités Compacte'}
              </span>
              {activePreset === 'price_list' && <Check size={15} className="text-brand-cyan" />}
            </div>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              {isRtl
                ? 'جدول سريع وواضح بدون صور يتضمن الباركود، اسم المنتج، الخيارات، الكمية المتبقية وسعر البيع.'
                : 'Tableau compact sans images avec code-barres, désignation, quantité restante et prix de vente.'}
            </p>
          </button>
        </div>
      </div>

      {/* Step 2: Column Selection & Document Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Column Picker (2 cols) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
              <Sliders size={15} className="text-brand-cyan" />
              <span>{isRtl ? '2. اختر الأعمدة والبيانات التي تريد إظهارها في الجدول:' : '2. Colonnes à inclure dans le tableau :'}</span>
            </h4>
            <span className="text-[11px] font-bold text-brand-cyan bg-brand-cyan/10 px-2.5 py-0.5 rounded-full">
              {Object.values(columns).filter(Boolean).length} {isRtl ? 'عمود مفعّل' : 'colonnes actives'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {columnOptionDefs.map((col) => {
              const checked = columns[col.key];
              return (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => toggleColumn(col.key)}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    checked
                      ? 'bg-brand-cyan/5 border-brand-cyan text-slate-900'
                      : 'bg-slate-50/60 border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                        checked ? 'bg-brand-cyan border-brand-cyan text-white' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {checked && <Check size={11} />}
                    </div>
                    <span className="truncate">{isRtl ? col.labelAr : col.labelFr}</span>
                  </div>
                  {col.badge && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold shrink-0 ${
                        col.badge === 'إداري'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-cyan-100 text-cyan-800'
                      }`}
                    >
                      {col.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Title & Layout Options (1 col) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3.5">
          <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5 border-b border-slate-100 pb-3">
            <Layers size={15} className="text-brand-cyan" />
            <span>{isRtl ? '3. عناوين وتنظيم الكتالوج:' : '3. Titres & Organisation :'}</span>
          </h4>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500">
              {isRtl ? 'عنوان الكتالوج / التقرير الرئيسي:' : 'Titre principal du document :'}
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500">
              {isRtl ? 'العنوان الفرعي / ملاحظة الترويسة:' : 'Sous-titre / Note d\'en-tête :'}
            </label>
            <input
              type="text"
              value={customSubtitle}
              onChange={(e) => setCustomSubtitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500">
                {isRtl ? 'اتجاه الصفحة:' : 'Orientation :'}
              </label>
              <select
                value={pageOrientation}
                onChange={(e) => setPageOrientation(e.target.value as 'portrait' | 'landscape')}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
              >
                <option value="portrait">{isRtl ? 'عمودي (Portrait)' : 'Portrait (Vertical)'}</option>
                <option value="landscape">{isRtl ? 'أفقي (Landscape)' : 'Paysage (Horizontal)'}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500">
                {isRtl ? 'ترتيب المنتجات:' : 'Trier par :'}
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
              >
                <option value="category_asc">{isRtl ? 'الفئة ثم الاسم' : 'Catégorie puis Nom'}</option>
                <option value="name_asc">{isRtl ? 'الاسم (أبجدياً)' : 'Nom (A-Z)'}</option>
                <option value="price_asc">{isRtl ? 'السعر (الأقل أولاً)' : 'Prix (Croissant)'}</option>
                <option value="price_desc">{isRtl ? 'السعر (الأعلى أولاً)' : 'Prix (Décroissant)'}</option>
                <option value="stock_desc">{isRtl ? 'الكمية (الأكثر توفراً)' : 'Stock (Plus élevé)'}</option>
                <option value="stock_asc">{isRtl ? 'الكمية (الأقل توفراً)' : 'Stock (Plus faible)'}</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={groupByCategory}
                onChange={(e) => setGroupByCategory(e.target.checked)}
                className="rounded border-slate-300 text-brand-cyan focus:ring-brand-cyan"
              />
              <span>{isRtl ? 'تقسيم إلى جداول وعناوين مستقلة لكل فئة' : 'Grouper en tableaux par catégorie'}</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showSummaryCards}
                onChange={(e) => setShowSummaryCards(e.target.checked)}
                className="rounded border-slate-300 text-brand-cyan focus:ring-brand-cyan"
              />
              <span>{isRtl ? 'إظهار بطاقات الملخص الإحصائي والمالي أعلى الكتالوج' : 'Afficher les cartes de synthèse en haut'}</span>
            </label>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showTableTotals}
                onChange={(e) => setShowTableTotals(e.target.checked)}
                className="rounded border-slate-300 text-brand-cyan focus:ring-brand-cyan"
              />
              <span>{isRtl ? 'إظهار صف المجموع الفرعي أسفل كل جدول' : 'Afficher la ligne des sous-totaux par tableau'}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Live Financial & Stock Summary Bar for Selected Products */}
      <div className={`grid grid-cols-2 ${hidePurchasePrices ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-3`}>
        <div className="bg-cyan-50/70 border border-cyan-200 rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-cyan-700 text-[11px] font-black">
            <Package size={15} />
            <span>{isRtl ? 'الأصناف المحددة للكتالوج' : 'Produits Sélectionnés'}</span>
          </div>
          <p className="text-lg font-black text-slate-900 mt-1">
            {fmtNum(catalogStats.totalItems)} <span className="text-xs font-bold text-slate-500">/ {fmtNum(validProducts.length)}</span>
          </p>
          <p className="text-[10px] font-bold text-cyan-700">
            {catalogStats.inStockCount} {isRtl ? 'متوفر' : 'en stock'} • {catalogStats.outOfStockCount} {isRtl ? 'نافذ' : 'rupture'}
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-slate-600 text-[11px] font-black">
            <Layers size={15} />
            <span>{isRtl ? 'إجمالي الوحدات المتبقية' : 'Total Unités Restantes'}</span>
          </div>
          <p className="text-lg font-black text-slate-900 mt-1">{fmtNum(catalogStats.totalStockUnits)}</p>
          <p className="text-[10px] font-bold text-slate-400">
            {isRtl ? `موزعة على ${catalogStats.categoriesCount} فئات` : `Sur ${catalogStats.categoriesCount} catégories`}
          </p>
        </div>

        {!hidePurchasePrices && (
          <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-3.5">
            <div className="flex items-center gap-1.5 text-amber-700 text-[11px] font-black">
              <DollarSign size={15} />
              <span>{isRtl ? 'إجمالي التكلفة (بسعر الشراء)' : 'Valeur Totale d\'Achat'}</span>
            </div>
            <p className="text-lg font-black text-slate-900 mt-1">
              {fmtNum(catalogStats.totalPurchaseValue)} {currency}
            </p>
            <p className="text-[10px] font-bold text-amber-700">
              {isRtl ? 'قيمة المخزون المحدد بسعر الشراء' : 'Coût du stock sélectionné'}
            </p>
          </div>
        )}

        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-emerald-700 text-[11px] font-black">
            <TrendingUp size={15} />
            <span>{isRtl ? 'إجمالي القيمة (بسعر البيع)' : 'Valeur Totale de Vente'}</span>
          </div>
          <p className="text-lg font-black text-emerald-800 mt-1">
            {fmtNum(catalogStats.totalSellingValue)} {currency}
          </p>
          {!hidePurchasePrices && (
            <p className="text-[10px] font-bold text-emerald-600">
              {isRtl ? 'الربح المتوقع:' : 'Marge prévue:'} +{fmtNum(catalogStats.expectedProfit)} {currency}
            </p>
          )}
        </div>
      </div>

      {/* Step 3: Filter & Select Products */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
            <div className="relative flex-1">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder={isRtl ? 'ابحث عن منتج بالاسم، الفئة أو الباركود...' : 'Rechercher par nom, catégorie ou code-barres...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden focus:border-brand-cyan cursor-pointer"
            >
              <option value="all">{isRtl ? 'جميع الفئات' : 'Toutes les catégories'}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilterOption)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden focus:border-brand-cyan cursor-pointer"
            >
              <option value="all">{isRtl ? 'كل حالات التوفر' : 'Tous les états de stock'}</option>
              <option value="in_stock">{isRtl ? 'المتوفر فقط (كمية > 0)' : 'En stock uniquement (> 0)'}</option>
              <option value="low_stock">{isRtl ? 'مخزون منخفض فقط' : 'Stock faible uniquement'}</option>
              <option value="out_of_stock">{isRtl ? 'النافذ فقط (0)' : 'En rupture uniquement (0)'}</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={selectAllFiltered}
              className="px-3 py-1.5 text-[11px] font-extrabold text-brand-cyan bg-brand-cyan/10 hover:bg-brand-cyan/20 rounded-lg transition-colors cursor-pointer"
            >
              {isRtl ? `تحديد المعروض (${filteredProducts.length})` : `Sélectionner affichés (${filteredProducts.length})`}
            </button>
            <button
              type="button"
              onClick={selectOnlyInStock}
              className="px-3 py-1.5 text-[11px] font-extrabold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
            >
              {isRtl ? 'تحديد المتوفر فقط' : 'En stock uniquement'}
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="px-3 py-1.5 text-[11px] font-extrabold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
            >
              {isRtl ? 'إلغاء التحديد' : 'Tout désélectionner'}
            </button>
          </div>
        </div>

        {/* Selection Table */}
        <div className="max-h-96 overflow-y-auto">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText size={42} className="mx-auto mb-3 opacity-40" />
              <p className="text-xs font-bold">
                {isRtl ? 'لا توجد منتجات مطابقة لفلتر البحث' : 'Aucun produit ne correspond aux filtres'}
              </p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-50/90 sticky top-0 z-10 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase">
                <tr>
                  <th className="py-2.5 px-3 text-center w-10">✓</th>
                  <th className="py-2.5 px-3 text-right rtl:text-right ltr:text-left">{isRtl ? 'المنتج' : 'Produit'}</th>
                  <th className="py-2.5 px-3 text-right rtl:text-right ltr:text-left">{isRtl ? 'الفئة' : 'Catégorie'}</th>
                  <th className="py-2.5 px-3 text-center">{isRtl ? 'الكمية المتبقية' : 'Qté Restante'}</th>
                  {!hidePurchasePrices && (
                    <th className="py-2.5 px-3 text-right rtl:text-right ltr:text-left">{isRtl ? 'سعر الشراء' : 'Prix d\'Achat'}</th>
                  )}
                  <th className="py-2.5 px-3 text-right rtl:text-right ltr:text-left">{isRtl ? 'سعر البيع' : 'Prix de Vente'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const isSelected = selectedProducts.has(product.id);
                  const st = getEffectiveStock(product);
                  const effSell = getEffectiveSellingPrice(product);
                  const buy = Number(product.purchasePrice) || 0;
                  return (
                    <tr
                      key={product.id}
                      onClick={() => toggleProduct(product.id)}
                      className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                        isSelected ? 'bg-brand-cyan/5' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <div
                          className={`w-4 h-4 mx-auto rounded border flex items-center justify-center ${
                            isSelected ? 'bg-brand-cyan border-brand-cyan text-white' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check size={11} />}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-extrabold text-slate-900">{product.name}</div>
                        {product.barcode && (
                          <div className="text-[10px] font-mono text-slate-400">{product.barcode}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-bold text-[10px]">
                          {product.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            st > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {st > 0 ? `${fmtNum(st)} ${isRtl ? 'متوفر' : 'en stock'}` : isRtl ? 'نفذت (0)' : 'Rupture (0)'}
                        </span>
                      </td>
                      {!hidePurchasePrices && (
                        <td className="py-2.5 px-3 font-bold text-slate-500">
                          {buy > 0 ? `${fmtNum(buy)} ${currency}` : '-'}
                        </td>
                      )}
                      <td className="py-2.5 px-3 font-black text-brand-cyan">
                        {fmtNum(effSell)} {currency}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Live Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h4 className="font-black text-sm md:text-base">{customTitle}</h4>
                <p className="text-[11px] text-slate-400">
                  {isRtl
                    ? `معاينة حية لـ ${orderedSelectedProducts.length} منتج (${Object.values(columns).filter(Boolean).length} أعمدة)`
                    : `Aperçu en direct de ${orderedSelectedProducts.length} produits`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenPrintCatalog}
                  className="px-4 py-2 bg-brand-cyan hover:bg-brand-cyan/90 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={15} />
                  <span>{isRtl ? 'طباعة / حفظ PDF 🖨️' : 'Imprimer / Enregistrer PDF 🖨️'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-100 p-4">
              <iframe
                title="Catalog Preview"
                srcDoc={buildCatalogHTML(false)}
                className="w-full h-[72vh] bg-white rounded-2xl shadow-md border border-slate-200"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
