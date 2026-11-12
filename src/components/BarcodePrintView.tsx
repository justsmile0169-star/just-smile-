import React, { useMemo, useRef, useState } from 'react';
import { Product } from '../types';
import { Language } from '../translations';
import { Printer, X, Tag, Sparkles, Copy, Check, Layers, Eye } from 'lucide-react';
import { buildBarcodeRenderData } from '../utils/barcodeGenerator';

interface BarcodePrintViewProps {
  product: Product;
  lang?: Language;
  onClose: () => void;
}

export const LinearBarcodeSvg: React.FC<{
  code: string;
  height?: number;
  showText?: boolean;
  quietZoneModules?: number;
  className?: string;
}> = ({ code, height = 38, showText = true, quietZoneModules = 2, className = '' }) => {
  const data = useMemo(
    () => buildBarcodeRenderData(code, { quietZoneModules }),
    [code, quietZoneModules]
  );
  const textHeight = showText ? 12 : 0;
  const totalHeight = height + textHeight;

  return (
    <svg
      viewBox={`0 0 ${data.totalModules} ${totalHeight}`}
      preserveAspectRatio="none"
      className={`w-full h-full select-none block ${className}`}
      style={{ shapeRendering: 'crispEdges', width: '100%', height: '100%' }}
    >
      <rect x={0} y={0} width={data.totalModules} height={totalHeight} fill="#ffffff" />
      {data.rects.map((bar, idx) => (
        <rect
          key={idx}
          x={bar.x}
          y={0}
          width={bar.width}
          height={bar.isGuard ? height + 3 : height}
          fill="#000000"
        />
      ))}
      {showText && (
        <text
          x={data.totalModules / 2}
          y={totalHeight - 1.5}
          textAnchor="middle"
          fill="#000000"
          style={{
            fontSize: '10px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontWeight: 900,
            letterSpacing: '0.8px',
          }}
        >
          {data.formattedText}
        </text>
      )}
    </svg>
  );
};

type LabelTheme = 'medical_pro' | 'luxury_frame' | 'bold_price';

export const BarcodePrintView: React.FC<BarcodePrintViewProps> = ({
  product,
  lang = 'fr',
  onClose,
}) => {
  const isFr = lang === 'fr';
  const [copies, setCopies] = useState<number>(1);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showBrand, setShowBrand] = useState<boolean>(true);
  const [showMeta, setShowMeta] = useState<boolean>(false);
  const [theme, setTheme] = useState<LabelTheme>('medical_pro');
  const [copiedCode, setCopiedCode] = useState(false);
  const stickerPreviewRef = useRef<HTMLDivElement>(null);

  const codeValue = (product.barcode || product.id || '0000000000000').trim();
  const renderInfo = useMemo(
    () => buildBarcodeRenderData(codeValue, { quietZoneModules: 2 }),
    [codeValue]
  );

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeValue);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const formattedPrice = isFr
    ? `${new Intl.NumberFormat('fr-FR').format(Number(product.price || 0))} DA`
    : `${new Intl.NumberFormat('ar-DZ').format(Number(product.price || 0))} د.ج`;

  const metaBadge = product.expiryDate
    ? `EXP: ${product.expiryDate}`
    : product.category
    ? product.category.slice(0, 16)
    : 'DENTAL';

  /**
   * Opens a dedicated zero-margin 40mm x 20mm print iframe so Chrome/Edge print preview
   * renders the barcode sticker filling 100% of the 40x20mm thermal label from edge to edge.
   */
  const handlePrint = () => {
    const svgMarkup = stickerPreviewRef.current?.querySelector('svg')?.outerHTML || '';

    const headerBg = theme === 'medical_pro' ? '#000000' : 'transparent';
    const headerColor = theme === 'medical_pro' ? '#ffffff' : '#000000';
    const headerBorder = theme !== 'medical_pro' ? 'border-bottom: 0.3mm solid #000000;' : '';
    const headerRadius = theme === 'medical_pro' ? '1mm' : '0';
    const headerPadding = theme === 'medical_pro' ? '0.45mm 1.2mm' : '0 0 0.35mm 0';

    const priceBg =
      theme === 'medical_pro'
        ? '#ffffff'
        : theme === 'bold_price'
        ? '#000000'
        : 'transparent';
    const priceColor =
      theme === 'medical_pro'
        ? '#000000'
        : theme === 'bold_price'
        ? '#ffffff'
        : '#000000';
    const pricePad =
      theme === 'medical_pro' || theme === 'bold_price' ? '0.25mm 1mm' : '0';

    const singleLabelHtml = `
      <div class="label-sheet">
        ${
          showBrand || showPrice || showMeta
            ? `<div class="label-header">
                <span class="brand-text">${showBrand ? '✦ JUST SMILE' : metaBadge}</span>
                ${
                  showPrice
                    ? `<span class="price-badge">${formattedPrice}</span>`
                    : showMeta
                    ? `<span class="meta-text">${metaBadge}</span>`
                    : ''
                }
              </div>`
            : ''
        }
        <div class="product-title" dir="auto">${product.name}</div>
        <div class="barcode-box">${svgMarkup}</div>
        ${
          showMeta && showBrand && showPrice
            ? `<div class="label-footer">
                <span>${product.expiryDate ? `EXP: ${product.expiryDate}` : ''}</span>
                <span>${product.category ? product.category.slice(0, 16) : ''}</span>
              </div>`
            : ''
        }
      </div>
    `;

    const allLabelsHtml = Array.from({ length: copies })
      .map(() => singleLabelHtml)
      .join('');

    const printHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Barcode 40x20mm - ${product.name}</title>
  <style>
    @page {
      size: 40mm 20mm;
      margin: 0mm !important;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 40mm;
      height: 20mm;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff;
      font-family: 'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif;
    }
    .label-sheet {
      width: 100vw;
      height: 100vh;
      padding: ${theme === 'luxury_frame' ? '0.9mm 1.2mm' : '0.8mm 1.1mm'};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: stretch;
      background: #ffffff;
      color: #000000;
      border: ${theme === 'luxury_frame' ? '0.4mm solid #000000' : 'none'};
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .label-sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .label-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1mm;
      background: ${headerBg};
      color: ${headerColor};
      ${headerBorder}
      border-radius: ${headerRadius};
      padding: ${headerPadding};
      flex-shrink: 0;
    }
    .brand-text {
      font-size: 6.2pt;
      font-weight: 900;
      letter-spacing: 0.3px;
      line-height: 1;
      white-space: nowrap;
    }
    .price-badge {
      font-size: ${theme === 'bold_price' ? '7pt' : '6.4pt'};
      font-weight: 900;
      line-height: 1;
      background: ${priceBg};
      color: ${priceColor};
      padding: ${pricePad};
      border-radius: 0.7mm;
      white-space: nowrap;
      direction: ltr;
    }
    .meta-text {
      font-size: 5.5pt;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
    }
    .product-title {
      width: 100%;
      text-align: center;
      font-size: ${product.name.length > 26 ? '6pt' : '6.8pt'};
      font-weight: 900;
      line-height: 1.1;
      color: #000000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0.25mm 0.2mm;
      flex-shrink: 0;
    }
    .barcode-box {
      width: 100%;
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: stretch;
      justify-content: center;
      padding-top: 0.1mm;
    }
    .barcode-box svg {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }
    .label-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 4.5pt;
      font-weight: 800;
      line-height: 1;
      border-top: 0.2mm dashed #000000;
      padding-top: 0.25mm;
      margin-top: 0.15mm;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  ${allLabelsHtml}
</body>
</html>`;

    // Print via hidden iframe for clean 40x20mm page sizing without main-page CSS interference
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '40mm';
    iframe.style.height = '20mm';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(printHtml);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1500);
      }, 180);
    }
  };

  // Renders the 2:1 aspect-ratio (40mm x 20mm) sticker inside the live preview
  const renderStickerPreview = () => {
    return (
      <div
        ref={stickerPreviewRef}
        dir="ltr"
        className="w-full max-w-[300px] aspect-[2/1] bg-white text-black shadow-2xl rounded-lg ring-1 ring-slate-300 overflow-hidden flex flex-col justify-between select-none"
        style={{
          padding: theme === 'luxury_frame' ? '6px 9px' : '5px 8px',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          color: '#000000',
          fontFamily: "'Cairo', 'Tajawal', system-ui, -apple-system, sans-serif",
          border: theme === 'luxury_frame' ? '2.5px solid #000000' : 'none',
        }}
      >
        {/* TOP HEADER ROW: Brand + Price/Meta */}
        {(showBrand || showPrice || showMeta) && (
          <div
            className="flex items-center justify-between gap-2 shrink-0"
            style={{
              backgroundColor: theme === 'medical_pro' ? '#000000' : 'transparent',
              color: theme === 'medical_pro' ? '#ffffff' : '#000000',
              borderBottom: theme !== 'medical_pro' ? '1.5px solid #000000' : 'none',
              borderRadius: theme === 'medical_pro' ? '5px' : '0',
              padding: theme === 'medical_pro' ? '3px 8px' : '0 0 2px 0',
            }}
          >
            {showBrand ? (
              <span className="text-[11px] font-black tracking-wide leading-none whitespace-nowrap">
                ✦ JUST SMILE
              </span>
            ) : (
              <span className="text-[10px] font-extrabold leading-none">{metaBadge}</span>
            )}

            {showPrice ? (
              <span
                dir="ltr"
                className="leading-none whitespace-nowrap font-black"
                style={{
                  fontSize: theme === 'bold_price' ? '12.5px' : '11.5px',
                  backgroundColor:
                    theme === 'medical_pro'
                      ? '#ffffff'
                      : theme === 'bold_price'
                      ? '#000000'
                      : 'transparent',
                  color:
                    theme === 'medical_pro'
                      ? '#000000'
                      : theme === 'bold_price'
                      ? '#ffffff'
                      : '#000000',
                  padding:
                    theme === 'medical_pro' || theme === 'bold_price' ? '2px 6px' : '0',
                  borderRadius: '4px',
                }}
              >
                {formattedPrice}
              </span>
            ) : showMeta ? (
              <span className="text-[10px] font-extrabold leading-none whitespace-nowrap">
                {metaBadge}
              </span>
            ) : null}
          </div>
        )}

        {/* PRODUCT NAME ROW (dir="auto" so French/Latin truncates at the right end, Arabic at the left) */}
        <div className="w-full text-center shrink-0 py-0.5 overflow-hidden">
          <p
            dir="auto"
            className="font-black text-black truncate w-full leading-tight"
            style={{
              fontSize: product.name.length > 26 ? '11.5px' : '13px',
            }}
          >
            {product.name}
          </p>
        </div>

        {/* 1D LINEAR BARCODE SVG (Fills remaining height & full width of the 40x20mm sticker) */}
        <div
          dir="ltr"
          className="w-full flex-1 min-h-0 flex flex-col justify-end pt-0.5"
        >
          <LinearBarcodeSvg
            code={codeValue}
            height={38}
            showText={true}
            quietZoneModules={2}
            className="w-full h-full"
          />
        </div>

        {/* OPTIONAL TINY FOOTER FOR EXPIRY/CATEGORY */}
        {showMeta && showBrand && showPrice && (
          <div
            dir="ltr"
            className="flex items-center justify-between shrink-0 text-[9px] font-extrabold leading-none border-t border-dashed border-black pt-0.5 mt-0.5"
          >
            <span>{product.expiryDate ? `EXP: ${product.expiryDate}` : ''}</span>
            <span>{product.category?.slice(0, 16)}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
      dir={isFr ? 'ltr' : 'rtl'}
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 flex flex-wrap items-center gap-2">
                <span>
                  {isFr
                    ? "Impression d'Étiquette Code-Barres Thermique"
                    : 'طباعة ملصق الباركود الحراري'}
                </span>
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                  {isFr ? '40 × 20 mm' : '40 × 20 ملم'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isFr
                  ? 'Code-barres linéaire (1D) 100% compatible lecteur laser USB et caméra'
                  : 'باركود خطي (1D Linear Barcode) متوافق 100% مع القارئ الليزري وكاميرا الهاتف'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
          {/* Preview Column */}
          <div className="md:col-span-6 flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-700/70">
            <div className="flex items-center justify-between w-full text-xs text-slate-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>
                  {isFr ? "Aperçu en direct de l'étiquette" : 'معاينة حية للملصق (40×20)'}
                </span>
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-700/80 text-amber-300 font-mono text-[10px] shrink-0">
                {renderInfo.format} • 40×20mm
              </span>
            </div>

            {/* Crisp Full-Width 2:1 Aspect Ratio Sticker Preview (Never Overlaps!) */}
            <div className="my-5 flex items-center justify-center w-full">
              {renderStickerPreview()}
            </div>

            {/* Barcode number + copy button */}
            <div className="w-full flex items-center justify-between bg-slate-950/60 border border-slate-700/70 rounded-xl px-3.5 py-2.5 gap-2">
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] text-slate-400 font-bold">
                  {isFr ? 'Code-barres enregistré :' : 'كود الباركود المسجل:'}
                </span>
                <span
                  className="font-mono text-xs font-black text-white tracking-wider truncate"
                  dir="ltr"
                >
                  {codeValue}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 transition-colors shrink-0"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">
                      {isFr ? 'Copié' : 'تم النسخ'}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Copier' : 'نسخ الكود'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Controls Column */}
          <div className="md:col-span-6 flex flex-col justify-between space-y-4">
            {/* Theme Selector */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                <span>
                  {isFr
                    ? "Style de l'étiquette (40 × 20 mm)"
                    : 'نمط تصميم الملصق (40×20 ملم)'}
                </span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: 'medical_pro',
                    label: isFr ? 'Pro Médical' : 'احترافي فخم',
                  },
                  {
                    id: 'luxury_frame',
                    label: isFr ? 'Cadre Classique' : 'إطار كلاسيكي',
                  },
                  {
                    id: 'bold_price',
                    label: isFr ? 'Prix Mis en Avant' : 'سعر بارز',
                  },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id as LabelTheme)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                      theme === t.id
                        ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Toggles */}
            <div>
              <label className="block text-xs font-black text-slate-700 mb-2">
                {isFr
                  ? "Informations affichées sur l'étiquette"
                  : 'المعلومات المعروضة على الملصق'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrice((v) => !v)}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all ${
                    showPrice
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  {showPrice
                    ? isFr
                      ? '✓ Prix affiché'
                      : '✓ السعر ظاهر'
                    : isFr
                    ? '✕ Sans prix'
                    : '✕ بدون سعر'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBrand((v) => !v)}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all ${
                    showBrand
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  {showBrand
                    ? isFr
                      ? '✓ Nom boutique'
                      : '✓ اسم المتجر'
                    : isFr
                    ? '✕ Sans boutique'
                    : '✕ بدون المتجر'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMeta((v) => !v)}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all ${
                    showMeta
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  {showMeta
                    ? isFr
                      ? '✓ Exp / Catégorie'
                      : '✓ الصلاحية/الفئة'
                    : isFr
                    ? '✕ Sans infos'
                    : '✕ بدون إضافات'}
                </button>
              </div>
            </div>

            {/* Copies Selector for Thermal Roll Printing */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between mb-2 gap-2">
                <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>
                    {isFr
                      ? "Nombre d'étiquettes (Rouleau thermique) :"
                      : 'عدد الملصقات للطباعة (رول حراري):'}
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={copies}
                  onChange={(e) =>
                    setCopies(Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 1)))
                  }
                  className="w-20 text-center font-black text-sm bg-white border border-slate-300 rounded-lg py-1 focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>
              <div className="flex gap-1.5">
                {[1, 5, 10, 20, 50].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setCopies(num)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                      copies === num
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Print Action Buttons */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-black py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/25"
              >
                <Printer className="w-5 h-5" />
                <span>
                  {isFr
                    ? copies > 1
                      ? `Imprimer (${copies} étiquettes)`
                      : "Imprimer l'étiquette"
                    : copies > 1
                    ? `طباعة (${copies} ملصقات)`
                    : 'طباعة الملصق الآن'}
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-5 rounded-xl transition-colors"
              >
                {isFr ? 'Fermer' : 'إغلاق'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodePrintView;
