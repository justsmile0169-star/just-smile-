import React from 'react';
import { Product, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';
import { Heart, ShoppingCart, Award, AlertTriangle, Calendar } from 'lucide-react';

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
  const hasProductDiscount = product.discountPercent && product.discountPercent > 0;
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
          className={`absolute top-3 ${isRtl ? 'left-3' : 'right-3'} z-10 p-2 rounded-full border shadow-xs transition-colors ${
            isFavorite
              ? 'bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/30 text-red-500'
              : 'bg-white/80 dark:bg-slate-900/80 border-slate-100 dark:border-slate-800 text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-800'
          }`}
        >
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      )}

      {/* Discount Badge */}
      {hasProductDiscount && (
        <span className={`absolute top-3 ${isRtl ? 'right-3' : 'left-3'} z-10 bg-red-600 text-white font-extrabold text-[11px] md:text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm border border-red-500`}>
          <Award size={12} className="shrink-0" />
          <span>-{product.discountPercent}%</span>
        </span>
      )}

      {/* Product Image */}
      <div
        onClick={() => onViewDetails(product)}
        className="w-full h-36 sm:h-40 md:h-48 bg-slate-50 dark:bg-slate-800/50 relative flex items-center justify-center overflow-hidden cursor-pointer shrink-0"
      >
        <img
          src={product.image && String(product.image) !== '0' ? product.image : 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300'}
          alt={product.name}
          className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
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
      <div className="p-4 md:p-5 flex-1 flex flex-col">
        {/* Category Badge */}
        <span className="text-[10px] font-extrabold text-brand-cyan bg-brand-cyan/5 dark:bg-brand-cyan/10 px-2 py-0.5 rounded-md self-start uppercase tracking-wider mb-2">
          {product.category}
        </span>

        {/* Product Name */}
        <h3 
          onClick={() => onViewDetails(product)}
          className="font-bold text-slate-800 dark:text-slate-200 text-sm md:text-base line-clamp-2 hover:text-brand-cyan transition-colors cursor-pointer mb-2 flex-1"
        >
          {product.name}
        </h3>

        {/* Dynamic Alerts */}
        <div className="space-y-1 mb-3 shrink-0">
          {isLowStock && (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-2 py-1 rounded-lg text-xs font-semibold">
              <AlertTriangle size={12} className="shrink-0" />
              <span>{getTranslation(lang, 'onlyStockLeft', { count: product.stock })}</span>
            </div>
          )}

          {isExpiringSoon && (
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
        <div className="flex items-center justify-between gap-2 mt-auto shrink-0 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-base md:text-lg font-black text-brand-dark dark:text-slate-100 animate-pulse-subtle">
              {formatPrice(finalPrice)}
            </span>
            {hasProductDiscount && (
              <span className="text-xs md:text-sm text-slate-400 dark:text-slate-500 font-medium line-through">
                {formatPrice(product.price)}
              </span>
            )}
          </div>

          <button
            onClick={() => onAddToCart(product)}
            disabled={isOutOfStock}
            className={`p-2.5 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
              isOutOfStock
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                : 'bg-brand-cyan text-white hover:bg-brand-cyan/90 shadow-xs hover:shadow-md'
            }`}
            title={getTranslation(lang, 'addToCart')}
          >
            <ShoppingCart size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
