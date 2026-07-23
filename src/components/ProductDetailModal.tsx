import React, { useState } from 'react';
import { Product, ProductVariant } from '../types';
import { Language, getTranslation } from '../translations';
import { X, Award, AlertCircle, ShoppingCart, Check } from 'lucide-react';

interface ProductDetailModalProps {
  product: Product;
  lang: Language;
  onClose: () => void;
  onAddToCart: (product: Product, selectedVariant?: ProductVariant) => void;
}

export default function ProductDetailModal({
  product,
  lang,
  onClose,
  onAddToCart
}: ProductDetailModalProps) {
  const isRtl = lang === 'ar';

  // Selected variant state for variable products
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(() => {
    if (product.isVariable && product.variants && product.variants.length > 0) {
      return product.variants[0];
    }
    return null;
  });

  // Track attribute selections (e.g., { "Couleur": "A1", "Taille": "4g" })
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>(() => {
    if (product.isVariable && product.attributes && product.attributes.length > 0) {
      const initial: Record<string, string> = {};
      product.attributes.forEach((attr) => {
        if (attr.options.length > 0) {
          initial[attr.name] = attr.options[0];
        }
      });
      return initial;
    }
    return {};
  });

  // When attribute selection changes, resolve matching variant
  const handleSelectAttribute = (attrName: string, optionValue: string) => {
    const updated = { ...selectedAttributes, [attrName]: optionValue };
    setSelectedAttributes(updated);

    if (product.variants && product.variants.length > 0) {
      const matched = product.variants.find((v) => {
        return Object.entries(updated).every(([key, val]) => v.attributes?.[key] === val);
      });
      if (matched) {
        setSelectedVariant(matched);
      } else {
        // Fallback: match by variant ID or first variant with that attribute value
        const partialMatch = product.variants.find((v) => v.attributes?.[attrName] === optionValue);
        setSelectedVariant(partialMatch || product.variants[0]);
      }
    }
  };

  const formatPrice = (num: number) => {
    if (num === 0 || num === undefined || num === null) return '-';
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' ' + getTranslation(lang, 'currency');
  };

  // Determine current active price and stock
  const currentBasePrice = selectedVariant ? selectedVariant.price : product.price;
  const currentStock = selectedVariant ? selectedVariant.stock : product.stock;
  const currentImage = selectedVariant?.image || product.image;

  const hasProductDiscount = product.discountPercent && product.discountPercent > 0;
  const finalPrice = hasProductDiscount
    ? Math.round(currentBasePrice * (1 - (product.discountPercent || 0) / 100))
    : currentBasePrice;

  const isOutOfStock = currentStock <= 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-800 text-base md:text-lg">
              {product.category}
            </span>
            {product.isVariable && (
              <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2.5 py-0.5 rounded-full border border-purple-200">
                {lang === 'fr' ? 'Produit Variable' : 'منتج متغير الخيارات'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 md:p-8 overflow-y-auto max-h-[70vh] space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left/Right Image depending on RTL */}
            <div className="w-full md:w-1/2 h-56 bg-slate-100 rounded-2xl overflow-hidden relative border border-slate-100 shrink-0 flex items-center justify-center">
              <img
                src={currentImage && String(currentImage) !== '0' ? currentImage : 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300'}
                alt={product.name}
                className="object-cover w-full h-full"
                referrerPolicy="no-referrer"
              />
              {hasProductDiscount && (
                <span className={`absolute top-3 ${isRtl ? 'right-3' : 'left-3'} bg-rose-500 text-white font-black text-xs px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md`}>
                  <Award size={12} />
                  -{product.discountPercent}%
                </span>
              )}
            </div>

            {/* Price block and Quick specs */}
            <div className="flex-1 flex flex-col justify-between space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1 leading-snug">
                  {product.name}
                </h2>
                {selectedVariant && (
                  <p className="text-xs font-bold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg inline-block border border-purple-100">
                    {lang === 'fr' ? `Option: ${selectedVariant.name}` : `الخيار المحدد: ${selectedVariant.name}`}
                  </p>
                )}

                {product.expiryDate && (
                  <p className="text-xs text-rose-500 font-semibold mt-2 bg-rose-50 px-2.5 py-1 rounded-lg inline-block">
                    {lang === 'fr'
                      ? `Date d'expiration: ${product.expiryDate}`
                      : `تاريخ انتهاء الصلاحية: ${product.expiryDate}`}
                  </p>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex flex-col">
                  {hasProductDiscount && (
                    <span className="text-xs text-slate-400 line-through">
                      {formatPrice(currentBasePrice)}
                    </span>
                  )}
                  <span className="text-2xl font-black text-brand-dark">
                    {formatPrice(finalPrice)}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isOutOfStock ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`} />
                  <span className="text-xs font-semibold text-slate-600">
                    {isOutOfStock
                      ? getTranslation(lang, 'outOfStock')
                      : (lang === 'fr' ? `En stock (${currentStock} disponible)` : `متوفر في المخزون (${currentStock} قطعة)`)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Variable Product Attribute Selection Section */}
          {product.isVariable && product.attributes && product.attributes.length > 0 && (
            <div className="space-y-4 p-4 bg-purple-50/50 rounded-2xl border border-purple-100">
              <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <span>{lang === 'fr' ? 'Sélectionnez les options' : 'اختر خصائص المنتج المطلوبة'}</span>
              </h3>

              <div className="space-y-3">
                {product.attributes.map((attr) => (
                  <div key={attr.name} className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      {attr.name} :
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {attr.options.map((option) => {
                        const isSelected = selectedAttributes[attr.name] === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => handleSelectAttribute(attr.name, option)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all border flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50'
                            }`}
                          >
                            {isSelected && <Check size={14} />}
                            <span>{option}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Direct Variants List fallback selector if attributes are simple */}
              {product.variants && product.variants.length > 1 && (
                <div className="pt-2 border-t border-purple-100">
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    {lang === 'fr' ? 'Ou choisir un modèle direct' : 'أو اختر النموذج الجاهز مباشرة'}:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {product.variants.map((v) => {
                      const isVSelected = selectedVariant?.id === v.id;
                      const vDiscount = product.discountPercent || 0;
                      const vFinalPrice = vDiscount > 0 ? Math.round(v.price * (1 - vDiscount / 100)) : v.price;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setSelectedVariant(v);
                            if (v.attributes) setSelectedAttributes(v.attributes);
                          }}
                          className={`p-2.5 rounded-xl text-xs text-right border flex items-center justify-between transition-all ${
                            isVSelected
                              ? 'bg-purple-600 text-white border-purple-600 font-bold shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300'
                          }`}
                        >
                          <span className="truncate max-w-[140px]">{v.name}</span>
                          <span className="font-black">{formatPrice(vFinalPrice)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <h3 className="font-bold text-slate-800 text-sm md:text-base">
              {lang === 'fr' ? 'Description' : 'الوصف'}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
              {product.description || (lang === 'fr' ? 'Aucune description disponible.' : 'لا يوجد وصف متاح لهذا المنتج.')}
            </p>
          </div>

          {/* Technical sheet */}
          {product.technicalSheet && (
            <div className="space-y-2 pt-4 border-t border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm md:text-base flex items-center gap-1.5">
                <AlertCircle size={16} className="text-brand-cyan" />
                {getTranslation(lang, 'technicalSheet')}
              </h3>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs md:text-sm text-slate-600 font-medium space-y-1">
                {product.technicalSheet.split(';').map((spec, index) => (
                  <div key={index} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                    <span>{spec.split(':')[0]}</span>
                    <span className="font-bold text-slate-800">{spec.split(':')[1] || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
          <button
            onClick={() => {
              onAddToCart(product, selectedVariant || undefined);
              onClose();
            }}
            disabled={isOutOfStock}
            className={`w-full md:w-auto font-bold text-sm px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
              isOutOfStock
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-brand-cyan text-white hover:bg-brand-cyan/90 shadow-xs'
            }`}
          >
            <ShoppingCart size={16} />
            {getTranslation(lang, 'addToCart')}
          </button>
        </div>
      </div>
    </div>
  );
}
