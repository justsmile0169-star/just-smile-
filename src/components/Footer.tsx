import { Phone, Mail, MapPin } from 'lucide-react';
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
  };

  return (
    <footer
      className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors duration-300"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <img
              src={getLogoUrl(shopInfo.logoUrl)}
              alt={shopInfo.companyName}
              className="h-10 w-auto object-contain"
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

        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-start">
          <p className="text-xs text-slate-400 font-medium">
            © {year} {shopInfo.companyName}. {labels.rights}.
          </p>
          <div className="h-1 w-16 rounded-full bg-gradient-to-r from-brand-dark via-brand-cyan to-brand-dark opacity-60" />
        </div>
      </div>
    </footer>
  );
}
