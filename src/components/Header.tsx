import { useState } from 'react';
import { Language, getTranslation } from '../translations';
import LanguageSelector from './LanguageSelector';
import { ShoppingCart, Heart, Bell, User, LogOut, Shield, Stethoscope, LogIn, Sun, Moon, Menu, X, UserCircle } from 'lucide-react';
import { UserProfile } from '../types';
import { getLogoUrl } from '../constants/brand';

interface HeaderProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  cartCount: number;
  favoritesCount: number;
  unreadNotificationsCount: number;
  user: UserProfile | null;
  onLogout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  logoUrl?: string;
  companyName?: string;
}

export default function Header({
  lang,
  onLanguageChange,
  activeTab,
  setActiveTab,
  cartCount,
  favoritesCount,
  unreadNotificationsCount,
  user,
  onLogout,
  theme,
  onToggleTheme,
  logoUrl,
  companyName = 'JUST SMILE',
}: HeaderProps) {
  const isRtl = lang === 'ar';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shadow-xs transition-colors duration-300" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Active User Banner */}
      {user && (
        <div className="bg-brand-cyan/5 border-b border-brand-cyan/10 px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs font-semibold text-brand-cyan">
            <UserCircle size={14} />
            <span>
              {lang === 'fr' ? 'Connecté en tant que' : 'مسجل الدخول كـ'}: {user.name} ({user.role})
            </span>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16 md:h-20 gap-4">

          {/* Logo Section */}
          <div
            onClick={() => setActiveTab('browse')}
            className="flex items-center gap-2 cursor-pointer select-none shrink-0"
          >
            <img
              src={getLogoUrl(logoUrl)}
              alt={companyName}
              className="h-10 w-auto md:h-12 object-contain shrink-0"
            />
            <div className="flex flex-col">
              <span className="text-xl md:text-2xl font-black tracking-tight text-brand-dark dark:text-slate-100">
                {companyName.includes(' ') ? (
                  <>
                    {companyName.split(' ')[0]}{' '}
                    <span className="text-brand-cyan">{companyName.split(' ').slice(1).join(' ')}</span>
                  </>
                ) : (
                  companyName
                )}
              </span>
              <span className="text-[9px] md:text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-400 font-extrabold -mt-1 leading-none">
                {getTranslation(lang, 'tagline')}
              </span>
            </div>
          </div>

          {/* Navigation Links for Large Screens */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('browse')}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                activeTab === 'browse'
                  ? 'bg-brand-cyan/10 text-brand-cyan'
                  : 'text-slate-600 dark:text-slate-300 hover:text-brand-cyan hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {getTranslation(lang, 'browse')}
            </button>

            {user && (
              <button
                onClick={() => setActiveTab('favorites')}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                  activeTab === 'favorites'
                    ? 'bg-brand-cyan/10 text-brand-cyan'
                    : 'text-slate-600 dark:text-slate-300 hover:text-brand-cyan hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {getTranslation(lang, 'favorites')}
              </button>
            )}

            {user && user.role === 'doctor' && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-brand-cyan/10 text-brand-cyan'
                    : 'text-slate-600 dark:text-slate-300 hover:text-brand-cyan hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {getTranslation(lang, 'dashboard')}
              </button>
            )}

            {user && user.role !== 'doctor' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                  activeTab === 'admin'
                    ? 'bg-brand-cyan/10 text-brand-cyan'
                    : 'text-slate-600 dark:text-slate-300 hover:text-brand-cyan hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {getTranslation(lang, 'admin')}
              </button>
            )}
          </nav>

          {/* Actions Menu */}
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {/* Hamburger Menu Button (Mobile) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-2xs"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            {/* Language Selector (Desktop only) */}
            <div className="hidden lg:block">
              <LanguageSelector currentLanguage={lang} onLanguageChange={onLanguageChange} />
            </div>

            {/* Theme Toggle Button (Desktop only) */}
            <button
              onClick={onToggleTheme}
              className="hidden lg:block p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-2xs"
              title={theme === 'light' ? (lang === 'fr' ? 'Mode sombre' : 'الوضع الداكن') : (lang === 'fr' ? 'Mode clair' : 'الوضع المضيء')}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            {/* Cart Icon (Desktop only) */}
            <button
              onClick={() => setActiveTab('cart')}
              className={`hidden lg:flex relative p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-all ${
                activeTab === 'cart' ? 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30' : 'bg-slate-50/50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300'
              }`}
            >
              <ShoppingCart size={18} />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-extrabold text-[10px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white animate-pulse">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Favorites (Desktop only) */}
            {user && (
              <button
                onClick={() => setActiveTab('favorites')}
                className={`hidden lg:flex relative p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-all ${
                  activeTab === 'favorites' ? 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30' : 'bg-slate-50/50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Heart size={18} />
                {favoritesCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-brand-cyan text-white font-extrabold text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full border border-white">
                    {favoritesCount}
                  </span>
                )}
              </button>
            )}

            {/* Notifications Icon (Desktop only) */}
            {user && (
              <button
                onClick={() => setActiveTab('notifications')}
                className={`hidden lg:flex relative p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-all ${
                  activeTab === 'notifications' ? 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/30' : 'bg-slate-50/50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Bell size={18} />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white font-extrabold text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full border border-white">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>
            )}

            {/* User Dropdown / Login Button (Desktop only) */}
            {user ? (
              <div className="hidden lg:flex items-center gap-2 pl-1 border-l border-slate-100 dark:border-slate-800 md:pl-3 md:gap-3">
                <button
                  onClick={() => setActiveTab(user.role === 'doctor' ? 'dashboard' : 'admin')}
                  className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:text-brand-cyan transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-cyan/10 flex items-center justify-center border border-brand-cyan/20 shrink-0">
                    {user.role === 'doctor' ? <Stethoscope size={16} className="text-brand-cyan" /> : <Shield size={16} className="text-brand-cyan" />}
                  </div>
                  <span className="hidden md:inline font-semibold text-xs text-slate-700 dark:text-slate-200 truncate max-w-[100px]">
                    {user.name.split(' ')[0]}
                  </span>
                </button>

                <button
                  onClick={onLogout}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                  title={getTranslation(lang, 'logout')}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setActiveTab('auth')}
                className="hidden lg:flex items-center gap-1.5 bg-brand-cyan text-white font-bold text-xs md:text-sm px-4 py-2.5 rounded-xl hover:bg-brand-cyan/90 transition-all shadow-xs shrink-0"
              >
                <LogIn size={16} />
                <span>{getTranslation(lang, 'login')}</span>
              </button>
            )}

          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <nav className="px-4 py-4 space-y-2">
            <button
              onClick={() => {
                setActiveTab('browse');
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition-all ${
                activeTab === 'browse'
                  ? 'bg-brand-cyan/10 text-brand-cyan'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {getTranslation(lang, 'browse')}
            </button>

            {user && (
              <button
                onClick={() => {
                  setActiveTab('favorites');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'favorites'
                    ? 'bg-brand-cyan/10 text-brand-cyan'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {getTranslation(lang, 'favorites')}
              </button>
            )}

            {user && user.role === 'doctor' && (
              <button
                onClick={() => {
                  setActiveTab('dashboard');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-brand-cyan/10 text-brand-cyan'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {getTranslation(lang, 'dashboard')}
              </button>
            )}

            {user && user.role !== 'doctor' && (
              <button
                onClick={() => {
                  setActiveTab('admin');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'admin'
                    ? 'bg-brand-cyan/10 text-brand-cyan'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {getTranslation(lang, 'admin')}
              </button>
            )}

            {/* Mobile Theme Toggle */}
            <button
              onClick={() => {
                onToggleTheme();
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-4 py-3 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-3"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              {theme === 'light' ? (lang === 'fr' ? 'Mode sombre' : 'الوضع الداكن') : (lang === 'fr' ? 'Mode clair' : 'الوضع المضيء')}
            </button>

            {/* Divider */}
            <div className="border-t border-slate-100 dark:border-slate-800 my-2"></div>

            {/* Language Selector in Mobile Menu */}
            <div className="px-4 py-3">
              <LanguageSelector currentLanguage={lang} onLanguageChange={onLanguageChange} />
            </div>

            {/* Cart Button in Mobile Menu */}
            <button
              onClick={() => {
                setActiveTab('cart');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-4 py-3 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-3"
            >
              <ShoppingCart size={18} />
              {getTranslation(lang, 'cart')}
              {cartCount > 0 && (
                <span className="ml-auto bg-brand-cyan text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Notifications in Mobile Menu */}
            {user && (
              <button
                onClick={() => {
                  setActiveTab('notifications');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-3 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-3"
              >
                <Bell size={18} />
                {getTranslation(lang, 'notifications')}
                {unreadNotificationsCount > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>
            )}

            {/* Login/Logout Button in Mobile Menu */}
            {user ? (
              <>
                <button
                  onClick={() => {
                    setActiveTab(user.role === 'doctor' ? 'dashboard' : 'admin');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-3"
                >
                  <User size={18} />
                  {user.name.split(' ')[0]}
                </button>
                <button
                  onClick={() => {
                    onLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all flex items-center gap-3"
                >
                  <LogOut size={18} />
                  {getTranslation(lang, 'logout')}
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setActiveTab('auth');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-3 rounded-xl font-semibold bg-brand-cyan text-white hover:bg-brand-cyan/90 transition-all flex items-center gap-3"
              >
                <LogIn size={18} />
                {getTranslation(lang, 'login')}
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
