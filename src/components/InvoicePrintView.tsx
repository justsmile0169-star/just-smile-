import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Order, UserProfile, ShopInfo } from '../types';
import { Language } from '../translations';
import { Printer, X, Download, FileText, Receipt, Loader2 } from 'lucide-react';
import { getLogoUrl } from '../constants/brand';

interface InvoicePrintViewProps {
  order: Order;
  doctor: UserProfile | null;
  lang: Language;
  shopInfo: ShopInfo;
  onClose: () => void;
}

const C = {
  navy: '#1A3A5C',
  blue: '#2563A8',
  blueLight: '#E8F1FA',
  gold: '#B8963E',
  goldLight: '#F9F5EC',
  gray: '#64748B',
  grayLight: '#F8FAFC',
  border: '#DDE4ED',
  text: '#1E293B',
  credit: '#9A3412',
  creditBg: '#FFF7ED',
  creditBorder: '#FDBA74',
  cash: '#166534',
  cashBg: '#F0FDF4',
  cashBorder: '#86EFAC',
};

export default function InvoicePrintView({ order, doctor, lang, shopInfo, onClose }: InvoicePrintViewProps) {
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [printMode, setPrintMode] = useState<'a4' | 'thermal'>('a4');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    const orderIdParam = order.id || '';
    const verificationUrl = `${window.location.origin}/?verifyOrder=${encodeURIComponent(orderIdParam)}`;

    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 280;

    QRCode.toCanvas(canvas, verificationUrl, {
      width: 280,
      margin: 1,
      color: {
        dark: '#1A3A5C', // Brand Navy
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'H'
    }).then(() => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw central branded logo badge
        const center = 140;
        const badgeSize = 64;
        const radius = 14;

        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(26, 58, 92, 0.25)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(center - badgeSize / 2, center - badgeSize / 2, badgeSize, badgeSize, radius);
        } else {
          ctx.rect(center - badgeSize / 2, center - badgeSize / 2, badgeSize, badgeSize);
        }
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = '#2563A8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(center - badgeSize / 2, center - badgeSize / 2, badgeSize, badgeSize, radius);
        } else {
          ctx.rect(center - badgeSize / 2, center - badgeSize / 2, badgeSize, badgeSize);
        }
        ctx.stroke();

        // Vector Branding - Pure untainted canvas rendering
        ctx.fillStyle = '#1A3A5C';
        ctx.font = '900 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('JUST', center, center - 9);

        ctx.fillStyle = '#B8963E';
        ctx.font = '900 11px sans-serif';
        ctx.fillText('SMILE', center, center + 7);

        // Smile arc
        ctx.strokeStyle = '#2563A8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(center, center + 13, 10, 0.25 * Math.PI, 0.75 * Math.PI);
        ctx.stroke();
      }

      setQrDataUrl(canvas.toDataURL('image/png'));
    }).catch((err) => {
      console.error('Error generating branded QR Canvas:', err);
      QRCode.toDataURL(verificationUrl, { width: 140, margin: 1 })
        .then(setQrDataUrl)
        .catch(console.error);
    });
  }, [order.id]);

  useEffect(() => {
    document.body.classList.remove('print-mode-a4', 'print-mode-thermal');
    document.body.classList.add(`print-mode-${printMode}`);
    return () => {
      document.body.classList.remove('print-mode-a4', 'print-mode-thermal');
    };
  }, [printMode]);

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n));
  const tvaRate = shopInfo.tvaRate ?? 19;

  const totalTTC = order.totalAfterDiscount;
  const totalHT = Math.round(totalTTC / (1 + tvaRate / 100));
  const montantTVA = totalTTC - totalHT;
  const totalRemise = order.discountAmount;

  const isCash = order.paymentMethod === 'cash';
  const invoiceNum = order.id ? order.id.slice(-8).toUpperCase() : 'UNKNOWN';
  const invoiceDate = new Date(order.createdAt).toLocaleDateString('fr-FR');
  const deadlineDate = new Date(order.deadlineDate).toLocaleDateString('fr-FR');

  const handlePrint = () => setShowPrintConfirm(true);
  
  const executePrint = () => {
    setShowPrintConfirm(false);
    const origTitle = document.title;
    document.title = `Facture_${invoiceNum}`;
    window.print();
    document.title = origTitle;
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const el = document.getElementById('invoice-a4');
      if (!el) {
        executePrint();
        return;
      }
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#FFFFFF',
        onclone: (_clonedDoc, clonedEl) => {
          const qrImg = clonedEl.querySelector('img[alt="QR Verification"]') as HTMLImageElement;
          if (qrImg && qrDataUrl) {
            qrImg.src = qrDataUrl;
            qrImg.style.display = 'block';
            qrImg.style.visibility = 'visible';
          }
        }
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Facture_${invoiceNum}.pdf`);
    } catch (err) {
      console.error('Direct PDF export error, triggering print dialog:', err);
      executePrint();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const serif = "'Cormorant Garamond', Georgia, serif";
  const sans = "'DM Sans', 'Segoe UI', sans-serif";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-2 overflow-y-auto invoice-print-overlay">
      {/* Top action header */}
      <div className="fixed top-4 right-4 z-[60] flex items-center gap-2 flex-wrap no-print">
        {/* Mode Switcher Tabs */}
        <div className="bg-slate-800/90 backdrop-blur-md p-1 rounded-2xl flex items-center border border-slate-700 shadow-xl">
          <button
            type="button"
            onClick={() => setPrintMode('a4')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
              printMode === 'a4'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <FileText size={14} />
            <span>Format A4</span>
          </button>
          <button
            type="button"
            onClick={() => setPrintMode('thermal')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
              printMode === 'thermal'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Receipt size={14} />
            <span>Thermal 80mm</span>
          </button>
        </div>

        {/* Action Buttons */}
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={isGeneratingPdf}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-lg transition-all disabled:opacity-50 cursor-pointer"
        >
          {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          <span>{lang === 'fr' ? 'Télécharger PDF' : 'تنزيل PDF'}</span>
        </button>

        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-xl shadow-lg hover:bg-slate-50 transition-all cursor-pointer"
        >
          <Printer size={16} />
          <span>{printMode === 'thermal' ? 'Imprimer Thermal' : 'Imprimer A4'}</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-slate-800 rounded-xl shadow-lg cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {printMode === 'a4' ? (
        <div id="invoice-a4" style={{
          width: '210mm',
          minHeight: '297mm',
          background: '#FFFFFF',
          fontFamily: sans,
          fontSize: '9pt',
          color: C.text,
          margin: '60px auto 20px',
          boxShadow: '0 24px 64px rgba(26,58,92,0.18)',
          position: 'relative',
          overflow: 'hidden',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}>

          {/* Top accent */}
          <div style={{ height: '5px', background: `linear-gradient(90deg, ${C.navy} 0%, ${C.blue} 55%, ${C.gold} 100%)` }} />

          <div style={{ padding: '11mm 14mm 10mm' }}>

            {/* ── HEADER ── */}
            <div style={{ display: 'flex', gap: '10mm', alignItems: 'flex-start', paddingBottom: '7mm', borderBottom: `1.5px solid ${C.border}`, marginBottom: '7mm' }}>
              {/* Logo + Company */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <img
                    src={getLogoUrl(shopInfo.logoUrl)}
                    alt={shopInfo.companyName}
                    style={{ width: '56px', height: 'auto', maxHeight: '56px', objectFit: 'contain', flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontFamily: serif, fontSize: '22pt', fontWeight: 700, color: C.navy, lineHeight: 1.05, letterSpacing: '-0.3px' }}>
                      {shopInfo.companyName}
                    </div>
                    <div style={{ fontSize: '7.5pt', fontWeight: 600, color: C.blue, letterSpacing: '0.8px', marginTop: '3px', textTransform: 'uppercase' }}>
                      {shopInfo.activity}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '7px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', fontSize: '7.5pt', color: C.gray, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, color: '#94A3B8' }}>Tél.</span><span>{shopInfo.phone}</span>
                  <span style={{ fontWeight: 600, color: '#94A3B8' }}>Email</span><span>{shopInfo.email}</span>
                  <span style={{ fontWeight: 600, color: '#94A3B8' }}>Adresse</span><span>{shopInfo.address}</span>
                </div>

                <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '7pt', color: '#94A3B8' }}>
                  <span><b style={{ color: C.gray }}>NRC</b> {shopInfo.nrc}</span>
                  <span style={{ color: C.border }}>|</span>
                  <span><b style={{ color: C.gray }}>NIF</b> {shopInfo.nif}</span>
                  <span style={{ color: C.border }}>|</span>
                  <span><b style={{ color: C.gray }}>NIS</b> {shopInfo.nis}</span>
                </div>
              </div>
              {qrDataUrl && (
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{
                    padding: '3px',
                    background: 'white',
                    borderRadius: '10px',
                    border: `1.5px solid ${C.border}`,
                    boxShadow: '0 2px 8px rgba(26,58,92,0.08)',
                    display: 'inline-block'
                  }}>
                    <img src={qrDataUrl} alt="QR Verification" style={{ width: '82px', height: '82px', display: 'block', borderRadius: '6px' }} />
                  </div>
                  <div style={{ fontSize: '5.5pt', color: C.navy, fontWeight: 700, marginTop: '3px', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                    Scan to Verify 🛡️
                  </div>
                </div>
              )}
            </div>

            {/* ── DOCUMENT TITLE (centered) ── */}
            <div style={{ textAlign: 'center', marginBottom: '8mm' }}>
              <div style={{ display: 'inline-block', position: 'relative', padding: '0 20px' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', background: C.gold, opacity: 0.5 }} />
                <div style={{ background: 'white', padding: '0 16px', position: 'relative' }}>
                  <div style={{ fontFamily: serif, fontSize: '20pt', fontWeight: 700, color: C.navy, letterSpacing: '3px', lineHeight: 1.1 }}>
                    FACTURE
                  </div>
                  <div style={{ fontSize: '7.5pt', fontWeight: 600, color: C.gold, letterSpacing: '4px', marginTop: '2px' }}>
                    BON DE LIVRAISON
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '6px', fontFamily: serif, fontSize: '14pt', fontWeight: 700, color: C.blue, letterSpacing: '1px' }}>
                N° {invoiceNum}
              </div>
              {order.paymentStatus === 'paid' && (
                <div style={{ marginTop: '5px' }}>
                  <span style={{ background: C.cashBg, color: C.cash, fontSize: '6.5pt', fontWeight: 700, padding: '2px 12px', borderRadius: '20px', border: `1px solid ${C.cashBorder}`, letterSpacing: '1px' }}>PAYÉE</span>
                </div>
              )}
            </div>

            {/* ── CLIENT + PAYMENT INFO ── */}
            <div style={{ marginBottom: '7mm' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 0.8fr 0.9fr 0.9fr',
                gap: '0',
                border: `1px solid ${C.border}`,
                borderRadius: '8px',
                overflow: 'hidden',
                background: C.grayLight,
              }}>
                {[
                  { label: 'Nom du client', value: order.doctorName, bold: true },
                  { label: 'Date', value: invoiceDate },
                  { label: 'Mode de paiement', value: isCash ? 'Comptant / Livraison' : 'Crédit 15 jours', accent: true },
                  { label: 'Commercial', value: order.commercialName || 'Directe' },
                ].map((field, i) => (
                  <div key={i} style={{
                    padding: '5px 10px',
                    borderRight: i < 3 ? `1px solid ${C.border}` : 'none',
                    borderBottom: `1px solid ${C.border}`,
                  }}>
                    <div style={{ fontSize: '6pt', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>
                      {field.label}
                    </div>
                    <div style={{ fontSize: '8.5pt', fontWeight: field.bold ? 700 : 600, color: field.accent ? C.blue : C.text, lineHeight: 1.3 }}>
                      {field.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Client details row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '5mm',
                marginTop: '4mm',
                alignItems: 'stretch',
              }}>
                <div style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: '8px',
                  padding: '4mm 5mm',
                  background: 'white',
                  fontSize: '7.5pt',
                  color: C.gray,
                  lineHeight: 1.7,
                }}>
                  <span style={{ fontWeight: 700, color: '#94A3B8', fontSize: '6.5pt', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cabinet — </span>
                  <span style={{ fontWeight: 600, color: C.text }}>{order.doctorClinic}</span>
                  <span style={{ margin: '0 8px', color: C.border }}>|</span>
                  <span style={{ fontWeight: 700, color: '#94A3B8' }}>Tél. </span>{order.doctorPhone}
                  {(order.doctorWilayaName || doctor?.location) && (
                    <>
                      <span style={{ margin: '0 8px', color: C.border }}>|</span>
                      <span style={{ fontWeight: 700, color: '#94A3B8' }}>Adr. </span>
                      {order.doctorWilayaName ? `${order.doctorWilayaName}${order.doctorCommuneName ? ` (${order.doctorCommuneName})` : ''}` : doctor?.location}
                    </>
                  )}
                </div>

                {/* Conditions de paiement */}
                <div style={{
                  minWidth: '72mm',
                  borderRadius: '8px',
                  padding: '4mm 5mm',
                  border: `2px solid ${isCash ? C.cashBorder : C.creditBorder}`,
                  background: isCash ? C.cashBg : C.creditBg,
                  boxShadow: isCash ? 'none' : '0 2px 8px rgba(154,52,18,0.08)',
                }}>
                  <div style={{
                    fontSize: '6.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
                    color: isCash ? C.cash : C.credit, marginBottom: '4px',
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: isCash ? C.cash : C.credit, display: 'inline-block',
                    }} />
                    Conditions de paiement
                  </div>
                  <div style={{ fontSize: '9pt', fontWeight: 700, color: isCash ? C.cash : C.credit, lineHeight: 1.35 }}>
                    {isCash ? 'Paiement à la livraison' : 'Paiement à crédit – Échéance: 15 jours'}
                  </div>
                  <div style={{ fontSize: '7pt', fontWeight: 500, color: isCash ? '#15803D' : '#C2410C', marginTop: '3px' }}>
                    {isCash ? 'Payé à la réception' : `Crédit client: paiement sous 15 jours — ${deadlineDate}`}
                  </div>
                </div>
              </div>
            </div>

            {/* ── ITEMS TABLE ── */}
            <div style={{ marginBottom: '6mm' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
                <thead>
                  <tr style={{ background: C.navy, color: 'white' }}>
                    {[
                      { h: 'N°', align: 'center' as const, w: '4%' },
                      { h: 'Code', align: 'left' as const, w: '8%' },
                      { h: 'Désignation', align: 'left' as const, w: '26%' },
                      { h: 'Qté', align: 'center' as const, w: '6%' },
                      { h: 'Prix Unit. TTC', align: 'right' as const, w: '11%' },
                      { h: 'Remise Produit', align: 'center' as const, w: '9%' },
                      { h: 'Remise Facture', align: 'center' as const, w: '9%' },
                      { h: 'Prix Vente TTC', align: 'right' as const, w: '11%' },
                      { h: 'Montant TTC', align: 'right' as const, w: '11%' },
                    ].map((col, i) => (
                      <th key={i} style={{
                        padding: '6px 7px', fontWeight: 600, fontSize: '6.5pt',
                        letterSpacing: '0.3px', textAlign: col.align, whiteSpace: 'nowrap',
                        borderRight: i < 8 ? '1px solid rgba(255,255,255,0.12)' : 'none',
                        width: col.w,
                      }}>{col.h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, idx) => {
                    const disc = item.discountPercent ?? 0;
                    const pu = Math.round(item.price / (1 - disc / 100)) || item.price;
                    const extraDiscType = (item as any).extraDiscountType as 'percent' | 'cash' | undefined;
                    const extraDiscValue = (item as any).extraDiscountValue as number | undefined;
                    const extraDiscAmount = (item as any).extraDiscountAmount as number | undefined;
                    const pv = item.price;
                    const finalPv = extraDiscAmount && extraDiscAmount > 0
                      ? Math.max(0, pv - Math.round(extraDiscAmount / item.quantity))
                      : pv;
                    const montant = finalPv * item.quantity;
                    return (
                      <tr key={idx} style={{
                        background: idx % 2 === 0 ? '#FFFFFF' : C.grayLight,
                        borderBottom: `1px solid ${C.border}`,
                      }}>
                        <td style={{ padding: '5px 7px', textAlign: 'center', color: '#94A3B8', fontWeight: 600, borderRight: `1px solid ${C.border}` }}>{idx + 1}</td>
                        <td style={{ padding: '5px 7px', color: C.gray, fontFamily: 'monospace', fontSize: '6.5pt', borderRight: `1px solid ${C.border}` }}>
                          {item.productId?.slice(-6).toUpperCase() || '—'}
                        </td>
                        <td style={{ padding: '5px 7px', fontWeight: 600, color: C.text, borderRight: `1px solid ${C.border}` }}>
                          {item.name}
                          {item.variantName && (
                            <div style={{ fontSize: '6.5pt', color: '#6B21A8', fontWeight: 700, marginTop: '1px' }}>
                              Option: {item.variantName}
                            </div>
                          )}
                          {item.category && <div style={{ fontSize: '6.5pt', color: '#94A3B8', fontWeight: 500, marginTop: '1px' }}>{item.category}</div>}
                        </td>
                        <td style={{ padding: '5px 7px', textAlign: 'center', fontWeight: 700, borderRight: `1px solid ${C.border}` }}>{item.quantity}</td>
                        <td style={{ padding: '5px 7px', textAlign: 'right', color: C.gray, borderRight: `1px solid ${C.border}` }}>{fmt(pu)}</td>
                        <td style={{ padding: '5px 7px', textAlign: 'center', color: disc > 0 ? '#DC2626' : '#CBD5E1', fontWeight: disc > 0 ? 700 : 400, borderRight: `1px solid ${C.border}` }}>
                          {disc > 0 ? `${disc}%` : '—'}
                        </td>
                        <td style={{ padding: '5px 7px', textAlign: 'center', borderRight: `1px solid ${C.border}` }}>
                          {extraDiscValue && extraDiscValue > 0 ? (
                            <span style={{ color: '#7C3AED', fontWeight: 700 }}>
                              {extraDiscType === 'percent'
                                ? `-${extraDiscValue}%`
                                : `-${fmt(extraDiscValue)} DA`}
                            </span>
                          ) : <span style={{ color: '#CBD5E1' }}>—</span>}
                        </td>
                        <td style={{ padding: '5px 7px', textAlign: 'right', color: C.gray, borderRight: `1px solid ${C.border}` }}>{fmt(finalPv)}</td>
                        <td style={{ padding: '5px 7px', textAlign: 'right', fontWeight: 700, color: C.navy }}>{fmt(montant)}</td>
                      </tr>
                    );
                  })}
                  {order.items.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: '12px', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' }}>Aucun article</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── FOOTER: Notes + Totals ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10mm' }}>
              <div style={{ flex: 1, fontSize: '7pt', color: '#94A3B8', lineHeight: 1.65, maxWidth: '95mm' }}>
                <div style={{ fontWeight: 700, color: C.gray, marginBottom: '4px', fontSize: '7pt', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Notes
                </div>
                <div>• Toute facture doit être réglée sous 20 jours à compter de la date de livraison.</div>
                <div>• Modes acceptés : Virement, CCP, Espèces, Chèque.</div>
                <div>• En cas de litige, compétence exclusive du tribunal d'Alger.</div>
                <div style={{ marginTop: '5px', fontSize: '6.5pt', fontStyle: 'italic', color: '#CBD5E1' }}>
                  Document généré électroniquement — {shopInfo.companyName}
                </div>
              </div>

              {/* Totals box */}
              <div style={{ minWidth: '68mm', border: `1.5px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ background: C.navy, padding: '5px 10px' }}>
                  <span style={{ fontSize: '7pt', fontWeight: 600, color: 'rgba(255,255,255,0.85)', letterSpacing: '1px', textTransform: 'uppercase' }}>Récapitulatif</span>
                </div>
                {[
                  { label: 'Total HT', val: `${fmt(totalHT)} DA` },
                  { label: 'Total Remise', val: totalRemise > 0 ? `−${fmt(totalRemise)} DA` : '—', red: totalRemise > 0 },
                  { label: `TVA (${tvaRate}%)`, val: `${fmt(montantTVA)} DA` },
                  { label: 'Total TTC', val: `${fmt(totalTTC)} DA`, bold: true, sep: true },
                ].map((row, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 10px',
                    borderTop: row.sep ? `1.5px solid ${C.border}` : `1px solid #F1F5F9`,
                    background: row.sep ? C.blueLight : 'white',
                  }}>
                    <span style={{ fontSize: '7.5pt', color: C.gray, fontWeight: row.bold ? 700 : 500 }}>{row.label}</span>
                    <span style={{ fontSize: '7.5pt', color: row.red ? '#DC2626' : row.bold ? C.navy : C.text, fontWeight: row.bold ? 800 : 600 }}>{row.val}</span>
                  </div>
                ))}
                <div style={{
                  background: `linear-gradient(135deg, ${C.navy}, ${C.blue})`,
                  padding: '7px 10px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderTop: `2px solid ${C.gold}`,
                }}>
                  <span style={{ fontSize: '8pt', fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.5px' }}>Net à payer</span>
                  <span style={{ fontFamily: serif, fontSize: '12pt', fontWeight: 700, color: C.gold }}>{fmt(order.remainingBalance)} DA</span>
                </div>
                {order.paidAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', background: C.cashBg, borderTop: `1px solid ${C.cashBorder}` }}>
                    <span style={{ fontSize: '7pt', color: C.cash, fontWeight: 600 }}>Montant payé</span>
                    <span style={{ fontSize: '7pt', color: C.cash, fontWeight: 700 }}>{fmt(order.paidAmount)} DA</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── SIGNATURES ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8mm', marginTop: '10mm', paddingTop: '6mm', borderTop: `1px solid ${C.border}` }}>
              {[
                { title: 'Signature Client' },
                { title: 'Signature Livreur' },
                { title: "Cachet de l'Entreprise", stamp: true },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '6.5pt', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '5px' }}>
                    {s.title}
                  </div>
                  <div style={{
                    height: '20mm', border: `1px dashed ${C.border}`, borderRadius: '6px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.grayLight,
                  }}>
                    {s.stamp && (
                      <div style={{
                        border: `2px solid ${C.gold}`, borderRadius: '50%',
                        padding: '5px 12px', transform: 'rotate(-4deg)',
                      }}>
                        <div style={{ fontFamily: serif, fontSize: '7pt', fontWeight: 700, color: C.navy, letterSpacing: '0.5px' }}>{shopInfo.companyName}</div>
                        <div style={{ fontSize: '5.5pt', fontWeight: 600, color: C.gold, letterSpacing: '1px', marginTop: '1px' }}>ACQUITTÉ</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom accent */}
          <div style={{ height: '4px', background: `linear-gradient(90deg, ${C.gold}, ${C.navy})` }} />
        </div>
      ) : (
        /* Render 80mm Thermal Receipt Preview */
        <div id="invoice-thermal-container" className="my-16 mx-auto">
          <div
            id="invoice-thermal"
            style={{
              width: '80mm',
              minHeight: '130mm',
              background: '#FFFFFF',
              fontFamily: 'monospace',
              fontSize: '8.5pt',
              color: '#000000',
              padding: '6mm 5mm',
              borderRadius: '12px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
              margin: '0 auto',
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
          >
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13pt', color: C.navy }}>
              {shopInfo.companyName}
            </div>
            <div style={{ textAlign: 'center', fontSize: '7.5pt', color: '#555', marginTop: '2px' }}>
              {shopInfo.activity}
            </div>
            <div style={{ textAlign: 'center', fontSize: '7.5pt', color: '#666', marginTop: '2px' }}>
              Tél: {shopInfo.phone}
            </div>

            <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '8px 0', textAlign: 'center', fontWeight: 'bold', fontSize: '9pt' }}>
              BON DE LIVRAISON / FACTURE N° {invoiceNum}
            </div>

            <div style={{ fontSize: '7.5pt', lineHeight: 1.5, marginBottom: '8px' }}>
              <div><b>Date:</b> {invoiceDate}</div>
              <div><b>Client:</b> {order.doctorName}</div>
              <div><b>Cabinet:</b> {order.doctorClinic}</div>
              <div><b>Tél Client:</b> {order.doctorPhone}</div>
              <div><b>Mode:</b> {isCash ? 'Comptant (COD)' : 'Crédit (15j)'}</div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt', margin: '8px 0' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000', textAlign: 'left' }}>
                  <th style={{ padding: '3px 0' }}>Désignation</th>
                  <th style={{ textAlign: 'center', padding: '3px 0' }}>Qté</th>
                  <th style={{ textAlign: 'right', padding: '3px 0' }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px dashed #eee' }}>
                    <td style={{ padding: '3px 0', wordBreak: 'break-word' }}>
                      {item.name}
                      {item.variantName && <div style={{ fontSize: '6.5pt', color: '#666' }}>({item.variantName})</div>}
                    </td>
                    <td style={{ textAlign: 'center', padding: '3px 0', fontWeight: 'bold' }}>x{item.quantity}</td>
                    <td style={{ textAlign: 'right', padding: '3px 0', fontWeight: 'bold' }}>{fmt(item.price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: '1.5px solid #000', paddingTop: '6px', marginTop: '6px', fontSize: '8.5pt' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                <span>NET À PAYER TTC:</span>
                <span>{fmt(totalTTC)} DA</span>
              </div>
              {order.paidAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt', color: '#166534', marginTop: '2px' }}>
                  <span>Montant Payé:</span>
                  <span>{fmt(order.paidAmount)} DA</span>
                </div>
              )}
              {order.remainingBalance > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5pt', color: '#9A3412', marginTop: '2px', fontWeight: 'bold' }}>
                  <span>Reste Dû:</span>
                  <span>{fmt(order.remainingBalance)} DA</span>
                </div>
              )}
            </div>

            {qrDataUrl && (
              <div style={{ textAlign: 'center', marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed #aaa' }}>
                <img src={qrDataUrl} alt="QR Verification" style={{ width: '76px', height: '76px', margin: '0 auto', display: 'block' }} />
                <div style={{ fontSize: '6pt', marginTop: '3px', fontWeight: 'bold', color: C.navy }}>SCAN TO VERIFY 🛡️</div>
              </div>
            )}
            <div style={{ textAlign: 'center', fontSize: '6.5pt', marginTop: '8px', color: '#666' }}>
              Merci pour votre confiance !<br />www.justsmile.dz
            </div>
          </div>
        </div>
      )}

      {showPrintConfirm && (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full border border-slate-100 shadow-2xl text-center space-y-6">
            <div className="mx-auto w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
              <Printer size={28} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-slate-800">
                {printMode === 'thermal' ? 'Imprimer التيكيت الحراري' : 'Confirmer l\'impression'}
              </h3>
              <p className="text-sm text-slate-500">
                Lancer l'impression de la facture N° {invoiceNum} ({printMode === 'thermal' ? 'Format Thermal 80mm' : 'Format A4'}) ?
              </p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowPrintConfirm(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all text-sm cursor-pointer">Annuler</button>
              <button type="button" onClick={executePrint} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-md text-sm cursor-pointer">Imprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
