import React from 'react';
import { Product, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';
import { Heart, ShoppingCart, Award, Calendar, Flame } from 'lucide-react';

interface ProductCardProps {
  key?: any;
  product: Product;
  lang: Language;
  onAddToCart: (product: Product) => void;
  isFavorite: boolean;
  onToggleFavorite: (product: Product) => void;
  onViewDetails: (product: Product) => void;
  user: UserProfile | null;
}

export default function ProductCard({
  product,
  lang,
  onAddToCart,
  isFavorite,
  onToggleFavorite,
  onViewDetails,
  user
}: ProductCardProps): React.ReactElement {
  const isRtl = lang === 'ar';
  
  // Calculate final product price after product-level discounts
  const hasProductDiscount = typeof product.discountPercent === 'number' && product.discountPercent > 0;
  const finalPrice = hasProductDiscount
    ? Math.round(product.price * (1 - (product.discountPercent || 0) / 100))
    : product.price;

  // Check if stock is low or out
  const isOutOfStock = product.stock <= 0;
  const isLowStock = !isOutOfStock && product.stock <= (product.lowStockAlert || 5);

  // Check if product is close to expiration (within 90 days)
  const isExpiringSoon = (() => {
    if (!product.expiryDate) return false;
    const expiry = new Date(product.expiryDate);
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 90;
  })();

  const formatPrice = (num: number) => {
    if (num === 0 || num === undefined || num === null) return '-';
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' ' + getTranslation(lang, 'currency');
  };

  return (
    <div 
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-brand-cyan/20 dark:hover:border-brand-cyan/40 hover:shadow-md dark:hover:shadow-cyan/5 transition-all duration-300 flex flex-col overflow-hidden relative group"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Favorite Button */}
      {user && user.role === 'doctor' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(product);
          }}
          className={`absolute top-1.5 sm:top-3 ${isRtl ? 'left-1.5 sm:left-3' : 'right-1.5 sm:right-3'} z-10 p-1 sm:p-2 rounded-full border shadow-xs transition-colors ${
            isFavorite
              ? 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/30 text-red-500'
              : 'bg-white/80 dark:bg-slate-900/80 border-slate-100 dark:border-slate-800 text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Heart size={12} className="sm:hidden" fill={isFavorite ? 'currentColor' : 'none'} />
          <Heart size={16} className="hidden sm:block" fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      )}

      {/* Discount Badge or Most Requested Sales Badge */}
      {hasProductDiscount && product.discountPercent > 0 ? (
        <span className={`absolute top-1.5 sm:top-3 ${isRtl ? 'right-1.5 sm:right-3' : 'left-1.5 sm:left-3'} z-10 bg-red-600 text-white font-extrabold text-[9px] sm:text-[11px] md:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg flex items-center gap-0.5 sm:gap-1 shadow-sm border border-red-500`}>
          <Award size={8} className="shrink-0 hidden sm:block" />
          <span>-{product.discountPercent}%</span>
        </span>
      ) : (product.salesCount && product.salesCount > 0) ? (
        <span className={`absolute top-1.5 sm:top-3 ${isRtl ? 'right-1.5 sm:right-3' : 'left-1.5 sm:left-3'} z-10 bg-amber-500 text-white font-extrabold text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md sm:rounded-lg flex items-center gap-1 shadow-sm border border-amber-400`}>
          <Flame size={10} className="shrink-0" />
          <span>{lang === 'fr' ? `Demandé ${product.salesCount}x` : `مطلوب ${product.salesCount} مرة`}</span>
        </span>
      ) : null}

      {/* Product Image */}
      <div
        onClick={() => onViewDetails(product)}
        className="w-full h-24 sm:h-36 md:h-48 bg-slate-50 dark:bg-slate-800/50 relative flex items-center justify-center overflow-hidden cursor-pointer shrink-0"
      >
        <img
          src={product.image && String(product.image) !== '0' ? product.image : 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300'}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="object-contain w-full h-full p-2 group-hover:scale-105 transition-transform duration-300"
          referrerPolicy="no-referrer"
        />
        {isOutOfStock && (
          <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center backdrop-blur-xs">
            <span className="bg-red-600 text-white font-black text-[10px] sm:text-xs px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl uppercase tracking-wider shadow-md">
              {getTranslation(lang, 'outOfStock')}
            </span>
          </div>
        )}
      </div>

      {/* Product Information */}
      <div className="p-2 sm:p-4 md:p-5 flex-1 flex flex-col">
        {/* Category Badge & Variable Product Badge */}
        <div className="flex items-center gap-1 flex-wrap mb-1">
          {product.category && (
            <span className="text-[8px] sm:text-[10px] font-extrabold text-brand-cyan bg-brand-cyan/5 dark:bg-brand-cyan/10 px-1 sm:px-2 py-0.5 rounded-md uppercase tracking-wider truncate max-w-full">
              {product.category}
            </span>
          )}
          {product.isVariable && (
            <span className="text-[10px] font-extrabold text-purple-600 bg-purple-50 dark:bg-purple-950/30 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800">
              {lang === 'fr' ? `${product.variants?.length || 0} options` : `${product.variants?.length || 0} خيارات`}
            </span>
          )}
        </div>

        {/* Product Name */}
        <h3
          onClick={() => onViewDetails(product)}
          className="font-bold text-slate-800 dark:text-slate-200 text-[11px] sm:text-sm md:text-base line-clamp-2 hover:text-brand-cyan transition-colors cursor-pointer mb-1 sm:mb-2 flex-1"
        >
          {product.name && product.name !== '0' ? product.name : '-'}
        </h3>

        {/* Dynamic Alerts */}
        <div className="space-y-1 mb-3 shrink-0">
          {isExpiringSoon && product.expiryDate && product.expiryDate !== '0' && (
            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 px-2 py-1 rounded-lg text-xs font-semibold">
              <Calendar size={12} className="shrink-0" />
              <span>
                {lang === 'fr'
                  ? `Exp. proche: ${product.expiryDate}`
                  : `انتهاء قريب: ${product.expiryDate}`}
              </span>
            </div>
          )}
        </div>

        {/* Price & Cart Actions */}
        <div className="flex items-center justify-between gap-1 mt-auto shrink-0 pt-1 sm:pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-col">
            {product.isVariable && (
              <span className="text-[10px] text-slate-400 font-semibold">
                {lang === 'fr' ? 'À partir de' : 'ابتداءً من'}
              </span>
            )}
            <div className="flex flex-wrap items-baseline gap-1">
              {product.price > 0 && (
                <span className="text-[11px] sm:text-base md:text-lg font-black text-brand-dark dark:text-slate-100">
                  {finalPrice > 0 ? formatPrice(finalPrice) : '-'}
                </span>
              )}
              {hasProductDiscount && product.discountPercent > 0 && product.price > 0 && (
                <span className="hidden sm:inline text-xs md:text-sm text-slate-400 dark:text-slate-500 font-medium line-through">
                  {formatPrice(product.price)}
                </span>
              )}
            </div>
          </div>

          {product.isVariable ? (
            <button
              onClick={() => onViewDetails(product)}
              disabled={isOutOfStock}
              className={`px-1.5 sm:px-3 py-1.5 sm:py-2 text-[9px] sm:text-xs font-extrabold rounded-lg sm:rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                isOutOfStock
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700 shadow-xs hover:shadow-md'
              }`}
            >
              {lang === 'fr' ? 'Choisir' : 'اختر'}
            </button>
          ) : (
            <button
              onClick={() => onAddToCart(product)}
              disabled={isOutOfStock}
              className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                isOutOfStock
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                  : 'bg-brand-cyan text-white hover:bg-brand-cyan/90 shadow-xs hover:shadow-md'
              }`}
              title={getTranslation(lang, 'addToCart')}
            >
              <ShoppingCart size={12} className="sm:hidden" />
              <ShoppingCart size={16} className="hidden sm:block" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
