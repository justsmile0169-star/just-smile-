import React, { useState, useEffect, useRef } from 'react';
import { WilayaOption, CommuneOption, getWilayas, getCommunesByWilaya } from '../utils/algeriaData';
import { Language } from '../translations';
import { Search, MapPin, ChevronDown, Check, X } from 'lucide-react';

interface SearchableWilayaCommuneSelectorProps {
  lang: Language;
  selectedWilaya: WilayaOption | null;
  selectedCommune: CommuneOption | null;
  onSelectWilaya: (wilaya: WilayaOption | null) => void;
  onSelectCommune: (commune: CommuneOption | null) => void;
  required?: boolean;
}

export default function SearchableWilayaCommuneSelector({
  lang,
  selectedWilaya,
  selectedCommune,
  onSelectWilaya,
  onSelectCommune,
  required = false
}: SearchableWilayaCommuneSelectorProps) {
  const isRtl = lang === 'ar';
  const [wilayas, setWilayas] = useState<WilayaOption[]>([]);
  const [communes, setCommunes] = useState<CommuneOption[]>([]);
  const [loadingWilayas, setLoadingWilayas] = useState(true);
  const [loadingCommunes, setLoadingCommunes] = useState(false);

  // Dropdown states
  const [isWilayaOpen, setIsWilayaOpen] = useState(false);
  const [isCommuneOpen, setIsCommuneOpen] = useState(false);
  const [wilayaSearch, setWilayaSearch] = useState('');
  const [communeSearch, setCommuneSearch] = useState('');

  const wilayaRef = useRef<HTMLDivElement>(null);
  const communeRef = useRef<HTMLDivElement>(null);

  // Load Wilayas on mount
  useEffect(() => {
    getWilayas().then(data => {
      setWilayas(data);
      setLoadingWilayas(false);
    });
  }, []);

  // Load Communes when selected Wilaya changes
  useEffect(() => {
    if (selectedWilaya) {
      setLoadingCommunes(true);
      getCommunesByWilaya(selectedWilaya.code).then(data => {
        setCommunes(data);
        setLoadingCommunes(false);
      });
    } else {
      setCommunes([]);
    }
  }, [selectedWilaya]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wilayaRef.current && !wilayaRef.current.contains(e.target as Node)) {
        setIsWilayaOpen(false);
      }
      if (communeRef.current && !communeRef.current.contains(e.target as Node)) {
        setIsCommuneOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter Wilayas by search query (Code, Arabic name, ASCII name)
  const filteredWilayas = wilayas.filter(w => {
    const q = wilayaSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      w.code.includes(q) ||
      w.nameAr.toLowerCase().includes(q) ||
      w.nameAscii.toLowerCase().includes(q)
    );
  });

  // Filter Communes by search query
  const filteredCommunes = communes.filter(c => {
    const q = communeSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.nameAr.toLowerCase().includes(q) ||
      c.nameAscii.toLowerCase().includes(q)
    );
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ── Wilaya Custom Searchable Dropdown ── */}
      <div className="space-y-1.5 relative" ref={wilayaRef}>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
          {lang === 'fr' ? 'Wilaya' : 'الولاية'} {required && <span className="text-rose-500">*</span>}
        </label>
        
        <div
          onClick={() => setIsWilayaOpen(!isWilayaOpen)}
          className={`w-full bg-white dark:bg-slate-800 border rounded-2xl p-3 flex items-center justify-between cursor-pointer transition-all ${
            isWilayaOpen ? 'border-brand-cyan ring-2 ring-brand-cyan/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <MapPin size={16} className="text-brand-cyan shrink-0" />
            {selectedWilaya ? (
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate">
                {selectedWilaya.code} - {isRtl ? selectedWilaya.nameAr : selectedWilaya.nameAscii}
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-400">
                {loadingWilayas
                  ? (lang === 'fr' ? 'Chargement...' : 'جاري تحميل الولايات...')
                  : (lang === 'fr' ? 'Rechercher / Choisir Wilaya...' : 'ابحث أو اختر الولاية...')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectedWilaya && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectWilaya(null);
                  onSelectCommune(null);
                }}
                className="text-slate-400 hover:text-rose-500 p-1"
              >
                <X size={14} />
              </button>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isWilayaOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Custom In-App Wilaya Dropdown Panel */}
        {isWilayaOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Instant Search Bar inside Dropdown */}
            <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 relative bg-slate-50 dark:bg-slate-800/50">
              <Search size={14} className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRtl ? 'right-5' : 'left-5'}`} />
              <input
                type="text"
                value={wilayaSearch}
                onChange={(e) => setWilayaSearch(e.target.value)}
                placeholder={lang === 'fr' ? 'Rechercher par nom ou code (ex: 17, Djelfa)...' : 'ابحث بالاسم أو الرمز (مثال: 17، الجلفة)...'}
                className={`w-full text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 ${
                  isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
                } focus:outline-none focus:border-brand-cyan`}
                autoFocus
              />
            </div>

            {/* Wilaya Options List */}
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800 p-1">
              {filteredWilayas.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  {lang === 'fr' ? 'Aucune wilaya trouvée' : 'لم يتم العثور على ولاية بهذا الاسم'}
                </p>
              ) : (
                filteredWilayas.map((w) => {
                  const isSelected = selectedWilaya?.code === w.code;
                  return (
                    <button
                      key={w.code}
                      type="button"
                      onClick={() => {
                        onSelectWilaya(w);
                        onSelectCommune(null);
                        setIsWilayaOpen(false);
                        setWilayaSearch('');
                      }}
                      className={`w-full p-2.5 rounded-xl text-left rtl:text-right text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-brand-cyan text-white shadow-xs'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <span className="truncate">
                        <span className="font-mono opacity-70 border border-current px-1.5 py-0.2 rounded mr-1.5 ml-1.5">
                          {w.code}
                        </span>
                        {isRtl ? w.nameAr : w.nameAscii}
                      </span>
                      {isSelected && <Check size={14} className="shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Commune Custom Searchable Dropdown ── */}
      <div className="space-y-1.5 relative" ref={communeRef}>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
          {lang === 'fr' ? 'Commune' : 'البلدية'} {required && <span className="text-rose-500">*</span>}
        </label>

        <div
          onClick={() => {
            if (selectedWilaya) setIsCommuneOpen(!isCommuneOpen);
          }}
          className={`w-full bg-white dark:bg-slate-800 border rounded-2xl p-3 flex items-center justify-between transition-all ${
            !selectedWilaya
              ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-200 dark:border-slate-800'
              : isCommuneOpen
              ? 'border-brand-cyan ring-2 ring-brand-cyan/20 cursor-pointer'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 cursor-pointer'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <MapPin size={16} className="text-brand-cyan shrink-0" />
            {selectedCommune ? (
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate">
                {isRtl ? selectedCommune.nameAr : selectedCommune.nameAscii}
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-400">
                {!selectedWilaya
                  ? (lang === 'fr' ? 'Choisissez d\'abord la Wilaya' : 'اختر الولاية أولاً...')
                  : loadingCommunes
                  ? (lang === 'fr' ? 'Chargement...' : 'جاري تحميل البلديات...')
                  : (lang === 'fr' ? 'Rechercher / Choisir Commune...' : 'ابحث أو اختر البلدية...')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectedCommune && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCommune(null);
                }}
                className="text-slate-400 hover:text-rose-500 p-1"
              >
                <X size={14} />
              </button>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isCommuneOpen ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* Custom In-App Commune Dropdown Panel */}
        {isCommuneOpen && selectedWilaya && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Instant Search Bar inside Dropdown */}
            <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 relative bg-slate-50 dark:bg-slate-800/50">
              <Search size={14} className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRtl ? 'right-5' : 'left-5'}`} />
              <input
                type="text"
                value={communeSearch}
                onChange={(e) => setCommuneSearch(e.target.value)}
                placeholder={lang === 'fr' ? 'Rechercher une commune...' : 'ابحث عن اسم البلدية...'}
                className={`w-full text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 ${
                  isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
                } focus:outline-none focus:border-brand-cyan`}
                autoFocus
              />
            </div>

            {/* Commune Options List */}
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800 p-1">
              {filteredCommunes.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  {lang === 'fr' ? 'Aucune commune trouvée' : 'لم يتم العثور على بلدية'}
                </p>
              ) : (
                filteredCommunes.map((c) => {
                  const isSelected = selectedCommune?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelectCommune(c);
                        setIsCommuneOpen(false);
                        setCommuneSearch('');
                      }}
                      className={`w-full p-2.5 rounded-xl text-left rtl:text-right text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-brand-cyan text-white shadow-xs'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <span className="truncate">
                        {isRtl ? c.nameAr : c.nameAscii}
                      </span>
                      {isSelected && <Check size={14} className="shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
