import { useCallback, useEffect, useRef, useState } from 'react';
import { Product, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';
import { findProductByCode, findProductByCodeFirestore } from '../utils/productFirestore';
import { hasPermission } from '../utils/permissions';
import { playScanBeep } from '../utils/barcodeGenerator';
import {
  ScanBarcode,
  X,
  Keyboard,
  Printer,
  Plus,
  ShoppingCart,
  PackagePlus,
  CheckCircle2,
  Zap,
  Camera,
  RefreshCw
} from 'lucide-react';

type ScanPhase = 'scan' | 'found' | 'not_found';

export interface BarcodeScannerProps {
  lang: Language;
  products: Product[];
  user: UserProfile | null;
  onAddToCart: (product: Product, quantity: number) => void;
  onPrintBarcode: (product: Product) => void;
  onCreateProduct: (barcode: string) => void;
  onClose: () => void;
  /** Special modes for Create New Invoice or Product Form Factory Barcode Capture */
  mode?: 'default' | 'invoice_pos' | 'pick_raw_code';
  onPickRawCode?: (code: string) => void;
  onInvoiceScanProduct?: (product: Product, quantity: number) => void;
}

export default function BarcodeScanner({
  lang,
  products,
  user,
  onAddToCart,
  onPrintBarcode,
  onCreateProduct,
  onClose,
  mode = 'default',
  onPickRawCode,
  onInvoiceScanProduct
}: BarcodeScannerProps) {
  const isFr = lang === 'fr';
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraRequested, setCameraRequested] = useState(true);
  const [phase, setPhase] = useState<ScanPhase>('scan');
  const [scannedCode, setScannedCode] = useState('');
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  // In invoice_pos mode, allow continuous rapid scanning without closing the camera
  const [continuousMode, setContinuousMode] = useState<boolean>(mode === 'invoice_pos');
  const [recentScannedItems, setRecentScannedItems] = useState<
    Array<{ product: Product; count: number; timestamp: number }>
  >([]);
  const lastDetectedRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const canManageInventory = hasPermission(user, 'manage_inventory');
  const canSell = !user || hasPermission(user, 'sell');
  const canUseScanner = !user || hasPermission(user, 'use_scanner');

  const formatPrice = (n: number) =>
    new Intl.NumberFormat(isFr ? 'fr-FR' : 'ar-DZ').format(n) +
    ' ' +
    getTranslation(lang, 'currency');

  const stopCameraStream = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const handleProductFound = useCallback(
    (product: Product) => {
      playScanBeep('success');

      // If in Invoice POS mode AND continuous scanning is enabled, add immediately and keep camera running!
      if (mode === 'invoice_pos' && onInvoiceScanProduct && continuousMode) {
        onInvoiceScanProduct(product, 1);
        setRecentScannedItems((prev) => {
          const existingIdx = prev.findIndex((i) => i.product.id === product.id);
          if (existingIdx >= 0) {
            const copy = [...prev];
            copy[existingIdx] = {
              ...copy[existingIdx],
              count: copy[existingIdx].count + 1,
              timestamp: Date.now()
            };
            return copy;
          }
          return [{ product, count: 1, timestamp: Date.now() }, ...prev.slice(0, 5)];
        });
        return;
      }

      setFoundProduct(product);
      setQuantity(1);
      setPhase('found');
      stopCameraStream();
    },
    [mode, onInvoiceScanProduct, continuousMode, stopCameraStream]
  );

  // Store products & callbacks in ref to avoid restarting camera stream
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const handleProductFoundRef = useRef(handleProductFound);
  useEffect(() => {
    handleProductFoundRef.current = handleProductFound;
  }, [handleProductFound]);

  const processCode = useCallback(
    async (code: string) => {
      const normalized = code.trim();
      if (!normalized) return;

      // Debounce identical scan within 1.4 seconds in continuous camera mode
      const now = Date.now();
      if (
        lastDetectedRef.current.code === normalized &&
        now - lastDetectedRef.current.time < 1400
      ) {
        return;
      }
      lastDetectedRef.current = { code: normalized, time: now };

      setScannedCode(normalized);
      setError('');

      // Mode 1: Pick Raw Factory Barcode for Product Add/Edit Form
      if (mode === 'pick_raw_code' && onPickRawCode) {
        playScanBeep('success');
        stopCameraStream();
        onPickRawCode(normalized);
        onClose();
        return;
      }

      // Mode 2 & 3: Find product in local list or Firestore
      let product = findProductByCode(productsRef.current, normalized);
      if (product) {
        handleProductFoundRef.current(product);
        return;
      }

      product = await findProductByCodeFirestore(normalized);
      if (product) {
        handleProductFoundRef.current(product);
      } else {
        playScanBeep('error');
        if (mode === 'invoice_pos' && continuousMode) {
          setError(
            isFr
              ? `Le code-barres (${normalized}) n'est associé à aucun produit en stock`
              : `الباركود (${normalized}) غير مسجل لأي منتج في المخزون`
          );
        } else {
          stopCameraStream();
          setFoundProduct(null);
          setPhase('not_found');
        }
      }
    },
    [mode, onPickRawCode, onClose, stopCameraStream, continuousMode, isFr]
  );

  const processCodeRef = useRef(processCode);
  useEffect(() => {
    processCodeRef.current = processCode;
  }, [processCode]);

  // Hardware USB Laser Scanner listener inside the modal (detects rapid keystrokes + Enter)
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return; // Let form input handle it normally
      }

      const now = Date.now();
      if (now - lastKeyTime > 80) {
        buffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.trim().length >= 3) {
          e.preventDefault();
          const scanned = buffer.trim();
          buffer = '';
          processCodeRef.current(scanned);
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (phase !== 'scan' || !cameraRequested) {
      stopCameraStream();
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      if (!canUseScanner) {
        setError(
          isFr
            ? 'Permission refusée pour le scanner.'
            : 'تم رفض صلاحية استخدام الماسح.'
        );
        setScanning(false);
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setScanning(false);
        setCameraRequested(false);
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        setScanning(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            // Ignore play interruption
          }
        }

        if ('BarcodeDetector' in window) {
          try {
            const supportedFormats = [
              'ean_13',
              'ean_8',
              'code_128',
              'code_39',
              'code_93',
              'upc_a',
              'upc_e',
              'itf',
              'codabar',
              'qr_code'
            ];
            let detector: any;
            try {
              detector = new (window as any).BarcodeDetector({
                formats: supportedFormats
              });
            } catch {
              detector = new (window as any).BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code']
              });
            }

            intervalRef.current = window.setInterval(async () => {
              if (!videoRef.current || videoRef.current.readyState < 2) return;
              try {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  processCodeRef.current(barcodes[0].rawValue);
                }
              } catch {
                /* frame skip */
              }
            }, 320);
          } catch {
            setError(
              isFr
                ? 'Le navigateur ne prend pas en charge la détection caméra automatique. Utilisez le lecteur USB ou saisissez le code.'
                : 'المتصفح لا يدعم القراءة التلقائية للكاميرا، يمكنك استخدام الماسح الضوئي USB أو إدخال الكود.'
            );
          }
        }
      } catch {
        if (!cancelled) {
          setScanning(false);
          setCameraRequested(false);
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [phase, cameraRequested, canUseScanner, isFr, stopCameraStream]);

  const resetScan = () => {
    lastDetectedRef.current = { code: '', time: 0 };
    setPhase('scan');
    setFoundProduct(null);
    setScannedCode('');
    setManualCode('');
    setError('');
    setQuantity(1);
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      dir={isFr ? 'ltr' : 'rtl'}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl max-h-[95vh] flex flex-col border border-slate-100">
        {/* Header */}
        <div className="flex justify-between items-center px-4 sm:px-5 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5 font-extrabold text-slate-900 text-sm sm:text-base">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center">
              <ScanBarcode size={20} className="shrink-0" />
            </div>
            <div>
              <p className="leading-tight">
                {mode === 'pick_raw_code'
                  ? isFr
                    ? 'Scanner le Code-Barres Original'
                    : 'مسح الباركود الأصلي للمنتج'
                  : mode === 'invoice_pos'
                  ? isFr
                    ? 'Scanner Produits pour la Facture'
                    : 'مسح باركود المنتجات للفاتورة'
                  : isFr
                  ? 'Scanner Code-Barres'
                  : 'الماسح الضوئي للباركود'}
              </p>
              <p className="text-[11px] font-medium text-slate-500">
                {mode === 'pick_raw_code'
                  ? isFr
                    ? "Scannez à la caméra ou au lecteur USB pour enregistrer le code d'origine"
                    : 'وجّه الكاميرا أو امسح بالـ USB لحفظ باركود العلبة مباشرة'
                  : isFr
                  ? 'Compatible caméra téléphone & lecteur laser USB'
                  : 'يدعم كاميرا الهاتف والماسح الضوئي الليزري (USB)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Switch between Camera and USB Laser Scanner */}
          {phase === 'scan' && (
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setCameraRequested(true);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black transition-all ${
                  cameraRequested
                    ? 'bg-white text-sky-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isFr ? 'Caméra' : 'مسح بالكاميرا'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setCameraRequested(false);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black transition-all ${
                  !cameraRequested
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>{isFr ? 'Lecteur USB' : 'قارئ الباركود (USB)'}</span>
              </button>
            </div>
          )}

          {/* Continuous Mode Toggle for Invoice POS */}
          {mode === 'invoice_pos' && phase === 'scan' && (
            <div className="flex items-center justify-between bg-sky-50/90 border border-sky-200/80 rounded-2xl px-3.5 py-2.5 gap-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-sky-600 shrink-0" />
                <div>
                  <p className="text-xs font-black text-sky-950">
                    {isFr ? 'Scan Continu Rapide (POS)' : 'وضع المسح المتتالي السريع (POS)'}
                  </p>
                  <p className="text-[10px] text-sky-700">
                    {isFr
                      ? 'Ajoute les produits directement à la facture sans fermer le scanner'
                      : 'إضافة المنتجات للفاتورة فوراً بمجرد مرورها أمام الكاميرا أو الليزر'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContinuousMode((v) => !v)}
                className={`px-3 py-1 rounded-xl text-xs font-black transition-all shrink-0 ${
                  continuousMode
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {continuousMode
                  ? isFr
                    ? 'Activé ✓'
                    : 'مفعّل ✓'
                  : isFr
                  ? 'Désactivé'
                  : 'متوقف'}
              </button>
            </div>
          )}

          {phase === 'scan' && (
            <>
              {cameraRequested ? (
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3] sm:aspect-video shadow-inner">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                    autoPlay
                  />
                  {/* Modern 1D Barcode Laser Target Guide */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6">
                    <div className="w-full max-w-[270px] h-28 border-2 border-sky-400/90 rounded-2xl relative shadow-[0_0_0_9999px_rgba(2,6,23,0.42)] flex items-center justify-center">
                      <div className="w-[92%] h-[2px] bg-rose-500 shadow-[0_0_10px_#f43f5e,0_0_20px_#f43f5e] animate-pulse" />
                    </div>
                    <span className="mt-3 px-3 py-1 rounded-full bg-slate-950/80 text-white text-[11px] font-bold flex items-center gap-1.5 backdrop-blur-sm">
                      <Camera className="w-3.5 h-3.5 text-sky-400" />
                      {scanning
                        ? isFr
                          ? 'Alignez les barres dans le cadre'
                          : 'وجّه خطوط الباركود داخل الإطار'
                        : isFr
                        ? 'Démarrage de la caméra...'
                        : 'جاري تشغيل الكاميرا...'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center text-sm text-slate-600">
                  <Keyboard className="mx-auto mb-2 text-indigo-500" size={34} />
                  <p className="font-black text-slate-800">
                    {isFr
                      ? 'Prêt pour le scan direct via lecteur USB'
                      : 'جاهز للمسح المباشر عبر قارئ الباركود (USB)'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {isFr
                      ? 'Scannez maintenant avec la douchette laser ou saisissez le code ci-dessous'
                      : 'اضغط بزر الماسح الضوئي الليزري الآن أو اكتب رقم الباركود بالأسفل'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCameraRequested(true)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-700 bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-200"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {isFr ? 'Activer la caméra à la place' : 'تشغيل الكاميرا بدلاً من ذلك'}
                  </button>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  processCode(manualCode);
                  if (mode === 'invoice_pos' && continuousMode) {
                    setManualCode('');
                  }
                }}
                className="flex gap-2"
              >
                <input
                  id="barcode-manual-code-input"
                  name="manualCode"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder={
                    mode === 'pick_raw_code'
                      ? isFr
                        ? 'Scannez au lecteur USB ou saisissez le code produit...'
                        : 'امسح بالـ USB أو أدخل باركود المنتج هنا...'
                      : isFr
                      ? 'Scannez au lecteur USB ou saisissez le code-barres...'
                      : 'امسح بالماسح الضوئي (USB) أو اكتب الباركود...'
                  }
                  className="flex-1 border border-slate-200 rounded-xl py-3 px-3.5 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[44px]"
                  dir="ltr"
                  autoFocus
                />
                <button
                  type="submit"
                  className="bg-sky-600 hover:bg-sky-700 text-white font-black px-5 py-3 rounded-xl text-sm transition-colors shrink-0"
                >
                  {mode === 'pick_raw_code'
                    ? isFr
                      ? 'Valider'
                      : 'اعتماد الكود'
                    : isFr
                    ? 'Valider'
                    : 'إدخال'}
                </button>
              </form>

              {/* Live Scanned Feed in Continuous Invoice Mode */}
              {mode === 'invoice_pos' && recentScannedItems.length > 0 && (
                <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {isFr ? 'Ajoutés à la facture :' : 'تمت إضافتها للفاتورة الآن:'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={onClose}
                      className="text-xs font-black bg-emerald-600 text-white px-3 py-1 rounded-lg hover:bg-emerald-700 shrink-0"
                    >
                      {isFr ? 'Terminer ✓' : 'إنهاء والعودة للفاتورة ✓'}
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {recentScannedItems.map((item) => (
                      <div
                        key={item.product.id}
                        className="flex items-center justify-between bg-white rounded-xl px-2.5 py-1.5 text-xs border border-emerald-100"
                      >
                        <span className="font-bold text-slate-800 truncate">
                          {item.product.name}
                        </span>
                        <span className="font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                          +{item.count} {isFr ? 'unité(s)' : 'قطعة'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {phase === 'found' && foundProduct && (
            <div className="space-y-4">
              <div className="flex gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                {foundProduct.image && String(foundProduct.image) !== '0' && (
                  <img
                    src={foundProduct.image}
                    alt=""
                    width={80}
                    height={80}
                    loading="lazy"
                    decoding="async"
                    style={{ aspectRatio: '1 / 1' }}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover shrink-0 bg-white border border-emerald-100"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-slate-900 text-sm leading-snug">
                    {foundProduct.name}
                  </p>
                  <p className="text-sky-600 font-black text-base mt-1">
                    {formatPrice(foundProduct.price)}
                  </p>
                  <p className="text-xs text-slate-600 font-bold mt-0.5">
                    {isFr ? 'Stock disponible' : 'المخزون المتاح'}: {foundProduct.stock} •{' '}
                    {foundProduct.category}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 mt-1 truncate" dir="ltr">
                    {foundProduct.barcode || scannedCode}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="barcode-scanner-quantity"
                  className="text-xs font-bold text-slate-600"
                >
                  {isFr ? 'Quantité à ajouter' : 'الكمية المطلوبة'}
                </label>
                <input
                  id="barcode-scanner-quantity"
                  name="quantity"
                  type="number"
                  min={1}
                  max={Math.max(1, foundProduct.stock)}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-full border border-slate-200 rounded-xl py-3 px-4 text-base font-bold min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {mode === 'invoice_pos' && onInvoiceScanProduct ? (
                  <button
                    type="button"
                    onClick={() => {
                      onInvoiceScanProduct(foundProduct, quantity);
                      onClose();
                    }}
                    className="sm:col-span-2 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl min-h-[44px] text-sm shadow-lg shadow-emerald-600/20"
                  >
                    <ShoppingCart size={18} />
                    {isFr
                      ? `Ajouter à la facture (${quantity})`
                      : `إضافة إلى الفاتورة (${quantity})`}
                  </button>
                ) : (
                  <>
                    {canSell && foundProduct.stock > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          for (let i = 0; i < quantity; i++) {
                            onAddToCart(foundProduct, 1);
                          }
                          onClose();
                        }}
                        className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl min-h-[44px] text-sm"
                      >
                        <ShoppingCart size={16} />
                        {getTranslation(lang, 'addToCart')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onPrintBarcode(foundProduct)}
                      className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl min-h-[44px] text-sm"
                    >
                      <Printer size={16} />
                      {isFr ? 'Étiquette 40×20' : 'طباعة ملصق 40×20'}
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={resetScan}
                className="w-full text-sm text-sky-600 hover:text-sky-700 font-bold py-2"
              >
                {isFr ? '← Scanner un autre code' : '← مسح باركود منتج آخر'}
              </button>
            </div>
          )}

          {phase === 'not_found' && (
            <div className="space-y-4 text-center py-4">
              <PackagePlus className="mx-auto text-amber-500" size={48} />
              <div>
                <p className="font-extrabold text-slate-900">
                  {isFr ? 'Produit introuvable' : 'المنتج غير مسجل بعد'}
                </p>
                <p
                  className="text-xs font-mono font-bold text-slate-600 mt-2 bg-slate-100 py-2 px-3.5 rounded-xl inline-block"
                  dir="ltr"
                >
                  {scannedCode}
                </p>
              </div>

              {canManageInventory ? (
                <button
                  type="button"
                  onClick={() => {
                    onCreateProduct(scannedCode);
                    onClose();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold py-3.5 rounded-xl min-h-[44px]"
                >
                  <Plus size={18} />
                  {isFr
                    ? 'Créer un produit avec ce code-barres'
                    : 'تسجيل منتج جديد بهذا الباركود الأصلي'}
                </button>
              ) : (
                <p className="text-xs text-slate-400">
                  {isFr
                    ? "Contactez l'administrateur pour ajouter ce produit."
                    : 'تواصل مع المسؤول لإضافة هذا المنتج.'}
                </p>
              )}

              <button
                type="button"
                onClick={resetScan}
                className="text-sm text-slate-500 font-semibold"
              >
                {isFr ? '← Réessayer' : '← إعادة المحاولة'}
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-2.5 font-bold text-center">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
