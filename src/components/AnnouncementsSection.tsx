import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query } from 'firebase/firestore';
import { db } from '../firebase';
import { Announcement, Promotion, UserProfile } from '../types';
import { Language } from '../translations';
import { useAppDialog } from '../context/AppDialogContext';
import { Megaphone, Plus, X, Pencil, Trash2, EyeOff, Eye, ChevronLeft, ChevronRight, ExternalLink, Sliders, Upload, Tag } from 'lucide-react';

interface Props { lang: Language; currentUser: UserProfile | null; }
const CAN_MANAGE = (r?: string) => r === 'admin' || r === 'manager' || r === 'cashier';

const isVideoSource = (src?: string) => {
  if (!src) return false;
  return src.startsWith('data:video/') || src.match(/\.(mp4|webm|ogg|mov|avi)($|\?)/i) != null;
};

// Compress image function using HTML Canvas to stay under 150KB (safe for Firestore's 1MB limit)
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
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

export default function AnnouncementsSection({ lang, currentUser }: Props) {
  const { alert, confirm } = useAppDialog();
  const [list, setList] = useState<Announcement[]>([]);
  const [promotionsList, setPromotionsList] = useState<Promotion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slide, setSlide] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [titleFr, setTitleFr] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [descFr, setDescFr] = useState('');
  const [descAr, setDescAr] = useState('');
  const [imgUrl, setImgUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [expAt, setExpAt] = useState('');
  const isRtl = lang === 'ar';
  const canManage = currentUser && CAN_MANAGE(currentUser.role);

  // Subscribe to ALL announcements for managers, so they can edit hidden/expired ones too.
  // Using simple index-free collection query to guarantee success.
  useEffect(() => {
    const q = query(collection(db, 'announcements'));
    const unsub = onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
      // Sort in memory by order, then by createdAt descending
      items.sort((a, b) => {
        const orderA = a.order ?? 99;
        const orderB = b.order ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      setList(items);
    }, (err) => {
      console.error("Firestore announcements error:", err);
    });
    return () => unsub();
  }, []);

  // Subscribe to active promotions to display on homepage
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'promotions'), snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Promotion));
      setPromotionsList(items);
    });
    return () => unsub();
  }, []);

  // Filter active list for the slider
  const now = new Date().toISOString();
  const activeAnnouncements = list.filter(a => a.isActive && (!a.expiresAt || a.expiresAt > now));

  useEffect(() => {
    if (activeAnnouncements.length <= 1) return;
    timer.current = setInterval(() => setSlide(p => (p + 1) % activeAnnouncements.length), 6000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [activeAnnouncements.length]);

  const goTo = (i: number) => { 
    if (timer.current) clearInterval(timer.current); 
    setSlide((i + activeAnnouncements.length) % activeAnnouncements.length); 
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
        r.onload = () => setImgUrl(r.result as string);
        r.readAsDataURL(f);
      } else {
        const compressedBase64 = await compressImage(f);
        setImgUrl(compressedBase64);
      }
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors du traitement du fichier.' : 'حدث خطأ أثناء معالجة الملف.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { 
    setTitleFr(''); setTitleAr(''); setDescFr(''); setDescAr(''); 
    setImgUrl(''); setLinkUrl(''); setExpAt(''); setEditId(null); 
    setShowForm(false); 
  };
  
  const openEdit = (a: Announcement) => { 
    setTitleFr(a.titleFr); setTitleAr(a.titleAr); 
    setDescFr(a.descriptionFr||''); setDescAr(a.descriptionAr||''); 
    setImgUrl(a.imageUrl||''); setLinkUrl(a.linkUrl||''); 
    setExpAt(a.expiresAt?a.expiresAt.slice(0,10):''); 
    setEditId(a.id); setShowForm(true); 
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleFr.trim() && !titleAr.trim()) { 
      alert(lang==='fr'?'Titre requis.':'العنوان مطلوب.','error'); 
      return; 
    }
    setLoading(true);
    try {
      const payload = { 
        titleFr: titleFr.trim(), 
        titleAr: titleAr.trim(), 
        descriptionFr: descFr.trim()||undefined, 
        descriptionAr: descAr.trim()||undefined, 
        imageUrl: imgUrl||undefined, 
        linkUrl: linkUrl.trim()||undefined, 
        isActive: true, 
        createdBy: currentUser!.uid, 
        createdByName: currentUser!.name, 
        createdAt: editId ? list.find(a=>a.id===editId)?.createdAt||new Date().toISOString() : new Date().toISOString(), 
        expiresAt: expAt?new Date(expAt).toISOString():undefined, 
        order: editId ? list.find(a=>a.id===editId)?.order ?? list.length : list.length 
      };
      
      if (editId) { 
        await updateDoc(doc(db,'announcements',editId), payload as Record<string,unknown>); 
        alert(lang==='fr'?'Mis à jour avec succès !':'تم تحديث الإعلان بنجاح!','success'); 
      } else { 
        const ref = await addDoc(collection(db,'announcements'), payload); 
        await updateDoc(doc(db,'announcements',ref.id),{id:ref.id}); 
        alert(lang==='fr'?'Publié avec succès !':'تم نشر الإعلان بنجاح!','success'); 
      }
      reset();
    } catch(err: any) { 
      console.error(err); 
      alert((lang==='fr'?'Erreur: ':'خطأ: ') + (err.message || err),'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  const toggleActive = async (a: Announcement) => { 
    try {
      await updateDoc(doc(db,'announcements',a.id),{isActive:!a.isActive}); 
      alert(lang === 'fr' ? 'Statut mis à jour.' : 'تم تحديث حالة الإعلان.', 'success');
    } catch (err: any) {
      alert((lang === 'fr' ? 'Erreur: ' : 'خطأ: ') + (err.message || err), 'error');
    }
  };

  const handleDel = async (a: Announcement) => { 
    if (!(await confirm(lang==='fr'?`Supprimer "${a.titleFr}" ?`:`هل أنت متأكد من حذف "${a.titleAr}"؟`))) return; 
    try {
      await deleteDoc(doc(db,'announcements',a.id)); 
      alert(lang === 'fr' ? 'Annonce supprimée.' : 'تم حذف الإعلان.', 'success');
    } catch (err: any) {
      alert((lang === 'fr' ? 'Erreur: ' : 'خطأ: ') + (err.message || err), 'error');
    }
  };

  if (activeAnnouncements.length === 0 && !canManage) return null;
  const cur = activeAnnouncements[slide] ?? null;

  return (
    <div className="space-y-4" dir={isRtl?'rtl':'ltr'}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Megaphone size={18} className="text-brand-cyan" />
          <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest">{lang==='fr'?'Annonces & Promotions':'الإعلانات والعروض'}</h3>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button 
              onClick={() => setShowManager(!showManager)} 
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${showManager ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-500'}`}
            >
              <Sliders size={13}/>
              {lang==='fr'?'Gérer':'قائمة الإعلانات'}
            </button>
            <button onClick={()=>{reset();setShowForm(true);}} className="flex items-center gap-1.5 bg-brand-cyan text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-brand-cyan/90 transition-all">
              <Plus size={13}/>{lang==='fr'?'Ajouter':'إضافة إعلان'}
            </button>
          </div>
        )}
      </div>

      {/* ── Management list view ───────────────────────────────────────── */}
      {canManage && showManager && (
        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 rounded-2xl p-4 space-y-3 animate-in fade-in duration-300">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">{lang==='fr'?'Liste des Annonces':'قائمة إدارة الإعلانات'}</h4>
            <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md">{list.length} {lang==='fr'?'au total':'إجمالي'}</span>
          </div>

          {list.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">{lang==='fr'?'Aucune annonce enregistrée.':'لا توجد إعلانات مسجلة.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left rtl:text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold">
                    <th className="py-2 px-1">{lang==='fr'?'Média':'العرض'}</th>
                    <th className="py-2 px-2">{lang==='fr'?'Titre':'العنوان'}</th>
                    <th className="py-2 px-2">{lang==='fr'?'Statut':'الحالة'}</th>
                    <th className="py-2 px-2 text-center">{lang==='fr'?'Actions':'العمليات'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                  {list.map(a => {
                    const isVid = isVideoSource(a.imageUrl);
                    const isExpired = a.expiresAt && a.expiresAt <= now;
                    return (
                      <tr key={a.id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/30">
                        <td className="py-2 px-1">
                          {a.imageUrl ? (
                            isVid ? (
                              <video src={a.imageUrl} className="w-10 h-10 object-cover rounded-lg border border-slate-200" muted />
                            ) : (
                              <img src={a.imageUrl} alt="" className="w-10 h-10 object-cover rounded-lg border border-slate-200" />
                            )
                          ) : (
                            <div className="w-10 h-10 bg-brand-cyan/20 rounded-lg flex items-center justify-center text-brand-cyan font-bold">A</div>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <p className="font-bold text-slate-700 dark:text-slate-200 line-clamp-1">{isRtl ? a.titleAr : a.titleFr}</p>
                          {a.expiresAt && <p className="text-[10px] text-slate-400">{lang==='fr'?'Exp. le':'ينتهي: '} {a.expiresAt.slice(0, 10)} {isExpired && '⚠️'}</p>}
                        </td>
                        <td className="py-2 px-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.isActive && !isExpired ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                            {isExpired ? (lang==='fr'?'Expiré':'منتهي') : a.isActive ? (lang==='fr'?'Actif':'نشط') : (lang==='fr'?'Masqué':'مخفي')}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex justify-center gap-1">
                            <button onClick={()=>openEdit(a)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-600" title={lang==='fr'?'Modifier':'تعديل'}><Pencil size={13}/></button>
                            <button onClick={()=>toggleActive(a)} className={`p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md ${a.isActive?'text-slate-600':'text-amber-600'}`} title={a.isActive?lang==='fr'?'Masquer':'إخفاء':lang==='fr'?'Afficher':'إظهار'}>{a.isActive?<EyeOff size={13}/>:<Eye size={13}/>}</button>
                            <button onClick={()=>handleDel(a)} className="p-1 hover:bg-rose-50 rounded-md text-rose-600" title={lang==='fr'?'Supprimer':'حذف'}><Trash2 size={13}/></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Carousel slider view ───────────────────────────────────────── */}
      {activeAnnouncements.length > 0 && cur && (
        <div className="relative overflow-hidden rounded-2xl shadow-lg group border border-slate-100 dark:border-slate-800">
          <div className="relative min-h-[180px] md:min-h-[260px] flex items-end">
            
            {/* Visual media content with smooth transition */}
            <div key={slide} className="absolute inset-0 w-full h-full z-0 animate-in fade-in duration-500">
              {cur.imageUrl ? (
                isVideoSource(cur.imageUrl) ? (
                  <video
                    src={cur.imageUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={cur.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <div className="w-full h-full bg-gradient-to-r from-brand-dark to-[#164e63]" />
              )}
            </div>

            {/* Premium readable gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent z-10" />

            <div key={`text-${slide}`} className="relative z-20 w-full p-5 md:p-7 text-white animate-in fade-in slide-in-from-bottom-2 duration-500">
              <p className="text-[10px] font-black uppercase tracking-widest text-brand-cyan mb-1">{lang==='fr'?'Annonce':'إعلان'}</p>
              <h4 className="text-lg md:text-2xl font-black leading-tight drop-shadow">{isRtl?cur.titleAr:cur.titleFr}</h4>
              {(isRtl?cur.descriptionAr:cur.descriptionFr) && <p className="text-sm text-white/80 mt-1 line-clamp-2">{isRtl?cur.descriptionAr:cur.descriptionFr}</p>}
              {cur.linkUrl && <a href={cur.linkUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-all"><ExternalLink size={12}/>{lang==='fr'?'En savoir plus':'اعرف المزيد'}</a>}
            </div>

            {/* Admin overlay buttons on card (Always visible with styling for easy clickability) */}
            {canManage && (
              <div className="absolute top-3 right-3 rtl:left-3 rtl:right-auto flex gap-1.5 z-20">
                <button onClick={()=>openEdit(cur)} className="p-1.5 bg-white/90 text-slate-700 hover:bg-white rounded-lg shadow-md transition-all active:scale-95" title={lang==='fr'?'Modifier':'تعديل'}><Pencil size={13}/></button>
                <button onClick={()=>toggleActive(cur)} className="p-1.5 bg-white/90 text-slate-700 hover:bg-white rounded-lg shadow-md transition-all active:scale-95" title={lang==='fr'?'Statut':'الحالة'}>{cur.isActive?<EyeOff size={13}/>:<Eye size={13}/>}</button>
                <button onClick={()=>handleDel(cur)} className="p-1.5 bg-white/90 text-rose-600 hover:bg-rose-50 rounded-lg shadow-md transition-all active:scale-95" title={lang==='fr'?'Supprimer':'حذف'}><Trash2 size={13}/></button>
              </div>
            )}
          </div>
          {activeAnnouncements.length > 1 && <>
            <button onClick={()=>goTo(slide-1)} className="absolute left-2 rtl:right-2 rtl:left-auto top-1/2 -translate-y-1/2 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-all z-20"><ChevronLeft size={16}/></button>
            <button onClick={()=>goTo(slide+1)} className="absolute right-2 rtl:left-2 rtl:right-auto top-1/2 -translate-y-1/2 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-all z-20"><ChevronRight size={16}/></button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
              {activeAnnouncements.map((_,i)=><button key={i} onClick={()=>goTo(i)} className={`h-2 rounded-full transition-all ${i===slide?'bg-brand-cyan w-5':'bg-white/50 w-2'}`}/>)}
            </div>
          </>}
        </div>
      )}

      {/* Empty state for admins/managers */}
      {activeAnnouncements.length === 0 && canManage && (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-white dark:bg-slate-900/30">
          <Megaphone size={32} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-sm font-bold text-slate-400">{lang==='fr'?'Aucune annonce publiée active.':'لا توجد إعلانات نشطة منشورة.'}</p>
          <button onClick={()=>{reset();setShowForm(true);}} className="mt-3 text-xs font-bold text-brand-cyan hover:underline">{lang==='fr'?'+ Ajouter':'+ أضف إعلاناً'}</button>
        </div>
      )}

      {/* ── Active Promotions Banners ── */}
      {(() => {
        const now = new Date().toISOString().slice(0,10);
        const activePromos = promotionsList.filter(p => p.isActive && p.endDate >= now);
        if (activePromos.length === 0) return null;
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <Tag size={16} className="text-brand-cyan" />
              <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest">
                {lang === 'fr' ? 'Promotions en cours' : 'العروض الترويجية'}
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activePromos.map(promo => {
                const isVid = isVideoSource(promo.imageUrl);
                return (
                  <div key={promo.id} className="relative rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-gradient-to-br from-brand-cyan/10 to-sky-50 flex items-center gap-3 p-3 hover:shadow-md transition-all">
                    {promo.imageUrl ? (
                      isVid ? (
                        <video src={promo.imageUrl} className="w-16 h-16 object-cover rounded-xl flex-shrink-0 border border-slate-200" muted />
                      ) : (
                        <img src={promo.imageUrl} alt="" className="w-16 h-16 object-cover rounded-xl flex-shrink-0 border border-slate-200" />
                      )
                    ) : (
                      <div className="w-16 h-16 rounded-xl flex-shrink-0 bg-brand-cyan/20 flex items-center justify-center">
                        <Tag size={24} className="text-brand-cyan" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 text-sm truncate">{promo.name}</p>
                      <p className="text-xs font-bold text-brand-cyan mt-0.5">
                        {promo.type === 'percentage'
                          ? (lang === 'fr' ? `Remise de ${promo.discountPercent}%` : `خصم ${promo.discountPercent}%`)
                          : (lang === 'fr'
                            ? `Achetez ${promo.buyQuantity}, obtenez ${promo.freeQuantity} gratuit`
                            : `اشتري ${promo.buyQuantity} واحصل على ${promo.freeQuantity} مجاناً`)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {lang === 'fr' ? `Jusqu'au ` : 'حتى '}{promo.endDate}
                        {promo.category && ` • ${promo.category}`}
                      </p>
                    </div>
                    <div className="absolute top-2 right-2 rtl:left-2 rtl:right-auto bg-brand-cyan text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                      {promo.type === 'percentage' ? `-${promo.discountPercent}%` : '🎁'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl border border-slate-100" dir={isRtl?'rtl':'ltr'}>
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                <Megaphone size={16} className="text-brand-cyan"/>
                {editId?(lang==='fr'?'Modifier l\'annonce':'تعديل الإعلان'):(lang==='fr'?'Nouvelle annonce':'إعلان جديد')}
              </h4>
              <button onClick={reset} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-slate-500 block mb-1">Titre FR</label><input value={titleFr} onChange={e=>setTitleFr(e.target.value)} placeholder="Titre..." className="w-full border border-slate-200 rounded-xl py-2 px-3 text-sm focus:border-brand-cyan focus:outline-none"/></div>
                <div><label className="text-xs font-bold text-slate-500 block mb-1">العنوان AR</label><input value={titleAr} onChange={e=>setTitleAr(e.target.value)} placeholder="العنوان..." className="w-full border border-slate-200 rounded-xl py-2 px-3 text-sm text-right focus:border-brand-cyan focus:outline-none" dir="rtl"/></div>
                <div><label className="text-xs font-bold text-slate-500 block mb-1">Description FR</label><textarea value={descFr} onChange={e=>setDescFr(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl py-2 px-3 text-sm resize-none focus:border-brand-cyan focus:outline-none"/></div>
                <div><label className="text-xs font-bold text-slate-500 block mb-1">الوصف AR</label><textarea value={descAr} onChange={e=>setDescAr(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl py-2 px-3 text-sm resize-none text-right focus:border-brand-cyan focus:outline-none" dir="rtl"/></div>
              </div>

              {/* Styled upload interface */}
              <div className="bg-slate-50 dark:bg-slate-900/10 p-4 rounded-xl border border-slate-200/60">
                <label className="text-xs font-bold text-slate-600 block mb-2">{lang==='fr'?'Média de l\'annonce (Photo/Vidéo)':'ملف الإعلان (صورة أو فيديو)'}</label>
                
                <div className="flex items-center gap-3">
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-brand-cyan text-white hover:bg-brand-cyan/95 font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-sm"
                  >
                    <Upload size={14} />
                    {lang === 'fr' ? 'Choisir un fichier' : 'اختر ملف الصورة/الفيديو'}
                  </button>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    accept="image/*,video/*" 
                    onChange={handleFile} 
                    className="hidden" 
                  />
                  
                  <span className="text-xs text-slate-500 font-medium">
                    {imgUrl ? (lang === 'fr' ? '✅ Fichier chargé' : '✅ تم تحميل الملف') : (lang === 'fr' ? 'Aucun fichier sélectionné' : 'لم يتم اختيار ملف')}
                  </span>
                </div>
                
                <p className="text-[10px] text-slate-400 mt-2">
                  {lang==='fr'?'Optimisation automatique des images pour éviter les lenteurs. Vidéos max 10Mo.':'يتم تحسين الصور تلقائياً لسرعة التحميل. الحد الأقصى للفيديوهات هو 10 ميغا.'}</p>
                
                {imgUrl&&<div className="mt-3 relative border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
                  {isVideoSource(imgUrl) ? (
                    <video src={imgUrl} controls className="w-full h-28 object-cover" />
                  ) : (
                    <img src={imgUrl} alt="preview" className="w-full h-28 object-cover" />
                  )}
                  <button type="button" onClick={()=>setImgUrl('')} className="absolute top-1.5 right-1.5 p-1 bg-white hover:bg-slate-100 rounded-full shadow text-rose-500 transition-all"><X size={12}/></button>
                </div>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-slate-500 block mb-1">{lang==='fr'?'Lien CTA (optionnel)':'الرابط الترويجي (اختياري)'}</label><input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="https://..." className="w-full border border-slate-200 rounded-xl py-2 px-3 text-sm focus:border-brand-cyan focus:outline-none"/></div>
                <div><label className="text-xs font-bold text-slate-500 block mb-1">{lang==='fr'?'Expire le':'تاريخ الانتهاء'}</label><input type="date" value={expAt} onChange={e=>setExpAt(e.target.value)} className="w-full border border-slate-200 rounded-xl py-2 px-3 text-sm focus:border-brand-cyan focus:outline-none"/></div>
              </div>

              <div className="flex gap-2 pt-2 border-t mt-4">
                <button type="button" onClick={reset} className="flex-1 bg-slate-100 text-slate-700 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-200">{lang==='fr'?'Annuler':'إلغاء'}</button>
                <button type="submit" disabled={loading} className="flex-1 bg-brand-cyan text-white font-bold text-sm py-2.5 rounded-xl hover:bg-brand-cyan/90 disabled:opacity-50">{loading?(lang==='fr'?'Traitement...':'معالجة...'):(editId?(lang==='fr'?'Mettre à jour':'تحديث'):(lang==='fr'?'Publier':'نشر الإعلان'))}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
