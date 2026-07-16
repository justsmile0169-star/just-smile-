import { Phone, Mail, MapPin, Facebook, Instagram } from 'lucide-react';
import { Language } from '../translations';
import { ShopInfo } from '../types';
import { getLogoUrl } from '../constants/brand';

interface FooterProps {
  lang: Language;
  shopInfo: ShopInfo;
}

export default function Footer({ lang, shopInfo }: FooterProps) {
  const isRtl = lang === 'ar';
  const year = new Date().getFullYear();

  const labels = {
    contact: isRtl ? 'تواصل معنا' : 'Contact',
    phone: isRtl ? 'الهاتف' : 'Téléphone',
    email: isRtl ? 'البريد الإلكتروني' : 'Email',
    address: isRtl ? 'العنوان' : 'Adresse',
    rights: isRtl ? 'جميع الحقوق محفوظة' : 'Tous droits réservés',
    followUs: isRtl ? 'تابعنا على' : 'Suivez-nous sur',
  };

  const socials = [
    {
      href: 'https://www.facebook.com/profile.php?id=61574673363661',
      icon: Facebook,
      label: 'Facebook',
      color: '#1877F2',
      bg: '#1877F2',
      handle: '@JustSmile',
    },
    {
      href: 'https://www.instagram.com/j.u.st._.s.m.i.l.e/',
      icon: Instagram,
      label: 'Instagram',
      color: '#E1306C',
      bg: 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
      handle: '@j.u.st._.s.m.i.l.e',
    },
  ];

  return (
    <footer
      className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors duration-300"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

          {/* Brand Column */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <img
                src={getLogoUrl(shopInfo.logoUrl)}
                alt={shopInfo.companyName}
                className="h-11 w-auto object-contain"
              />
              <div>
                <p className="text-base font-black text-brand-dark dark:text-slate-100 tracking-tight">
                  {shopInfo.companyName}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mt-0.5">
                  {shopInfo.activity}
                </p>
              </div>
            </div>

            {/* Social Media Section */}
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-brand-cyan mb-3">
                {labels.followUs}
              </p>
              <div className="flex flex-col gap-2.5">
                {socials.map(({ href, icon: Icon, label, color, handle }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm transition-all duration-200"
                  >
                    <div
                      className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 transition-transform duration-200 group-hover:scale-110"
                      style={{ backgroundColor: color }}
                    >
                      <Icon size={18} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 dark:text-slate-100">{label}</p>
                      <p className="text-[10px] text-slate-400 font-medium truncate">{handle}</p>
                    </div>
                    <svg
                      className={`w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0 ${isRtl ? 'mr-auto rotate-180' : 'ml-auto'}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Spacer on md+ */}
          <div className="hidden md:block" />

          {/* Contact info */}
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-brand-cyan">
              {labels.contact}
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                <span className="mt-0.5 p-1.5 rounded-lg bg-brand-cyan/10 text-brand-cyan shrink-0">
                  <Phone size={14} />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{labels.phone}</p>
                  <a href={`tel:${shopInfo.phone.replace(/\s/g, '').split('/')[0]}`} className="font-semibold hover:text-brand-cyan transition-colors">
                    {shopInfo.phone}
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                <span className="mt-0.5 p-1.5 rounded-lg bg-brand-cyan/10 text-brand-cyan shrink-0">
                  <Mail size={14} />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{labels.email}</p>
                  <a href={`mailto:${shopInfo.email}`} className="font-semibold hover:text-brand-cyan transition-colors break-all">
                    {shopInfo.email}
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                <span className="mt-0.5 p-1.5 rounded-lg bg-brand-cyan/10 text-brand-cyan shrink-0">
                  <MapPin size={14} />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{labels.address}</p>
                  <p className="font-semibold">{shopInfo.address}</p>
                </div>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-start">
          <p className="text-xs text-slate-400 font-medium">
            © {year} {shopInfo.companyName}. {labels.rights}.
          </p>
          <div className="h-1 w-16 rounded-full bg-gradient-to-r from-brand-dark via-brand-cyan to-brand-dark opacity-60" />
        </div>
      </div>
    </footer>
  );
}
