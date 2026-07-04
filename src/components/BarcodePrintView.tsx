import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Product } from '../types';
import { Language, getTranslation } from '../translations';
import { Printer, X } from 'lucide-react';

interface BarcodePrintViewProps {
  product: Product;
  lang: Language;
  onClose: () => void;
}

export default function BarcodePrintView({ product, lang, onClose }: BarcodePrintViewProps) {
  const [qrUrl, setQrUrl] = useState('');

  const code = product.barcode?.trim() || product.id;

  useEffect(() => {
    QRCode.toDataURL(code, { width: 160, margin: 1 }).then(setQrUrl).catch(console.error);
  }, [code]);

  const handlePrint = () => {
    const el = document.getElementById('barcode-label-print');
    if (!el) return;
    const w = window.open('', '_blank', 'width=320,height=400');
    if (!w) return;
    w.document.write(`
      <html><head><title>Barcode ${product.name}</title>
      <style>
        @page { size: 58mm 40mm; margin: 2mm; }
        body { font-family: Arial, sans-serif; text-align: center; margin: 0; padding: 4mm; }
        img { max-width: 100%; height: auto; }
        .name { font-size: 9px; font-weight: bold; margin-top: 2mm; word-break: break-word; }
        .code { font-family: monospace; font-size: 11px; letter-spacing: 1px; margin-top: 1mm; }
        .price { font-size: 10px; margin-top: 1mm; }
      </style></head><body>${el.innerHTML}</body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(n) +
    ' ' + getTranslation(lang, 'currency');

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 flex items-center justify-center p-4 no-print">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100">
          <span className="font-extrabold text-slate-900 text-sm">
            {lang === 'fr' ? 'Étiquette Code-Barres' : 'ملصق الباركود'}
          </span>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center gap-4">
          <div id="barcode-label-print" className="border border-slate-200 rounded-xl p-4 bg-white w-full max-w-[220px]">
            {qrUrl && <img src={qrUrl} alt="Barcode" className="mx-auto w-32 h-32" />}
            <p className="name text-xs font-bold text-slate-800 mt-2 text-center leading-tight">{product.name}</p>
            <p className="code text-center font-mono text-sm text-slate-600 mt-1">{code}</p>
            <p className="price text-center text-sm font-black text-brand-cyan mt-1">{fmt(product.price)}</p>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="w-full flex items-center justify-center gap-2 bg-brand-cyan text-white font-bold py-3 rounded-xl hover:bg-brand-cyan/90"
          >
            <Printer size={18} />
            {lang === 'fr' ? 'Imprimer l\'étiquette' : 'طباعة الملصق'}
          </button>
        </div>
      </div>
    </div>
  );
}
