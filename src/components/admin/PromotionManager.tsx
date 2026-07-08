import React, { useState, useRef } from 'react';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Promotion, Product, UserProfile } from '../../types';
import { Language } from '../../translations';
import { useAppDialog } from '../../context/AppDialogContext';
import { logActivity } from '../../utils/activityLogger';
import { cleanFirestoreData } from '../../utils/firestoreHelpers';
import { Tag, Plus, Trash2, ToggleLeft, ToggleRight, Upload, Edit } from 'lucide-react';

interface PromotionManagerProps {
  lang: Language;
  promotions: Promotion[];
  productsList: Product[];
  currentUser: UserProfile;
}

const isVideoSource = (src?: string) => {
  if (!src) return false;
  return src.startsWith('data:video/') || src.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i) != null;
};

const compressImage = (file: File, maxWidth = 800, maxHeight = 800, quality = 0.6): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        } else {
          if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(event.target?.result as string); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function PromotionManager({ lang, promotions, productsList, currentUser }: PromotionManagerProps) {
  const { alert, confirm } = useAppDialog();
  const [showForm, setShowForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'percentage' | 'buy_x_get_y'>('percentage');
  const [discountPercent, setDiscountPercent] = useState(10);
  const [buyQuantity, setBuyQuantity] = useState(2);
  const [freeQuantity, setFreeQuantity] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState<string>('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setShowForm(false);
    setEditingPromo(null);
    setName('');
    setType('percentage');
    setDiscountPercent(10);
    setBuyQuantity(2);
    setFreeQuantity(1);
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate('');
    setCategory('');
    setImageUrl('');
  };

  const handleEdit = (promo: Promotion) => {
    setEditingPromo(promo);
    setName(promo.name);
    setType(promo.type);
    setDiscountPercent(promo.discountPercent || 10);
    setBuyQuantity(promo.buyQuantity || 2);
    setFreeQuantity(promo.freeQuantity || 1);
    setStartDate(promo.startDate);
    setEndDate(promo.endDate);
    setCategory(promo.category || '');
    setImageUrl(promo.imageUrl || '');
    setShowForm(true);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true);
    try {
      if (f.type.startsWith('video/')) {
        if (f.size > 10 * 1024 * 1024) {
          alert(lang === 'fr' ? 'Fichier vidéo trop lourd (max 10 Mo).' : 'حجم الفيديو كبير جداً (10 ميغا كحد أقصى).', 'error');
          return;
        }
        const r = new FileReader();
        r.onload = () => setImageUrl(r.result as string);
        r.readAsDataURL(f);
      } else {
        const compressedBase64 = await compressImage(f);
        setImageUrl(compressedBase64);
      }
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors du traitement du fichier.' : 'حدث خطأ أثناء معالجة الملف.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !endDate) {
      alert(lang === 'fr' ? 'Champs requis manquants.' : 'حقول مطلوبة ناقصة.', 'error');
      return;
    }
    setLoading(true);
    try {
      const promoData = cleanFirestoreData({
        name: name.trim(),
        type,
        discountPercent: type === 'percentage' ? discountPercent : undefined,
        buyQuantity: type === 'buy_x_get_y' ? buyQuantity : undefined,
        freeQuantity: type === 'buy_x_get_y' ? freeQuantity : undefined,
        category: category || undefined,
        startDate,
        endDate,
        imageUrl: imageUrl || undefined,
      });

      if (editingPromo) {
        await updateDoc(doc(db, 'promotions', editingPromo.id), promoData);
        await logActivity(currentUser, 'update_promotion', 'promotion', name, editingPromo.id);
        alert(lang === 'fr' ? 'Promotion mise à jour !' : 'تم تحديث العرض!', 'success');
      } else {
        await addDoc(collection(db, 'promotions'), {
          ...promoData,
          isActive: true,
          createdAt: new Date().toISOString()
        });
        await logActivity(currentUser, 'create_promotion', 'promotion', name);
        alert(lang === 'fr' ? 'Promotion créée !' : 'تم إنشاء العرض!', 'success');
      }
      resetForm();
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur.' : 'خطأ.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (promo: Promotion) => {
    await updateDoc(doc(db, 'promotions', promo.id), { isActive: !promo.isActive });
    await logActivity(currentUser, promo.isActive ? 'deactivate_promotion' : 'activate_promotion', 'promotion', promo.name, promo.id);
  };

  const handleDelete = async (promo: Promotion) => {
    if (!(await confirm(lang === 'fr' ? 'Supprimer cette promotion ?' : 'حذف هذا العرض؟'))) return;
    await deleteDoc(doc(db, 'promotions', promo.id));
    await logActivity(currentUser, 'delete_promotion', 'promotion', promo.name, promo.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start border-b border-slate-50 pb-4">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Tag size={20} className="text-brand-cyan" />
            {lang === 'fr' ? 'Moteur Promotions' : 'محرك العروض الترويجية'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {lang === 'fr'
              ? 'Remises % ou "Achetez X, recevez Y gratuit" avec dates de validité.'
              : 'خصم نسبة مئوية أو "اشتري X واحصل على Y مجاناً" لفترة محددة.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-brand-cyan text-white font-bold text-xs py-2 px-3 rounded-xl flex items-center gap-1"
        >
          <Plus size={14} />
          {lang === 'fr' ? 'Nouvelle promo' : 'عرض جديد'}
        </button>
      </div>

      {/* Promotions List */}
      {promotions.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">{lang === 'fr' ? 'Aucune promotion.' : 'لا توجد عروض.'}</p>
      ) : (
        <div className="space-y-2">
          {promotions.map((promo) => {
            const active = promo.isActive && new Date() <= new Date(promo.endDate + 'T23:59:59');
            const isVid = isVideoSource(promo.imageUrl);
            return (
              <div key={promo.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl hover:bg-slate-50/50">
                <div className="flex items-center gap-3">
                  {promo.imageUrl ? (
                    isVid ? (
                      <video src={promo.imageUrl} className="w-12 h-12 object-cover rounded-lg border border-slate-200" muted />
                    ) : (
                      <img src={promo.imageUrl} alt="" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                    )
                  ) : (
                    <div className="w-12 h-12 bg-brand-cyan/10 rounded-lg flex items-center justify-center text-brand-cyan font-bold">P</div>
                  )}
                  <div>
                    <p className="font-bold text-slate-800">{promo.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {promo.type === 'percentage'
                        ? `-${promo.discountPercent}%`
                        : lang === 'fr'
                          ? `Achetez ${promo.buyQuantity} → ${promo.freeQuantity} gratuit`
                          : `اشتري ${promo.buyQuantity} → ${promo.freeQuantity} مجاناً`}
                      {' • '}{promo.startDate} → {promo.endDate}
                      {promo.category && ` • ${promo.category}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => handleEdit(promo)} className="text-slate-400 hover:text-brand-cyan p-1">
                    <Edit size={14} />
                  </button>
                  <button type="button" onClick={() => toggleActive(promo)} className="text-slate-400 hover:text-brand-cyan">
                    {active ? <ToggleRight size={22} className="text-emerald-500" /> : <ToggleLeft size={22} />}
                  </button>
                  <button type="button" onClick={() => handleDelete(promo)} className="text-slate-400 hover:text-rose-600 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Promotion Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h4 className="font-extrabold text-slate-900">{editingPromo ? (lang === 'fr' ? 'Modifier la promotion' : 'تعديل العرض') : (lang === 'fr' ? 'Nouvelle promotion' : 'عرض جديد')}</h4>

            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={lang === 'fr' ? 'Nom' : 'الاسم'}
              className="w-full border rounded-xl py-2 px-3 text-sm"
            />

            <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full border rounded-xl py-2 px-3 text-sm">
              <option value="percentage">{lang === 'fr' ? 'Remise %' : 'خصم %'}</option>
              <option value="buy_x_get_y">{lang === 'fr' ? 'Achetez X, Y gratuit' : 'اشتري X واحصل Y'}</option>
            </select>

            {type === 'percentage' ? (
              <input
                type="number"
                min={1}
                max={99}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                className="w-full border rounded-xl py-2 px-3 text-sm"
                placeholder="%"
              />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={2}
                  value={buyQuantity}
                  onChange={(e) => setBuyQuantity(Number(e.target.value))}
                  className="border rounded-xl py-2 px-3 text-sm"
                  placeholder="X"
                />
                <input
                  type="number"
                  min={1}
                  value={freeQuantity}
                  onChange={(e) => setFreeQuantity(Number(e.target.value))}
                  className="border rounded-xl py-2 px-3 text-sm"
                  placeholder="Y"
                />
              </div>
            )}

            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded-xl py-2 px-3 text-sm">
              <option value="">{lang === 'fr' ? 'Toutes catégories' : 'كل الفئات'}</option>
              {[...new Set(productsList.map((p) => p.category))].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded-xl py-2 px-3 text-sm" />
              <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded-xl py-2 px-3 text-sm" />
            </div>

            {/* ── Media Upload Section ── */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3">
              <label className="text-xs font-bold text-slate-600 block">
                {lang === 'fr' ? 'Média de la promotion (Photo/Vidéo)' : 'ملف العرض الترويجي (صورة أو فيديو)'}
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-brand-cyan text-white hover:bg-brand-cyan/90 font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-sm"
                >
                  <Upload size={14} />
                  {loading
                    ? (lang === 'fr' ? 'Chargement...' : 'جاري التحميل...')
                    : (lang === 'fr' ? 'Choisir un fichier' : 'اختر ملف الصورة/الفيديو')}
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*,video/*"
                  onChange={handleFile}
                  className="hidden"
                />

                <span className="text-xs text-slate-500 font-medium">
                  {imageUrl
                    ? (lang === 'fr' ? '✅ Fichier chargé' : '✅ تم تحميل الملف')
                    : (lang === 'fr' ? 'Aucun fichier sélectionné' : 'لم يتم اختيار ملف')}
                </span>
              </div>

              {imageUrl && (
                <div className="relative border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white mt-2">
                  {isVideoSource(imageUrl) ? (
                    <video src={imageUrl} controls className="w-full h-28 object-cover" />
                  ) : (
                    <img src={imageUrl} alt="preview" className="w-full h-28 object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="absolute top-2 right-2 bg-rose-500/80 text-white p-1 rounded-full hover:bg-rose-500"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={resetForm}
                className="w-full border border-slate-200 text-slate-600 font-bold py-3 rounded-xl text-sm hover:bg-slate-50 transition-all"
              >
                {lang === 'fr' ? 'Annuler' : 'إلغاء'}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-cyan text-white font-bold py-3 rounded-xl text-sm hover:bg-brand-cyan/90 transition-all disabled:opacity-60"
              >
                {loading
                  ? (lang === 'fr' ? 'Chargement...' : 'جاري الإنشاء...')
                  : (lang === 'fr' ? 'Créer' : 'إنشاء')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
