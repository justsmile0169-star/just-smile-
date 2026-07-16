import React, { useState, useMemo, useRef, useEffect } from 'react';
import { collection, query, where, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';
import ProductCard from './ProductCard';
import AnnouncementsSection from './AnnouncementsSection';
import ProductSlider from './ProductSlider';
import { Search, X, ShieldAlert, LayoutGrid, Activity, Syringe, Scissors, Smile, ShieldCheck, Layers, ChevronDown, ScanBarcode, Sparkles, Flame, ShoppingBag } from 'lucide-react';

interface BrowseViewProps {
  products: Product[];
  favorites: string[];
  lang: Language;
  onAddToCart: (product: Product) => void;
  onToggleFavorite: (product: Product) => void;
  onViewProduct: (product: Product) => void;
  user: UserProfile | null;
  currentUser?: UserProfile | null;
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  onOpenBarcodeScanner?: () => void;
}

export default function BrowseView({
  products,
  favorites,
  lang,
  onAddToCart,
  onToggleFavorite,
  onViewProduct,
  user,
  currentUser,
  selectedCategory: propSelectedCategory,
  onSelectCategory,
  onOpenBarcodeScanner
}: BrowseViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [localCategory, setLocalCategory] = useState<string>('all');
  const selectedCategory = propSelectedCategory ?? localCategory;
  const setSelectedCategory = onSelectCategory ?? setLocalCategory;
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [latestProducts, setLatestProducts] = useState<Product[]>([]);
  const [mostRequestedProducts, setMostRequestedProducts] = useState<Product[]>([]);
  const [routineClinicProducts, setRoutineClinicProducts] = useState<Product[]>([]);

  // Main catalog products pagination state
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Search state
  const [searchProducts, setSearchProducts] = useState<Product[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const loaderRef = useRef<HTMLDivElement>(null);

  // Fetch sliders on mount or when currentUser changes
  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const q = query(
          collection(db, 'products'),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
        const snap = await getDocs(q);
        const items: Product[] = [];
        snap.forEach((d) => {
          const data = d.data() as Product;
          if (!data.isDeleted) items.push({ ...data, id: d.id });
        });
        setLatestProducts(items);
      } catch (err) {
        console.error("Error fetching latest products slider:", err);
      }
    };

    const fetchMostRequested = async () => {
      try {
        const q = query(
          collection(db, 'products'),
          orderBy('salesCount', 'desc'),
          limit(20)
        );
        const snap = await getDocs(q);
        const items: Product[] = [];
        snap.forEach((d) => {
          const data = d.data() as Product;
          if (!data.isDeleted) items.push({ ...data, id: d.id });
        });
        setMostRequestedProducts(items);
      } catch (err) {
        console.error("Error fetching most requested products slider:", err);
      }
    };

    const fetchRoutine = async () => {
      try {
        const q = query(
          collection(db, 'products'),
          where('isRoutineClinic', '==', true),
          limit(40)
        );
        const snap = await getDocs(q);
        const items: Product[] = [];
        snap.forEach((d) => {
          const data = d.data() as Product;
          if (!data.isDeleted) items.push({ ...data, id: d.id });
        });
        const sorted = items
          .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
          .slice(0, 20);
        setRoutineClinicProducts(sorted);
      } catch (err) {
        console.error("Error fetching routine clinic products slider:", err);
      }
    };

    fetchLatest();
    if (currentUser && currentUser.role === 'doctor') {
      fetchMostRequested();
      fetchRoutine();
    }
  }, [currentUser]);

  // Reset page and load first batch of catalog products when category changes
  useEffect(() => {
    const initFetch = async () => {
      setLoading(true);
      try {
        let q;
        const productsRef = collection(db, 'products');

        if (selectedCategory === 'all') {
          q = query(
            productsRef,
            orderBy('createdAt', 'desc'),
            limit(40)
          );
        } else {
          q = query(
            productsRef,
            where('category', '==', selectedCategory),
            limit(40)
          );
        }

        const snap = await getDocs(q);
        const items: Product[] = [];
        snap.forEach((d) => {
          const data = d.data() as Product;
          if (!data.isDeleted) {
            items.push({ ...data, id: d.id });
          }
        });

        setCatalogProducts(items);

        if (snap.docs.length < 40) {
          setHasMore(false);
          setLastVisible(null);
        } else {
          setHasMore(true);
          setLastVisible(snap.docs[snap.docs.length - 1]);
        }
      } catch (err) {
        console.error("Error fetching initial catalog products:", err);
      } finally {
        setLoading(false);
      }
    };

    initFetch();
  }, [selectedCategory]);

  // Fetch more products (Infinite Scroll)
  const fetchMoreProducts = async () => {
    if (loading || !hasMore || !lastVisible || searchQuery.trim()) return;

    setLoading(true);
    try {
      let q;
      const productsRef = collection(db, 'products');

      if (selectedCategory === 'all') {
        q = query(
          productsRef,
          orderBy('createdAt', 'desc'),
          startAfter(lastVisible),
          limit(40)
        );
      } else {
        q = query(
          productsRef,
          where('category', '==', selectedCategory),
          startAfter(lastVisible),
          limit(40)
        );
      }

      const snap = await getDocs(q);
      const items: Product[] = [];
      snap.forEach((d) => {
        const data = d.data() as Product;
        if (!data.isDeleted) {
          items.push({ ...data, id: d.id });
        }
      });

      setCatalogProducts((prev) => {
        const ids = new Set(prev.map(p => p.id));
        const newItems = items.filter(p => !ids.has(p.id));
        return [...prev, ...newItems];
      });

      if (snap.docs.length < 40) {
        setHasMore(false);
        setLastVisible(null);
      } else {
        setHasMore(true);
        setLastVisible(snap.docs[snap.docs.length - 1]);
      }
    } catch (err) {
      console.error("Error fetching more catalog products:", err);
    } finally {
      setLoading(false);
    }
  };

  // IntersectionObserver for Infinite Scroll
  useEffect(() => {
    if (!hasMore || loading || searchQuery.trim()) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchMoreProducts();
        }
      },
      { threshold: 0.1 }
    );

    const currentLoader = loaderRef.current;
    if (currentLoader) {
      observer.observe(currentLoader);
    }

    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
    };
  }, [loaderRef.current, hasMore, loading, searchQuery, lastVisible]);

  // Debounced search queries database
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchProducts([]);
      return;
    }

    const fetchAllForSearch = async () => {
      setLoadingSearch(true);
      try {
        let q;
        const productsRef = collection(db, 'products');
        if (selectedCategory === 'all') {
          q = query(productsRef);
        } else {
          q = query(productsRef, where('category', '==', selectedCategory));
        }

        const snap = await getDocs(q);
        const items: Product[] = [];
        snap.forEach((d) => {
          const data = d.data() as Product;
          if (!data.isDeleted) {
            items.push({ ...data, id: d.id });
          }
        });
        setSearchProducts(items);
      } catch (err) {
        console.error("Error fetching products for search:", err);
      } finally {
        setLoadingSearch(false);
      }
    };

    const timer = setTimeout(() => {
      fetchAllForSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    }
    if (isCategoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCategoryDropdownOpen]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('justsmile_recent_searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveSearchQuery = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 5);
      localStorage.setItem('justsmile_recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = searchQuery.trim();
      if (trimmed) {
        saveSearchQuery(trimmed);
        setShowSuggestions(false);
      }
    }
  };

  const isRtl = lang === 'ar';

  const categories = [
    { id: 'all', labelFr: 'Tous', labelAr: 'الكل', icon: LayoutGrid },
    { id: 'Équipements', labelFr: 'Équipements', labelAr: 'المعدات', icon: Activity },
    { id: 'Consommables', labelFr: 'Consommables', labelAr: 'المواد الاستهلاكية', icon: Syringe },
    { id: 'Instruments', labelFr: 'Instruments', labelAr: 'الأدوات', icon: Scissors },
    { id: 'Orthodontie', labelFr: 'Orthodontie', labelAr: 'تقويم الأسنان', icon: Smile },
    { id: 'Hygiène & Stérilisation', labelFr: 'Hygiène & Stérilisation', labelAr: 'النظافة والتعقيم', icon: ShieldCheck },
    { id: 'Prothèse dentaire', labelFr: 'Prothèse dentaire', labelAr: 'بدائل الأسنان', icon: Layers }
  ];

  const activeCategoryObj = categories.find((c) => c.id === selectedCategory) || categories[0];
  const ActiveCategoryIcon = activeCategoryObj.icon;

  // Filter products based on search query and category select
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) {
      return catalogProducts;
    }
    return searchProducts.filter((prod) => {
      const matchesCategory = selectedCategory === 'all' || prod.category === selectedCategory;
      const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            prod.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            prod.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (prod.barcode && prod.barcode.includes(searchQuery));
      return matchesCategory && matchesSearch;
    });
  }, [catalogProducts, searchProducts, selectedCategory, searchQuery]);

  // Smart Search suggestions (max 5 suggestions)
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchProducts
      .filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 5);
  }, [searchProducts, searchQuery]);

  return (
    <div className="space-y-8" dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* Search and Category Filter Jumbotron Hero */}
      <div className="bg-gradient-to-br from-brand-dark to-[#164e63] rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-10 text-white relative shadow-md">
        {/* Abstract dental glow circles wrapped to prevent overflow without clipping children */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-80 h-80 bg-brand-cyan/20 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand-cyan/10 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
        </div>

        <div className="relative z-10 max-w-2xl space-y-4">
          <span className="text-[10px] md:text-xs font-black tracking-widest uppercase bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20 px-3 py-1 rounded-full inline-block">
            {lang === 'fr' ? 'Commandez vos fournitures en toute sérénité' : 'اطلب مستلزمات عيادتك بكل أريحية'}
          </span>
          <h2 className="text-xl sm:text-2xl md:text-4xl font-extrabold tracking-tight leading-tight">
            {lang === 'fr'
              ? 'Le meilleur matériel dentaire livré directement à votre cabinet'
              : 'أجود المواد والمستلزمات الطبية لطب الأسنان تصل لعيادتكم'}
          </h2>
          <p className="text-xs sm:text-sm md:text-sm text-slate-200 font-medium max-w-lg">
            {lang === 'fr'
              ? 'JUST SMILE propose un large choix de produits d\'équipements, consommables, et instruments de haute qualité.'
              : 'منصة JUST SMILE توفر تشكيلة واسعة من مستهلكات ومعدات طب الأسنان عالية الجودة.'}
          </p>

          {/* Smart Search Bar & Category Dropdown */}
          <div className="relative pt-2">
            <div className="flex flex-col md:flex-row gap-3 max-w-2xl">
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (searchQuery.trim()) {
                      saveSearchQuery(searchQuery.trim());
                      setShowSuggestions(false);
                    }
                  }}
                  className="absolute top-1/2 -translate-y-1/2 left-3 sm:left-4 text-slate-400 hover:text-brand-cyan rtl:right-3 sm:rtl:right-4 rtl:left-auto cursor-pointer z-10"
                  title={lang === 'fr' ? 'Rechercher' : 'بحث'}
                >
                  <Search size={16} />
                </button>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  placeholder={getTranslation(lang, 'searchPlaceholder')}
                  className="w-full bg-white text-slate-800 rounded-xl sm:rounded-2xl py-3 sm:py-3.5 px-10 sm:px-12 focus:outline-hidden focus:ring-4 focus:ring-brand-cyan/25 text-sm font-medium shadow-lg"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute top-1/2 -translate-y-1/2 right-3 sm:right-4 text-slate-400 hover:text-slate-600 rtl:left-3 sm:rtl:left-4 rtl:right-auto z-10"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Category Selector Control Button */}
              <div className="relative shrink-0" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                  className="w-full md:w-auto h-full min-h-[48px] sm:min-h-[52px] bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl sm:rounded-2xl px-4 sm:px-5 py-3 flex items-center justify-between md:justify-center gap-2 sm:gap-3 transition-all cursor-pointer font-extrabold text-xs sm:text-sm backdrop-blur-md shadow-lg"
                >
                  <div className="flex items-center gap-2">
                    <ActiveCategoryIcon size={16} className="text-brand-cyan" />
                    <span className="hidden sm:inline">
                      {isRtl ? activeCategoryObj.labelAr : activeCategoryObj.labelFr}
                    </span>
                  </div>
                  <ChevronDown size={16} className={`transition-transform duration-250 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isCategoryDropdownOpen && (
                  /* Dropdown Menu */
                  <div className={`absolute top-full mt-2 ${isRtl ? 'right-0' : 'left-0 md:right-0 md:left-auto'} w-64 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-40 divide-y divide-slate-50 dark:divide-slate-800 text-slate-700 dark:text-slate-200 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150`}>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 px-4 py-2 uppercase tracking-widest">
                      {lang === 'fr' ? 'Sélectionner une catégorie' : 'اختر fئة للمنتجات'}
                    </p>
                    {categories.map((cat) => {
                      const CatIcon = cat.icon;
                      const isSelected = selectedCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(cat.id);
                            setIsCategoryDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-3 flex items-center gap-3 text-left rtl:text-right text-sm font-bold transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-brand-cyan/10 text-brand-cyan dark:bg-brand-cyan/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-brand-cyan/20 text-brand-cyan' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                            <CatIcon size={14} />
                          </div>
                          <span className="flex-1 truncate">
                            {isRtl ? cat.labelAr : cat.labelFr}
                          </span>
                          {isSelected && (
                            <span className="w-2 h-2 bg-brand-cyan rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {onOpenBarcodeScanner && (
                <button
                  type="button"
                  onClick={onOpenBarcodeScanner}
                  className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm px-4 py-3 rounded-xl transition-all shrink-0"
                >
                  <ScanBarcode size={18} />
                  {lang === 'fr' ? 'Scanner' : 'مسح'}
                </button>
              )}
            </div>

            {/* Smart Suggestions Box */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xl mt-2 overflow-hidden z-20 divide-y divide-slate-50 dark:divide-slate-800 text-slate-700 dark:text-slate-200 text-sm">
                {searchSuggestions.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (searchQuery.trim()) {
                        saveSearchQuery(searchQuery.trim());
                      }
                      onViewProduct(p);
                      setShowSuggestions(false);
                      setSearchQuery('');
                    }}
                    className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <span className="font-semibold truncate max-w-[320px]">{p.name}</span>
                    <span className="text-xs text-brand-cyan font-black">{p.category}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Searches Row */}
            {recentSearches.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 text-xs max-w-lg">
                <span className="text-slate-300 font-bold">
                  {getTranslation(lang, 'recentSearches')}:
                </span>
                {recentSearches.map((query, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white rounded-full pl-3 pr-2 py-1 transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery(query);
                        saveSearchQuery(query); // bump to top
                        setShowSuggestions(false);
                      }}
                      className="hover:underline font-extrabold cursor-pointer"
                    >
                      {query}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = recentSearches.filter((_, idx) => idx !== index);
                        setRecentSearches(updated);
                        localStorage.setItem('justsmile_recent_searches', JSON.stringify(updated));
                      }}
                      className="text-white/50 hover:text-white p-0.5 rounded-full transition-colors cursor-pointer"
                      title={lang === 'fr' ? 'Supprimer' : 'حذف'}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setRecentSearches([]);
                    localStorage.removeItem('justsmile_recent_searches');
                  }}
                  className="text-brand-cyan hover:text-brand-cyan/80 font-black underline ml-1 cursor-pointer"
                >
                  {getTranslation(lang, 'clearHistory')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Announcements carousel */}
      <AnnouncementsSection lang={lang} currentUser={currentUser ?? null} />

      {/* New Products Slider */}
      <ProductSlider
        title={lang === 'fr' ? 'Nouveaux Produits' : 'آخر المنتجات المضافة'}
        icon={<Sparkles size={18} className="text-brand-cyan" />}
        products={latestProducts}
        favorites={favorites}
        lang={lang}
        onAddToCart={onAddToCart}
        onToggleFavorite={onToggleFavorite}
        onViewProduct={onViewProduct}
        user={user}
      />

      {/* Most Requested Section (Only for logged-in doctors) */}
      {currentUser && currentUser.role === 'doctor' && (
        <ProductSlider
          title={lang === 'fr' ? 'Produits les plus demandés' : 'المنتجات الأكثر طلباً'}
          icon={<Flame size={18} className="text-amber-500 animate-pulse" />}
          products={mostRequestedProducts}
          favorites={favorites}
          lang={lang}
          onAddToCart={onAddToCart}
          onToggleFavorite={onToggleFavorite}
          onViewProduct={onViewProduct}
          user={user}
        />
      )}

      {/* Routine Clinic Products Section (Only for logged-in doctors) */}
      {currentUser && currentUser.role === 'doctor' && (
        <ProductSlider
          title={lang === 'fr' ? 'Routine de Clinique' : 'منتجات العيادة الروتينية'}
          icon={<ShoppingBag size={18} className="text-emerald-500" />}
          products={routineClinicProducts}
          favorites={favorites}
          lang={lang}
          onAddToCart={onAddToCart}
          onToggleFavorite={onToggleFavorite}
          onViewProduct={onViewProduct}
          user={user}
        />
      )}

      {/* Category Pills Navigation Filter Bar */}
      <div className="space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {getTranslation(lang, 'categories')}
          </h3>
          {(selectedCategory !== 'all' || searchQuery !== '') && (
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 transition-all cursor-pointer bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 rounded-xl border border-rose-100 dark:border-rose-900/30 shadow-2xs hover:scale-102"
              title={lang === 'fr' ? 'Réinitialiser tous les filtres' : 'إعادة ضبط كل الفلاتر'}
            >
              <X size={12} />
              <span>{lang === 'fr' ? 'Réinitialiser' : 'إعادة ضبط'}</span>
            </button>
          )}
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((cat) => {
            const IconComponent = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4.5 py-2.5 text-xs md:text-sm font-extrabold rounded-full border transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-brand-cyan text-white border-brand-cyan shadow-md shadow-brand-cyan/20 scale-[1.02]'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-brand-cyan/30 dark:hover:border-brand-cyan/50 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <IconComponent size={14} className={isSelected ? 'text-white' : 'text-brand-cyan'} />
                <span>{isRtl ? cat.labelAr : cat.labelFr}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Products Grid list */}
      {loading && catalogProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-cyan"></div>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
            {lang === 'fr' ? 'Chargement des produits...' : 'جاري تحميل المنتجات...'}
          </p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-8 space-y-2 shadow-xs">
          <ShieldAlert className="mx-auto text-slate-300 dark:text-slate-600" size={40} />
          <h4 className="font-bold text-slate-800 dark:text-slate-200 text-base">{lang === 'fr' ? 'Aucun produit trouvé' : 'لم يتم العثور على أي منتجات'}</h4>
          <p className="text-xs text-slate-400 dark:text-slate-500">{lang === 'fr' ? 'Essayez de reformuler votre recherche ou de changer de catégorie.' : 'يرجى محاولة البحث بعبارة أخرى أو تصفح فئة مختلفة.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredProducts.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              lang={lang}
              onAddToCart={onAddToCart}
              isFavorite={favorites.includes(p.id)}
              onToggleFavorite={onToggleFavorite}
              onViewDetails={onViewProduct}
              user={user}
            />
          ))}
        </div>
      )}

      {/* Infinite Scroll trigger element */}
      {hasMore && !searchQuery.trim() && (
        <div ref={loaderRef} className="flex justify-center py-8">
          {loading ? (
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-cyan"></div>
          ) : (
            <div className="h-4 w-4"></div>
          )}
        </div>
      )}

      {/* Search loader */}
      {searchQuery.trim() && loadingSearch && (
        <div className="flex flex-col items-center justify-center py-10 space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-cyan"></div>
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
            {lang === 'fr' ? 'Recherche en cours...' : 'جاري البحث...'}
          </span>
        </div>
      )}

    </div>
  );
}

