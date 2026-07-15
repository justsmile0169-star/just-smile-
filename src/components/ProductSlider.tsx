import React, { useRef, useEffect, useState } from 'react';
import { Product, UserProfile } from '../types';
import { Language } from '../translations';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from './ProductCard';

interface ProductSliderProps {
  title: string;
  icon: React.ReactNode;
  products: Product[];
  favorites: string[];
  lang: Language;
  onAddToCart: (p: Product) => void;
  onToggleFavorite: (p: Product) => void;
  onViewProduct: (p: Product) => void;
  user: UserProfile | null;
}

export default function ProductSlider({
  title,
  icon,
  products,
  favorites,
  lang,
  onAddToCart,
  onToggleFavorite,
  onViewProduct,
  user
}: ProductSliderProps) {
  const isRtl = lang === 'ar';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  // Auto scroll horizontal slider
  useEffect(() => {
    if (products.length <= 1) return;
    const interval = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const isRtlMode = document.dir === 'rtl' || isRtl;
      const step = isRtlMode ? -260 : 260;
      const currentScroll = Math.abs(el.scrollLeft);
      
      if (currentScroll >= maxScroll - 15) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: step, behavior: 'smooth' });
      }
    }, 4500);
    return () => clearInterval(interval);
  }, [products.length, isRtl]);

  if (products.length === 0) return null;

  const updateButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 10);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
    setTimeout(updateButtons, 400);
  };

  return (
    <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest">
            {title}
          </h3>
          <span className="text-[10px] font-black bg-brand-cyan/10 text-brand-cyan px-2 py-0.5 rounded-full">
            {products.length}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => scroll('left')}
            disabled={!canLeft}
            className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-brand-cyan hover:border-brand-cyan rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canRight}
            className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-brand-cyan hover:border-brand-cyan rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        onScroll={updateButtons}
        className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide scroll-smooth"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {products.map((p) => (
          <div key={p.id} className="shrink-0 w-[220px] md:w-[250px]" style={{ scrollSnapAlign: 'start' }}>
            <ProductCard
              product={p}
              lang={lang}
              onAddToCart={onAddToCart}
              isFavorite={favorites.includes(p.id)}
              onToggleFavorite={onToggleFavorite}
              onViewDetails={onViewProduct}
              user={user}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
