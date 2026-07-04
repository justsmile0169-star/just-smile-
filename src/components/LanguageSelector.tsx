import { Language } from '../translations';
import { Languages } from 'lucide-react';

interface LanguageSelectorProps {
  currentLanguage: Language;
  onLanguageChange: (lang: Language) => void;
}

export default function LanguageSelector({ currentLanguage, onLanguageChange }: LanguageSelectorProps) {
  return (
    <button
      onClick={() => onLanguageChange(currentLanguage === 'fr' ? 'ar' : 'fr')}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm font-semibold rounded-lg text-slate-700 hover:text-brand-cyan hover:bg-brand-cyan/5 transition-colors border border-slate-200"
      title={currentLanguage === 'fr' ? 'Changer en Arabe' : 'تغيير إلى الفرنسية'}
    >
      <Languages size={16} className="text-slate-500" />
      <span>{currentLanguage === 'fr' ? 'العربية' : 'Français'}</span>
    </button>
  );
}
