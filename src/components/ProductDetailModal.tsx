import React, { useState } from 'react';
import { Product, ProductVariant } from '../types';
import { Language, getTranslation } from '../translations';
import { X, Award, AlertCircle, ShoppingCart, Check } from 'lucide-react';

// ── Color Shade Mapping Utility ──────────────────────────────────────────────
const COLOR_MAP: Record<string, { bg: string; border?: string; darkCheck?: boolean }> = {
  // Dental Tooth Shades
  'A1': { bg: '#F7F4E9', border: '#E2DEC9', darkCheck: true },
  'A2': { bg: '#F3ECBE', border: '#DED5A1', darkCheck: true },
  'A3': { bg: '#E9DD9C', border: '#D5C782', darkCheck: true },
  'A3.5': { bg: '#E2CE82', border: '#CBB467', darkCheck: true },
  'A4': { bg: '#DABE6D', border: '#C2A350', darkCheck: true },
  'B1': { bg: '#FAF8F0', border: '#E7E4D6', darkCheck: true },
  'B2': { bg: '#F1E6BD', border: '#D9CB9B', darkCheck: true },
  'B3': { bg: '#E7D59A', border: '#CDBA7C', darkCheck: true },
  'C1': { bg: '#E7E4D5', border: '#D0CDBB', darkCheck: true },
  'C2': { bg: '#DACFB5', border: '#C3B69B', darkCheck: true },
  'C3': { bg: '#C9BB9A', border: '#B1A280', darkCheck: true },
  'D2': { bg: '#ECE3CE', border: '#D3C9B0', darkCheck: true },
  'D3': { bg: '#DFD1AF', border: '#C6B793', darkCheck: true },
  'BL': { bg: '#FFFFFF', border: '#CBD5E1', darkCheck: true },
  'BLEACH': { bg: '#FFFFFF', border: '#CBD5E1', darkCheck: true },

  // Standard Colors (Arabic, French, English)
  'RED': { bg: '#EF4444' },
  'ROUGE': { bg: '#EF4444' },
  'أحمر': { bg: '#EF4444' },

  'BLUE': { bg: '#3B82F6' },
  'BLEU': { bg: '#3B82F6' },
  'أزرق': { bg: '#3B82F6' },

  'GREEN': { bg: '#10B981' },
  'VERT': { bg: '#10B981' },
  'أخضر': { bg: '#10B981' },

  'YELLOW': { bg: '#F59E0B' },
  'JAUNE': { bg: '#F59E0B' },
  'أصفر': { bg: '#F59E0B' },

  'PINK': { bg: '#EC4899' },
  'ROSE': { bg: '#EC4899' },
  'وردي': { bg: '#EC4899' },

  'PURPLE': { bg: '#8B5CF6' },
  'VIOLET': { bg: '#8B5CF6' },
  'بنفسجي': { bg: '#8B5CF6' },

  'BLACK': { bg: '#0F172A' },
  'NOIR': { bg: '#0F172A' },
  'أسود': { bg: '#0F172A' },

  'WHITE': { bg: '#FFFFFF', border: '#CBD5E1', darkCheck: true },
  'BLANC': { bg: '#FFFFFF', border: '#CBD5E1', darkCheck: true },
  'أبيض': { bg: '#FFFFFF', border: '#CBD5E1', darkCheck: true },

  'GREY': { bg: '#64748B' },
  'GRAY': { bg: '#64748B' },
  'GRIS': { bg: '#64748B' },
  'رمادي': { bg: '#64748B' },

  'ORANGE': { bg: '#F97316' },
  'برتقالي': { bg: '#F97316' },

  'GOLD': { bg: '#EAB308', border: '#CA8A04' },
  'OR': { bg: '#EAB308', border: '#CA8A04' },
  'ذهبي': { bg: '#EAB308', border: '#CA8A04' },

  'SILVER': { bg: '#CBD5E1', border: '#94A3B8', darkCheck: true },
  'ARGENT': { bg: '#CBD5E1', border: '#94A3B8', darkCheck: true },
  'فضي': { bg: '#CBD5E1', border: '#94A3B8', darkCheck: true },

  'BROWN': { bg: '#78350F' },
  'MARRON': { bg: '#78350F' },
  'بني': { bg: '#78350F' },
};

function isColorAttribute(attrName: string, options: string[]) {
  const name = attrName.toLowerCase();
  if (
    name.includes('لون') ||
    name.includes('ألوان') ||
    name.includes('color') ||
    name.includes('couleur') ||
    name.includes('teinte') ||
    name.includes('shade')
  ) {
    return true;
  }
  const matches = options.filter((opt) => COLOR_MAP[opt.trim().toUpperCase()]);
  return matches.length > 0 && matches.length >= Math.ceil(options.length / 2);
}

function getColorInfo(optionName: string) {
  const key = optionName.trim().toUpperCase();
  if (COLOR_MAP[key]) return COLOR_MAP[key];
  if (optionName.startsWith('#') && (optionName.length === 4 || optionName.length === 7)) {
    return { bg: optionName, darkCheck: optionName.toUpperCase() === '#FFFFFF' };
  }
  return { bg: '#CBD5E1', border: '#94A3B8', darkCheck: true };
}

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

  const hasProductDiscount = typeof product.discountPercent === 'number' && product.discountPercent > 0;
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
                className="object-contain w-full h-full p-2"
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

              <div className="space-y-4">
                {product.attributes.map((attr) => {
                  const isColor = isColorAttribute(attr.name, attr.options);
                  return (
                    <div key={attr.name} className="space-y-2">
                      <label className="text-xs font-bold text-slate-700 block">
                        {attr.name} : <span className="text-purple-700 font-black">{selectedAttributes[attr.name] || ''}</span>
                      </label>
                      {isColor ? (
                        <div className="flex flex-wrap items-center gap-3 py-1">
                          {attr.options.map((option) => {
                            const isSelected = selectedAttributes[attr.name] === option;
                            const colorInfo = getColorInfo(option);
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => handleSelectAttribute(attr.name, option)}
                                title={option}
                                className="group relative flex flex-col items-center gap-1 transition-all focus:outline-none cursor-pointer"
                              >
                                <div
                                  className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${
                                    isSelected
                                      ? 'ring-3 ring-purple-600 ring-offset-2 scale-110 shadow-md'
                                      : 'hover:scale-105 opacity-85 hover:opacity-100'
                                  }`}
                                  style={{
                                    backgroundColor: colorInfo.bg,
                                    border: colorInfo.border ? `1.5px solid ${colorInfo.border}` : '1.5px solid rgba(0,0,0,0.12)'
                                  }}
                                >
                                  {isSelected && (
                                    <Check
                                      size={16}
                                      className={colorInfo.darkCheck ? 'text-slate-900 stroke-[3]' : 'text-white stroke-[3]'}
                                    />
                                  )}
                                </div>
                                <span className={`text-[11px] tracking-tight ${isSelected ? 'text-purple-800 font-black' : 'text-slate-600 font-semibold'}`}>
                                  {option}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {attr.options.map((option) => {
                            const isSelected = selectedAttributes[attr.name] === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => handleSelectAttribute(attr.name, option)}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all border flex items-center gap-1.5 cursor-pointer ${
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
                      )}
                    </div>
                  );
                })}
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
                            if (v.attributes) {
                              setSelectedAttributes(v.attributes);
                            }
                          }}
                          className={`p-2.5 rounded-xl text-xs font-bold text-left border flex items-center justify-between transition-all cursor-pointer ${
                            isVSelected
                              ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                              : 'bg-white text-slate-800 border-slate-200 hover:border-purple-300'
                          }`}
                        >
                          <span className="truncate max-w-[140px]">{v.name}</span>
                          <div className="flex items-center gap-1 text-[11px] shrink-0">
                            <span>{formatPrice(vFinalPrice)}</span>
                            {v.stock <= 0 && (
                              <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded font-bold">
                                {lang === 'fr' ? 'Épuisé' : 'نفد'}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dynamic Shade & Material Compatibility Matcher */}
          {(() => {
            const currentShade = selectedAttributes['Couleur'] || selectedAttributes['Teinte'] || selectedAttributes['لون'] || selectedVariant?.name || '';
            const text = `${product.name} ${product.category} ${product.description || ''} ${selectedVariant?.name || ''} ${currentShade}`.toLowerCase();

            let titleAr = `💡 المواد المكملة والموصى بها لهذا المنتج ${currentShade ? `(الدرجة المختارة: ${currentShade})` : ''}`;
            let titleFr = `💡 Produits complémentaires recommandés ${currentShade ? `(Teinte: ${currentShade})` : ''}`;
            let itemsAr = [
              'حمض التخريش 37% (Acid Etch Gel) لإعداد السن قبل الحشو',
              'المادة اللاصقة الشاملة (Universal Bonding Agent)',
              'معجون وأشرطة تلميع الحشوات (Polishing Strips & Paste)'
            ];
            let itemsFr = [
              'Acide d\'étchage (Acid Etch 37%) pour la préparation émail/dentine',
              'Adhésif universel monocomposant (Bonding Agent)',
              'Disques & pâtes de polissage pour finition esthétique'
            ];
            let bgStyle = 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 text-amber-900';

            if (text.includes('endo') || text.includes('gutta') || text.includes('مبرد') || text.includes('عصب') || text.includes('paper point')) {
              titleAr = '💡 المستلزمات المكملة لعلاج العصب والجذور (Endodontie)';
              titleFr = '💡 Matériels complémentaires pour Traitement Endodontique';
              itemsAr = [
                'محلول وسيروم التطهير (Sodium Hypochlorite / EDTA Gel)',
                'أقماع الجوتا بيركا والأقماع الورقية المطبقة للمقاس (Gutta & Paper Points)',
                'مادة سد القنوات العصبية (Root Canal Sealer)'
              ];
              itemsFr = [
                'Gel EDTA & Hypochlorite de Sodium pour irrigation',
                'Pointes de Gutta-percha & Papier au diamètre correspondant',
                'Ciment d\'obturation canalaire (Root Canal Sealer)'
              ];
              bgStyle = 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200 text-blue-900';
            } else if (text.includes('anesth') || text.includes('مخدر') || text.includes('needle') || text.includes('إبرة')) {
              titleAr = '💡 المستلزمات المكملة للتخدير الموضعي (Anesthésie)';
              titleFr = '💡 Produits complémentaires pour Anesthésie Dentaire';
              itemsAr = [
                'إبر التخدير القصيرة والطويلة المقاومة للانكسار (Dental Needles 27G / 30G)',
                'جيل التخدير السطحي قبل الحقن (Topical Anesthetic Gel)',
                'محقنة التخدير المعدنية المعقمة (Cartridge Syringe)'
              ];
              itemsFr = [
                'Aiguilles dentaires stériles (27G court / 30G très court)',
                'Gel d\'anesthésie topique de contact',
                'Seringue à carpuche en acier inoxydable'
              ];
              bgStyle = 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 text-emerald-900';
            } else if (text.includes('empreinte') || text.includes('طبعة') || text.includes('alginate') || text.includes('silicone')) {
              titleAr = '💡 المستلزمات المكملة لأخذ طبعات الأسنان (Prise d\'empreinte)';
              titleFr = '💡 Produits complémentaires pour Prise d\'Empreinte';
              itemsAr = [
                'طوابع أخذ الطبعات المعدنية أو البلاستيكية (Impression Trays)',
                'بخاخ لاصق مواد الطبعة (Tray Adhesive Spray)',
                'خلط السيليكون التلقائي ونشرات الخلط (Mixing Tips & Gun)'
              ];
              itemsFr = [
                'Porte-empreintes perforés haut/bas',
                'Adhésif pour porte-empreinte (Tray Adhesive)',
                'Embouts mélangeurs automatiques pour Silicone'
              ];
              bgStyle = 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200 text-purple-900';
            } else if (text.includes('turbine') || text.includes('معدات') || text.includes('مقبض') || text.includes('contre-angle') || text.includes('équipement')) {
              titleAr = '💡 المستلزمات المكملة وصيانة الأجهزة والتوربينات';
              titleFr = '💡 Matériel de maintenance & Accessoires Équipement';
              itemsAr = [
                'بخاخ التزييت والتنظيف اليومي للتوربين (Lubricant Spray Oil)',
                'وصلة التوربين السريعة المزودة بالإضاءة (Quick Coupling Raccord)',
                'أكياس ومؤشرات التعقيم بالأوتوكلاف (Autoclave Sterilization Pouches)'
              ];
              itemsFr = [
                'Huile spray de lubrification et nettoyage automatique',
                'Raccord rapide avec fibre optique',
                'Gaines & sachets de stérilisation pour Autoclave'
              ];
              bgStyle = 'bg-gradient-to-r from-slate-100 to-cyan-50 border-slate-300 text-slate-900';
            }

            return (
              <div className={`p-4 rounded-2xl border ${bgStyle} space-y-2`}>
                <h4 className="text-xs font-black flex items-center gap-1.5">
                  <span>{lang === 'fr' ? titleFr : titleAr}</span>
                </h4>
                <ul className="text-[11px] font-semibold space-y-1 list-disc list-inside opacity-90 leading-relaxed">
                  {(lang === 'fr' ? itemsFr : itemsAr).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {/* Technical Sheet / Description */}
          {product.description && (
            <div className="space-y-2">
              <h3 className="font-extrabold text-slate-900 text-sm">{getTranslation(lang, 'description')}</h3>
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}

          {product.technicalSheet && (
            <div className="space-y-2">
              <h3 className="font-extrabold text-slate-900 text-sm">{getTranslation(lang, 'technicalSheet')}</h3>
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 whitespace-pre-line">
                {product.technicalSheet}
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer / Add to Cart Action */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400 font-semibold">{lang === 'fr' ? 'Prix total' : 'السعر النهائي'}</span>
            <span className="text-xl font-black text-brand-dark">{formatPrice(finalPrice)}</span>
          </div>

          <button
            onClick={() => {
              onAddToCart(product, selectedVariant || undefined);
              onClose();
            }}
            disabled={isOutOfStock}
            className={`px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer ${
              isOutOfStock
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-brand-cyan text-white hover:bg-brand-cyan/90 shadow-md shadow-brand-cyan/20'
            }`}
          >
            <ShoppingCart size={18} />
            {getTranslation(lang, 'addToCart')}
          </button>
        </div>
      </div>
    </div>
  );
}
