import { useCallback, useEffect, useRef, useState } from 'react';
import { Product, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';
import { findProductByCode } from '../utils/productFirestore';
import { hasPermission } from '../utils/permissions';
import { ScanBarcode, X, Keyboard, Printer, Plus, ShoppingCart, PackagePlus } from 'lucide-react';

type ScanPhase = 'scan' | 'found' | 'not_found';

interface BarcodeScannerProps {
  lang: Language;
  products: Product[];
  user: UserProfile | null;
  onAddToCart: (product: Product, quantity: number) => void;
  onPrintBarcode: (product: Product) => void;
  onCreateProduct: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({
  lang,
  products,
  user,
  onAddToCart,
  onPrintBarcode,
  onCreateProduct,
  onClose
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [phase, setPhase] = useState<ScanPhase>('scan');
  const [scannedCode, setScannedCode] = useState('');
  const [foundProduct, setFoundProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const canManageInventory = hasPermission(user, 'manage_inventory');
  const canSell = hasPermission(user, 'sell');
  const canUseScanner = hasPermission(user, 'use_scanner');

  const formatPrice = (n: number) =>
    new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(n) +
    ' ' + getTranslation(lang, 'currency');

  const processCode = useCallback(
    (code: string) => {
      const normalized = code.trim();
      if (!normalized) return;

      setScannedCode(normalized);
      setError('');

      const product = findProductByCode(products, normalized);
      if (product) {
        setFoundProduct(product);
        setQuantity(1);
        setPhase('found');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setScanning(false);
      } else {
        setFoundProduct(null);
        setPhase('not_found');
      }
    },
    [products]
  );

  // Store products in ref to avoid re-running useEffect
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const processCodeStable = useCallback((code: string) => {
    const normalized = code.trim();
    if (!normalized) return;

    setScannedCode(normalized);
    setError('');

    const product = findProductByCode(productsRef.current, normalized);
    if (product) {
      setFoundProduct(product);
      setQuantity(1);
      setPhase('found');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setScanning(false);
    } else {
      setFoundProduct(null);
      setPhase('not_found');
    }
  }, []);

  useEffect(() => {
    if (phase !== 'scan') return;

    let cancelled = false;

    const startCamera = async () => {
      // Check if BarcodeDetector is supported
      if (!('BarcodeDetector' in window)) {
        console.log('BarcodeDetector not supported, using camera without scanning');
        // Still allow camera to work even without BarcodeDetector
      }

      if (!canUseScanner) {
        setError(lang === 'fr' ? 'Permission refusée pour le scanner.' : 'تم رفض صلاحية استخدام الماسح.');
        setScanning(false);
        return;
      }

      try {
        console.log('Requesting camera access...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        console.log('Camera stream obtained');

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          console.log('Video playing');
        }

        setScanning(true);

        // Only start barcode detection if BarcodeDetector is supported
        if ('BarcodeDetector' in window) {
          try {
            const detector = new (window as any).BarcodeDetector({
              formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code']
            });

            intervalRef.current = window.setInterval(async () => {
              if (!videoRef.current) return;
              try {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes.length > 0) {
                  processCodeStable(barcodes[0].rawValue);
                }
              } catch {
                /* frame skip */
              }
            }, 500);
          } catch (detectorError) {
            console.error('BarcodeDetector error:', detectorError);
            setError(lang === 'fr' ? 'Erreur du détecteur de codes-barres.' : 'خطأ في ماسح الباركود.');
          }
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError(lang === 'fr' ? 'Erreur d\'accès à la caméra. Vérifiez les permissions.' : 'خطأ في الوصول للكاميرا. تحقق من الصلاحيات.');
        setScanning(false);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [phase, canUseScanner, processCodeStable, lang]);

  const resetScan = () => {
    setPhase('scan');
    setFoundProduct(null);
    setScannedCode('');
    setManualCode('');
    setError('');
    setQuantity(1);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex justify-between items-center px-4 sm:px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 font-extrabold text-slate-900 text-sm sm:text-base">
            <ScanBarcode size={20} className="text-brand-cyan shrink-0" />
            {lang === 'fr' ? 'Scanner Code-Barres' : 'مسح الباركود'}
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {phase === 'scan' && (
            <>
              {scanning ? (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] sm:aspect-video">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  <div className="absolute inset-0 border-2 border-brand-cyan/60 m-6 sm:m-8 rounded-lg pointer-events-none" />
                </div>
              ) : (
                <div className="bg-slate-50 rounded-2xl p-6 text-center text-sm text-slate-500">
                  <Keyboard className="mx-auto mb-2 text-slate-400" size={32} />
                  {lang === 'fr'
                    ? 'Caméra indisponible. Saisissez le code manuellement.'
                    : 'الكاميرا غير متاحة. أدخل الرمز يدوياً.'}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  processCode(manualCode);
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder={lang === 'fr' ? 'Code-barres EAN / référence...' : 'باركود EAN / مرجع...'}
                  className="flex-1 border border-slate-200 rounded-xl py-3 px-3 text-base sm:text-sm focus:outline-none focus:border-brand-cyan min-h-[44px]"
                  autoFocus={!scanning}
                />
                <button
                  type="submit"
                  className="bg-brand-cyan text-white font-bold px-6 py-3 rounded-xl text-sm min-h-[44px] sm:min-h-0"
                >
                  {lang === 'fr' ? 'Rechercher' : 'بحث'}
                </button>
              </form>
            </>
          )}

          {phase === 'found' && foundProduct && (
            <div className="space-y-4">
              <div className="flex gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl">
                {foundProduct.image && String(foundProduct.image) !== '0' && (
                  <img
                    src={foundProduct.image}
                    alt=""
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-slate-900 text-sm leading-snug">{foundProduct.name}</p>
                  <p className="text-brand-cyan font-black text-base mt-1">{formatPrice(foundProduct.price)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Stock: {foundProduct.stock} • {foundProduct.category}
                  </p>
                  <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">
                    {foundProduct.barcode || scannedCode}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">
                  {lang === 'fr' ? 'Quantité à ajouter' : 'الكمية للإضافة'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={foundProduct.stock}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-full border border-slate-200 rounded-xl py-3 px-4 text-base font-bold min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {canSell && foundProduct.stock > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      for (let i = 0; i < quantity; i++) {
                        onAddToCart(foundProduct, 1);
                      }
                      onClose();
                    }}
                    className="flex items-center justify-center gap-2 bg-brand-cyan text-white font-bold py-3 rounded-xl min-h-[44px] text-sm"
                  >
                    <ShoppingCart size={16} />
                    {getTranslation(lang, 'addToCart')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onPrintBarcode(foundProduct)}
                  className="flex items-center justify-center gap-2 bg-slate-800 text-white font-bold py-3 rounded-xl min-h-[44px] text-sm"
                >
                  <Printer size={16} />
                  {lang === 'fr' ? 'Imprimer barcode' : 'طباعة باركود'}
                </button>
              </div>

              <button type="button" onClick={resetScan} className="w-full text-sm text-slate-500 font-semibold py-2">
                {lang === 'fr' ? '← Scanner un autre code' : '← مسح رمز آخر'}
              </button>
            </div>
          )}

          {phase === 'not_found' && (
            <div className="space-y-4 text-center py-4">
              <PackagePlus className="mx-auto text-amber-500" size={48} />
              <div>
                <p className="font-extrabold text-slate-900">
                  {lang === 'fr' ? 'Produit introuvable' : 'المنتج غير موجود'}
                </p>
                <p className="text-xs font-mono text-slate-500 mt-2 bg-slate-50 py-2 px-3 rounded-xl inline-block">
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
                  className="w-full flex items-center justify-center gap-2 bg-brand-cyan text-white font-bold py-3 rounded-xl min-h-[44px]"
                >
                  <Plus size={18} />
                  {lang === 'fr' ? 'Ajouter nouveau produit' : 'إضافة منتج جديد'}
                </button>
              ) : (
                <p className="text-xs text-slate-400">
                  {lang === 'fr'
                    ? 'Contactez l\'administrateur pour ajouter ce produit.'
                    : 'تواصل مع المسؤول لإضافة هذا المنتج.'}
                </p>
              )}

              <button type="button" onClick={resetScan} className="text-sm text-slate-500 font-semibold">
                {lang === 'fr' ? '← Réessayer' : '← إعادة المحاولة'}
              </button>
            </div>
          )}

          {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
        </div>
      </div>
    </div>
  );
}
