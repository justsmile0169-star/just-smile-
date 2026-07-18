import React, { useState } from 'react';
import { Product } from '../types';
import { Language, getTranslation } from '../translations';
import { FileText, Download, X, Check, Search, Filter } from 'lucide-react';
import jsPDF from 'jspdf';

interface CatalogGeneratorProps {
  products: Product[];
  lang: Language;
}

export default function CatalogGenerator({ products, lang }: CatalogGeneratorProps) {
  const isRtl = lang === 'ar';
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [generating, setGenerating] = useState(false);

  // Get unique categories
  const categories = Array.from(new Set(products.map(p => p.category))).filter(Boolean);

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCategory && !p.isDeleted;
  });

  const toggleProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const selectAll = () => {
    const newSelected = new Set(filteredProducts.map(p => p.id));
    setSelectedProducts(newSelected);
  };

  const deselectAll = () => {
    setSelectedProducts(new Set());
  };

  const generatePDF = async () => {
    if (selectedProducts.size === 0) return;

    setGenerating(true);
    try {
      const doc = new jsPDF();
      const selectedProductList = products.filter(p => selectedProducts.has(p.id));
      
      // Title
      doc.setFontSize(24);
      doc.setTextColor(6, 182, 212); // brand-cyan color
      doc.text('JUST SMILE', 105, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text(lang === 'fr' ? 'Catalogue des Produits' : 'كتالوج المنتجات', 105, 30, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ'), 105, 38, { align: 'center' });

      // Products
      let yPosition = 50;
      const pageHeight = 280;
      
      selectedProductList.forEach((product, index) => {
        if (yPosition > pageHeight) {
          doc.addPage();
          yPosition = 20;
        }

        // Product name
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(`${index + 1}. ${product.name}`, 20, yPosition);
        yPosition += 8;

        // Category
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`Category: ${product.category}`, 25, yPosition);
        yPosition += 6;

        // Price
        doc.setFontSize(10);
        doc.setTextColor(6, 182, 212);
        const price = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(product.price);
        doc.text(`${price} DZD`, 25, yPosition);
        yPosition += 6;

        // Stock
        doc.setFontSize(9);
        if (product.stock > 0) {
          doc.setTextColor(34, 197, 94);
          doc.text(lang === 'fr' ? `En stock: ${product.stock}` : `متوفر: ${product.stock}`, 25, yPosition);
        } else {
          doc.setTextColor(239, 68, 68);
          doc.text(lang === 'fr' ? 'Rupture de stock' : 'نفذت الكمية', 25, yPosition);
        }
        yPosition += 10;

        // Separator
        doc.setDrawColor(200, 200, 200);
        doc.line(20, yPosition, 190, yPosition);
        yPosition += 10;
      });

      // Footer
      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `${lang === 'fr' ? 'Page' : 'صفحة'} ${i} / ${pageCount}`,
          105,
          290,
          { align: 'center' }
        );
      }

      doc.save(`just-smile-catalog-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-cyan/10 rounded-xl">
            <FileText size={24} className="text-brand-cyan" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">
              {lang === 'fr' ? 'Générateur de Catalogue' : 'مولد الكتالوج'}
            </h3>
            <p className="text-xs text-slate-500">
              {lang === 'fr' 
                ? `${selectedProducts.size} produit(s) sélectionné(s)` 
                : `${selectedProducts.size} منتج(s) محدد(s)`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {lang === 'fr' ? 'Tout sélectionner' : 'تحديد الكل'}
          </button>
          <button
            onClick={deselectAll}
            className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {lang === 'fr' ? 'Tout désélectionner' : 'إلغاء التحديد'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={lang === 'fr' ? 'Rechercher un produit...' : 'البحث عن منتج...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-brand-cyan"
          />
        </div>
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-brand-cyan appearance-none cursor-pointer"
          >
            <option value="all">{lang === 'fr' ? 'Toutes les catégories' : 'جميع الفئات'}</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products List */}
      <div className="bg-white rounded-2xl border border-slate-200 max-h-96 overflow-y-auto">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <FileText size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-sm">
              {lang === 'fr' ? 'Aucun produit trouvé' : 'لم يتم العثور على منتجات'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredProducts.map(product => (
              <div
                key={product.id}
                onClick={() => toggleProduct(product.id)}
                className={`flex items-center gap-4 p-4 cursor-pointer transition-colors hover:bg-slate-50 ${
                  selectedProducts.has(product.id) ? 'bg-brand-cyan/5' : ''
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  selectedProducts.has(product.id)
                    ? 'bg-brand-cyan border-brand-cyan'
                    : 'border-slate-300'
                }`}>
                  {selectedProducts.has(product.id) && <Check size={12} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
                  <p className="text-xs text-slate-500">
                    {product.category} • {new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(product.price)} DZD
                  </p>
                </div>
                <div className={`text-xs font-bold px-2 py-1 rounded-full ${
                  product.stock > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {product.stock > 0 
                    ? (lang === 'fr' ? `${product.stock} en stock` : `${product.stock} متوفر`)
                    : (lang === 'fr' ? 'Rupture' : 'نفذت')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Button */}
      <button
        onClick={generatePDF}
        disabled={selectedProducts.size === 0 || generating}
        className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
          selectedProducts.size === 0 || generating
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-brand-cyan text-white hover:bg-brand-cyan/90 shadow-xs'
        }`}
      >
        {generating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {lang === 'fr' ? 'Génération...' : 'جاري التوليد...'}
          </>
        ) : (
          <>
            <Download size={16} />
            {lang === 'fr' ? 'Générer le PDF' : 'توليد PDF'}
          </>
        )}
      </button>
    </div>
  );
}
