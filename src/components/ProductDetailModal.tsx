import { Product } from '../types';
import { Language, getTranslation } from '../translations';
import { X, Award, AlertCircle, ShoppingCart } from 'lucide-react';

interface ProductDetailModalProps {
  product: Product;
  lang: Language;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
}

export default function ProductDetailModal({
  product,
  lang,
  onClose,
  onAddToCart
}: ProductDetailModalProps) {
  const isRtl = lang === 'ar';

  const formatPrice = (num: number) => {
    if (num === 0 || num === undefined || num === null) return '-';
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' ' + getTranslation(lang, 'currency');
  };

  const hasProductDiscount = product.discountPercent && product.discountPercent > 0;
  const finalPrice = hasProductDiscount
    ? Math.round(product.price * (1 - (product.discountPercent || 0) / 100))
    : product.price;

  const isOutOfStock = product.stock <= 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <span className="font-extrabold text-slate-800 text-base md:text-lg">
            {product.category}
          </span>
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
            <div className="w-full md:w-1/2 h-52 bg-slate-100 rounded-2xl overflow-hidden relative border border-slate-100 shrink-0">
              <img
                src={product.image && String(product.image) !== '0' ? product.image : 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300'}
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
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-2 leading-snug">
                  {product.name}
                </h2>
                
                {product.expiryDate && (
                  <p className="text-xs text-rose-500 font-semibold mb-4 bg-rose-50 px-2.5 py-1 rounded-lg inline-block">
                    {lang === 'fr' 
                      ? `Date d'expiration: ${product.expiryDate}` 
                      : `تاريخ انتهاء الصلاحية: ${product.expiryDate}`}
                  </p>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mt-4">
                <div className="flex flex-col">
                  {hasProductDiscount && (
                    <span className="text-xs text-slate-400 line-through">
                      {formatPrice(product.price)}
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
                      : (lang === 'fr' ? 'En stock' : 'متوفر في المخزون')}
                  </span>
                </div>
              </div>
            </div>
          </div>

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
              onAddToCart(product);
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
