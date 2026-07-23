import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Order, UserProfile, ShopInfo } from '../types';
import { Language } from '../translations';
import { Printer, X, Download } from 'lucide-react';
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

const PRINT_FONTS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
`;

const PRINT_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 portrait;margin:0}
@media print{body{margin:0}}
`;

export default function InvoicePrintView({ order, doctor, shopInfo, onClose }: InvoicePrintViewProps) {
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    const payload = JSON.stringify({
      invoice: order.id ? order.id.slice(-8).toUpperCase() : 'UNKNOWN',
      total: order.totalAfterDiscount,
      date: order.createdAt,
      shop: shopInfo.companyName
    });
    QRCode.toDataURL(payload, { width: 120, margin: 1 }).then(setQrDataUrl).catch(console.error);
  }, [order, shopInfo.companyName]);

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
  const executePrint = () => { setShowPrintConfirm(false); window.print(); };

  const openThermalPrint = () => {
    const el = document.getElementById('invoice-thermal');
    if (!el) return;
    const w = window.open('', '_blank', 'width=320,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Thermal ${invoiceNum}</title><style>@page{size:80mm auto;margin:2mm}body{font-family:monospace;font-size:10px;width:72mm;margin:0 auto;padding:4mm}table{width:100%}td{padding:2px 0}.center{text-align:center}.bold{font-weight:bold;border-top:1px dashed #000;margin-top:4px;padding-top:4px}</style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const openPdfPrint = () => {
    const el = document.getElementById('invoice-a4');
    if (!el) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Facture ${invoiceNum}</title>${PRINT_FONTS}<style>${PRINT_CSS}</style></head><body>${el.outerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 600);
  };

  const serif = "'Cormorant Garamond', Georgia, serif";
  const sans = "'DM Sans', 'Segoe UI', sans-serif";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-2 overflow-y-auto no-print">
      <div className="fixed top-4 right-4 z-[60] flex items-center gap-2 no-print">
        <button onClick={handlePrint} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm px-4 py-2 rounded-xl shadow-lg hover:bg-slate-50 transition-all">
          <Printer size={16} /><span>Imprimer</span>
        </button>
        <button onClick={openThermalPrint} className="flex items-center gap-2 bg-slate-800 text-white font-bold text-sm px-4 py-2 rounded-xl shadow-lg hover:bg-slate-900 transition-all">
          <Printer size={16} /><span>Thermal 80mm</span>
        </button>
        <button onClick={openPdfPrint} className="flex items-center gap-2 bg-blue-600 text-white font-bold text-sm px-4 py-2 rounded-xl shadow-lg hover:bg-blue-700 transition-all">
          <Download size={16} /><span>Imprimer PDF</span>
        </button>
        <button onClick={onClose} className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-slate-800 rounded-xl shadow-lg"><X size={20} /></button>
      </div>

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
                <img src={qrDataUrl} alt="QR Facture" style={{ width: '72px', height: '72px' }} />
                <div style={{ fontSize: '6pt', color: C.gray, marginTop: '2px' }}>Scan QR</div>
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
                { label: 'Mode de paiement', value: isCash ? 'Comptant / Livraison' : 'Crédit 20 jours', accent: true },
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
                {doctor?.location && (
                  <>
                    <span style={{ margin: '0 8px', color: C.border }}>|</span>
                    <span style={{ fontWeight: 700, color: '#94A3B8' }}>Adr. </span>{doctor.location}
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
                  {isCash ? 'Paiement à la livraison' : 'Paiement à crédit – Échéance: 20 jours'}
                </div>
                <div style={{ fontSize: '7pt', fontWeight: 500, color: isCash ? '#15803D' : '#C2410C', marginTop: '3px' }}>
                  {isCash ? 'Payé à la réception' : `Crédit client: paiement sous 20 jours — ${deadlineDate}`}
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
                    { h: 'N°', align: 'center' as const, w: '5%' },
                    { h: 'Code', align: 'left' as const, w: '9%' },
                    { h: 'Désignation', align: 'left' as const, w: '28%' },
                    { h: 'Quantité', align: 'center' as const, w: '8%' },
                    { h: 'Prix Unitaire TTC', align: 'right' as const, w: '12%' },
                    { h: 'Remise %', align: 'center' as const, w: '8%' },
                    { h: 'Prix Vente TTC', align: 'right' as const, w: '12%' },
                    { h: 'Montant TTC', align: 'right' as const, w: '12%' },
                  ].map((col, i) => (
                    <th key={i} style={{
                      padding: '6px 7px', fontWeight: 600, fontSize: '6.5pt',
                      letterSpacing: '0.3px', textAlign: col.align, whiteSpace: 'nowrap',
                      borderRight: i < 7 ? '1px solid rgba(255,255,255,0.12)' : 'none',
                      width: col.w,
                    }}>{col.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, idx) => {
                  const disc = item.discountPercent ?? 0;
                  const pu = Math.round(item.price / (1 - disc / 100)) || item.price;
                  const pv = item.price;
                  const montant = pv * item.quantity;
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
                      <td style={{ padding: '5px 7px', textAlign: 'right', color: C.gray, borderRight: `1px solid ${C.border}` }}>{fmt(pv)}</td>
                      <td style={{ padding: '5px 7px', textAlign: 'right', fontWeight: 700, color: C.navy }}>{fmt(montant)}</td>
                    </tr>
                  );
                })}
                {order.items.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '12px', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' }}>Aucun article</td>
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

      <div id="invoice-thermal" style={{ display: 'none' }} aria-hidden="true">
        <div className="center bold">{shopInfo.companyName}</div>
        <div className="center">FACTURE N° {invoiceNum}</div>
        <div className="center">{invoiceDate}</div>
        <div>Client: {order.doctorName}</div>
        <div>Clinique: {order.doctorClinic}</div>
        <table>
          {order.items.map((item, i) => (
            <tr key={i}>
              <td>{item.name ? item.name.slice(0, 20) : 'Unknown'}</td>
              <td>x{item.quantity}</td>
              <td>{fmt(item.price * item.quantity)}</td>
            </tr>
          ))}
        </table>
        <div className="bold">TOTAL: {fmt(order.totalAfterDiscount)} DA</div>
        {qrDataUrl && <div className="center"><img src={qrDataUrl} width="80" alt="QR" /></div>}
      </div>

      {showPrintConfirm && (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full border border-slate-100 shadow-2xl text-center space-y-6">
            <div className="mx-auto w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
              <Printer size={28} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-slate-800">Confirmer l'impression</h3>
              <p className="text-sm text-slate-500">Lancer l'impression de la facture N° {invoiceNum} ?</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPrintConfirm(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all text-sm">Annuler</button>
              <button onClick={executePrint} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-md text-sm">Imprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
