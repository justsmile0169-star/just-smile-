import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Product } from '../types';
import { getTranslation, Language } from '../translations';
import { 
  Download, Upload, AlertCircle, CheckCircle, FileSpreadsheet, 
  X, AlertTriangle, Eye, Database, ListFilter, Check, ArrowRight, RefreshCw
} from 'lucide-react';
import { useAppDialog } from '../context/AppDialogContext';
import { cleanFirestoreData, chunkArray, FIRESTORE_BATCH_LIMIT } from '../utils/firestoreHelpers';

interface ExcelImporterProps {
  lang: Language;
  existingProducts: Product[];
  onImportComplete: () => void;
  onClose: () => void;
}

interface RowError {
  rowNum: number;
  errors: string[];
}

interface DuplicateRow {
  rowNum: number;
  name: string;
  type: 'database' | 'spreadsheet';
  category: string;
  price: number;
  stock: number;
}

export default function ExcelImporter({ 
  lang, 
  existingProducts, 
  onImportComplete, 
  onClose 
}: ExcelImporterProps) {
  const { alert } = useAppDialog();
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Parsed states
  const [parsedData, setParsedData] = useState<Partial<Product>[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateRow[]>([]);
  const [totalRowsAnalysed, setTotalRowsAnalysed] = useState(0);
  const [fileName, setFileName] = useState('');
  const [importedSuccessfully, setImportedSuccessfully] = useState(false);
  const [importCount, setImportCount] = useState(0);

  // Tab state inside the report
  const [activeTab, setActiveTab] = useState<'valid' | 'duplicates' | 'errors'>('valid');

  // 1. Download Template Excel file
  const downloadTemplate = () => {
    const templateData = [
      {
        Nom: 'Seringue d\'anesthésie 1.8ml',
        Prix_DZD: 4500,
        Stock: 120,
        Categorie: 'Instruments',
        Description: 'Seringue d\'aspiration haut de gamme en acier inoxydable.',
        Fiche_Technique: 'Matériau: Acier Inox; Autoclavable: Oui 134°C',
        Date_Expiration_AAAA_MM_JJ: '2028-12-31',
        Seuil_Alerte_Stock: 10,
        Remise_Pourcentage: 5
      },
      {
        Nom: 'Masques chirurgicaux dentaires (Boîte de 50)',
        Prix_DZD: 850,
        Stock: 500,
        Categorie: 'Hygiène & Stérilisation',
        Description: 'Masques de protection 3 plis de haute filtration.',
        Fiche_Technique: 'BFE > 98%; Norme: EN 14683 Type II',
        Date_Expiration_AAAA_MM_JJ: '2027-06-30',
        Seuil_Alerte_Stock: 50,
        Remise_Pourcentage: 0
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'JUST SMILE Products');

    // Generate buffer and trigger download
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'just_smile_product_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Process Excel File Core logic
  const processFile = (file: File) => {
    setFileName(file.name);
    setLoading(true);
    setParsedData([]);
    setErrors([]);
    setDuplicates([]);
    setImportedSuccessfully(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert worksheet to JSON (header as keys)
        const rawRows = XLSX.utils.sheet_to_json<any>(worksheet);
        setTotalRowsAnalysed(rawRows.length);

        const validCategories = [
          'Équipements',
          'Consommables',
          'Instruments',
          'Orthodontie',
          'Hygiène & Stérilisation',
          'Prothèse dentaire'
        ];

        const tempValidProducts: Partial<Product>[] = [];
        const tempErrors: RowError[] = [];
        const tempDuplicates: DuplicateRow[] = [];

        rawRows.forEach((row, idx) => {
          const rowNum = idx + 2; // Row number in Excel (header is row 1)
          const rowErrors: string[] = [];

          const name = String(row['Nom'] || row['name'] || '').trim();
          const price = parseFloat(row['Prix_DZD'] || row['price'] || '0');
          const stock = parseInt(row['Stock'] || row['stock'] || '0', 10);
          const category = String(row['Categorie'] || row['category'] || '').trim();
          const description = String(row['Description'] || row['description'] || '').trim();
          const technicalSheet = String(row['Fiche_Technique'] || row['technicalSheet'] || '').trim();
          const expiryDate = row['Date_Expiration_AAAA_MM_JJ'] || row['expiryDate'] || '';
          const lowStockAlert = parseInt(row['Seuil_Alerte_Stock'] || row['lowStockAlert'] || '5', 10);
          const discountPercent = parseInt(row['Remise_Pourcentage'] || row['discountPercent'] || '0', 10);

          // 1. Structural fields validation
          if (!name) {
            rowErrors.push(lang === 'fr' ? 'Nom du produit manquant.' : 'اسم المنتج مفقود.');
          }

          if (isNaN(price) || price <= 0) {
            rowErrors.push(lang === 'fr' ? 'Le prix doit être supérieur à 0.' : 'يجب أن يكون السعر أكبر من 0.');
          }

          if (isNaN(stock) || stock < 0) {
            rowErrors.push(lang === 'fr' ? 'Le stock doit être un entier positif.' : 'المخزون يجب أن يكون عددًا صحيحًا موجبًا.');
          }

          if (!category) {
            rowErrors.push(lang === 'fr' ? 'Catégorie manquante.' : 'الفئة مفقودة.');
          } else if (!validCategories.includes(category)) {
            rowErrors.push(
              lang === 'fr' 
                ? `Catégorie invalide. Valeurs autorisées: ${validCategories.join(', ')}` 
                : `فئة غير صالحة. القيم المسموح بها: ${validCategories.join(', ')}`
            );
          }

          let formattedExpiry = '';
          if (expiryDate) {
            const dateStr = String(expiryDate).trim();
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(dateStr)) {
              rowErrors.push(lang === 'fr' ? 'Format date d\'expiration incorrect (AAAA-MM-JJ).' : 'صيغة تاريخ انتهاء الصلاحية غير صحيحة (YYYY-MM-DD).');
            } else {
              formattedExpiry = dateStr;
            }
          }

          // If there are structural errors, push to errors list and skip duplicates check for this row
          if (rowErrors.length > 0) {
            tempErrors.push({ rowNum, errors: rowErrors });
            return;
          }

          // 2. Duplicate Detection
          const isDuplicateInDatabase = existingProducts.some(
            (p) => p.name.toLowerCase() === name.toLowerCase()
          );

          const isDuplicateInBatch = tempValidProducts.some(
            (p) => p.name?.toLowerCase() === name.toLowerCase()
          );

          if (isDuplicateInDatabase) {
            tempDuplicates.push({
              rowNum,
              name,
              type: 'database',
              category,
              price,
              stock
            });
            return;
          }

          if (isDuplicateInBatch) {
            tempDuplicates.push({
              rowNum,
              name,
              type: 'spreadsheet',
              category,
              price,
              stock
            });
            return;
          }

          // If no errors and no duplicates, it's valid!
          tempValidProducts.push(cleanFirestoreData({
            name,
            price,
            stock,
            category: category as Product['category'],
            description,
            technicalSheet: technicalSheet || undefined,
            expiryDate: formattedExpiry || undefined,
            lowStockAlert: isNaN(lowStockAlert) ? 5 : lowStockAlert,
            discountPercent: isNaN(discountPercent) ? 0 : discountPercent,
            image: `https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300`
          }));
        });

        setParsedData(tempValidProducts);
        setErrors(tempErrors);
        setDuplicates(tempDuplicates);

        // Auto-select initial active tab based on contents
        if (tempValidProducts.length > 0) {
          setActiveTab('valid');
        } else if (tempDuplicates.length > 0) {
          setActiveTab('duplicates');
        } else if (tempErrors.length > 0) {
          setActiveTab('errors');
        }

      } catch (err) {
        console.error(err);
        alert(lang === 'fr' ? 'Erreur lors de la lecture du fichier Excel.' : 'خطأ أثناء قراءة ملف الإكسل.', 'error');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // File Inputs
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // Validate is Excel file
      const file = files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        processFile(file);
      } else {
        alert(lang === 'fr' ? 'Veuillez déposer un fichier Excel (.xlsx ou .xls)' : 'يرجى إسقاط ملف إكسل فقط (.xlsx أو .xls)', 'error');
      }
    }
  };

  // Save to Firestore batch action
  const importToDatabase = async () => {
    if (parsedData.length === 0) return;
    setLoading(true);

    try {
      const productsRef = collection(db, 'products');
      const chunks = chunkArray(parsedData, FIRESTORE_BATCH_LIMIT);
      let savedCount = 0;

      for (const chunk of chunks) {
        const batch = writeBatch(db);

        chunk.forEach((prod) => {
          const newDocRef = doc(productsRef);
          batch.set(
            newDocRef,
            cleanFirestoreData({
              ...prod,
              id: newDocRef.id
            })
          );
        });

        await batch.commit();
        savedCount += chunk.length;
      }

      localStorage.setItem('justsmile_catalog_seeded', '1');
      setImportCount(savedCount);
      setImportedSuccessfully(true);
      onImportComplete();

      alert(
        lang === 'fr'
          ? `${savedCount} produit(s) enregistré(s) dans la base de données.`
          : `تم حفظ ${savedCount} منتج(ات) في قاعدة البيانات.`,
        'success'
      );

      setParsedData([]);
      setErrors([]);
      setDuplicates([]);
      setFileName('');
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la sauvegarde dans la base de données.' : 'حدث خطأ أثناء الحفظ في قاعدة البيانات.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const clearCurrentFile = () => {
    setParsedData([]);
    setErrors([]);
    setDuplicates([]);
    setFileName('');
    setTotalRowsAnalysed(0);
    setImportedSuccessfully(false);
  };

  const formatPrice = (num: number) => {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' ' + getTranslation(lang, 'currency');
  };

  const isRtl = lang === 'ar';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 border border-teal-100 shrink-0">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-black text-slate-900 leading-tight">
                {lang === 'fr' ? 'Importer Produits via Excel' : 'استيراد المنتجات عبر الإكسل'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {lang === 'fr' 
                  ? 'Ajoutez en lot des produits à votre catalogue avec détection de doublons.' 
                  : 'أضف كميات كبيرة من المنتجات إلى دليلك مع الكشف التلقائي عن التكرارات.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 min-h-[300px]">
          
          {/* SUCCESS SCREEN */}
          {importedSuccessfully ? (
            <div className="flex flex-col items-center justify-center text-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 text-3xl animate-bounce">
                🎉
              </div>
              <div className="space-y-2 max-w-md">
                <h4 className="text-xl font-extrabold text-slate-900">
                  {lang === 'fr' ? 'Importation Réussie !' : 'تم الاستيراد بنجاح!'}
                </h4>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {lang === 'fr' 
                    ? `Félicitations, ${importCount} nouveaux produits ont été validés, nettoyés et enregistrés avec succès dans votre catalogue.`
                    : `تهانينا، تم التحقق من ${importCount} منتجات جديدة وتصفيتها وحفظها بنجاح في دليلكم.`}
                </p>
              </div>
              <button
                onClick={() => {
                  onImportComplete();
                  onClose();
                }}
                className="mt-6 bg-brand-cyan hover:bg-brand-cyan/95 text-white font-extrabold px-6 py-2.5 rounded-xl transition-all shadow-md text-sm"
              >
                {lang === 'fr' ? 'Terminer & Fermer' : 'إنهاء وإغلاق'}
              </button>
            </div>
          ) : (
            <>
              {/* FILE SELECTION / DRAG DROP AREA */}
              {!fileName && (
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-3 border-dashed rounded-2xl p-10 text-center transition-all duration-200 relative flex flex-col items-center justify-center ${
                    isDragging 
                      ? 'border-brand-cyan bg-teal-50/40 scale-[0.99] shadow-inner' 
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50'
                  }`}
                >
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={loading}
                  />
                  <div className="w-14 h-14 rounded-full bg-white shadow-xs border border-slate-100 flex items-center justify-center text-slate-400 mb-4 shrink-0">
                    <Upload size={24} className={isDragging ? 'text-brand-cyan animate-pulse' : 'text-slate-400'} />
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800 mb-1">
                    {lang === 'fr' 
                      ? 'Déposez votre fichier Excel ici ou cliquez pour parcourir' 
                      : 'قم بسحب وإسقاط ملف الإكسل هنا أو اضغط للتصفح'}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
                    {lang === 'fr'
                      ? 'Seuls les fichiers de format standard .xlsx ou .xls sont acceptés. Veillez à utiliser les catégories valides.'
                      : 'تُقبل ملفات الصيغ القياسية .xlsx أو .xls فقط. يرجى التأكد من استخدام فئات صحيحة.'}
                  </p>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      downloadTemplate();
                    }}
                    className="flex items-center gap-2 text-xs text-teal-600 hover:text-teal-700 font-bold transition-colors border border-teal-200 bg-teal-50/50 px-4 py-2 rounded-xl z-20"
                  >
                    <Download size={14} />
                    {getTranslation(lang, 'productImportTemplate')}
                  </button>
                </div>
              )}

              {/* CURRENT FILE LOADED DISPLAY */}
              {fileName && (
                <div className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between border border-slate-150">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center text-lg">
                      📊
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 max-w-[250px] md:max-w-md truncate">
                        {fileName}
                      </p>
                      <p className="text-xs text-slate-400 font-medium">
                        {lang === 'fr' 
                          ? `${totalRowsAnalysed} lignes trouvées pour l'analyse` 
                          : `تم العثور على ${totalRowsAnalysed} أسطر للتحليل`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearCurrentFile}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-rose-50 rounded-xl transition-all"
                    title={lang === 'fr' ? 'Changer de fichier' : 'تغيير الملف'}
                    disabled={loading}
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              )}

              {/* LOADING STATE */}
              {loading && (
                <div className="flex flex-col items-center justify-center py-10 space-y-3">
                  <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-teal-500"></div>
                  <p className="text-xs text-slate-500 font-semibold animate-pulse">
                    {lang === 'fr' ? 'Analyse et validation du fichier en cours...' : 'جاري تحليل وتدقيق الملف...'}
                  </p>
                </div>
              )}

              {/* ANALYSED SUMMARY REPORT VIEW */}
              {!loading && fileName && (parsedData.length > 0 || errors.length > 0 || duplicates.length > 0) && (
                <div className="space-y-6">
                  
                  {/* Bento Grid High Level Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center space-y-1">
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                        {lang === 'fr' ? 'Lignes Totales' : 'مجموع الأسطر'}
                      </p>
                      <p className="text-2xl font-black text-slate-800">{totalRowsAnalysed}</p>
                    </div>
                    
                    <div className="bg-emerald-50/40 border border-emerald-100 p-4 rounded-2xl text-center space-y-1">
                      <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">
                        {lang === 'fr' ? 'Valides' : 'صالح للاستيراد'}
                      </p>
                      <p className="text-2xl font-black text-emerald-600">{parsedData.length}</p>
                    </div>

                    <div className="bg-amber-50/40 border border-amber-100 p-4 rounded-2xl text-center space-y-1">
                      <p className="text-xs text-amber-600 font-bold uppercase tracking-wider">
                        {lang === 'fr' ? 'Doublons' : 'مكررات'}
                      </p>
                      <p className="text-2xl font-black text-amber-600">{duplicates.length}</p>
                    </div>

                    <div className="bg-rose-50/40 border border-rose-100 p-4 rounded-2xl text-center space-y-1">
                      <p className="text-xs text-rose-600 font-bold uppercase tracking-wider">
                        {lang === 'fr' ? 'Erreurs' : 'أخطاء التنسيق'}
                      </p>
                      <p className="text-2xl font-black text-rose-600">{errors.length}</p>
                    </div>
                  </div>

                  {/* Tab Selector */}
                  <div className="flex border-b border-slate-100">
                    <button
                      onClick={() => setActiveTab('valid')}
                      className={`flex-1 md:flex-initial flex items-center justify-center gap-2 pb-3 px-5 text-xs font-bold border-b-2 transition-all ${
                        activeTab === 'valid'
                          ? 'border-brand-cyan text-brand-cyan font-black'
                          : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <span>{lang === 'fr' ? 'Produits Importables' : 'المنتجات القابلة للاستيراد'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'valid' ? 'bg-teal-50 text-teal-600' : 'bg-slate-100 text-slate-500'}`}>
                        {parsedData.length}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveTab('duplicates')}
                      className={`flex-1 md:flex-initial flex items-center justify-center gap-2 pb-3 px-5 text-xs font-bold border-b-2 transition-all ${
                        activeTab === 'duplicates'
                          ? 'border-amber-500 text-amber-500 font-black'
                          : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <span>{lang === 'fr' ? 'Doublons Filtrés' : 'التكرارات المصفاة'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'duplicates' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                        {duplicates.length}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveTab('errors')}
                      className={`flex-1 md:flex-initial flex items-center justify-center gap-2 pb-3 px-5 text-xs font-bold border-b-2 transition-all ${
                        activeTab === 'errors'
                          ? 'border-rose-500 text-rose-500 font-black'
                          : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <span>{lang === 'fr' ? 'Erreurs de Données' : 'أخطاء البيانات'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'errors' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                        {errors.length}
                      </span>
                    </button>
                  </div>

                  {/* TAB CONTENTS */}
                  <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-4 max-h-[350px] overflow-y-auto">
                    
                    {/* Tab 1: Valid Products List Preview */}
                    {activeTab === 'valid' && (
                      <div className="space-y-3">
                        {parsedData.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 text-xs">
                            {lang === 'fr' 
                              ? 'Aucun produit valide à importer dans ce fichier.' 
                              : 'لا توجد منتجات صالحة للاستيراد في هذا الملف.'}
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left md:rtl:text-right border-collapse text-xs">
                              <thead>
                                <tr className="text-slate-400 border-b border-slate-150 uppercase font-bold">
                                  <th className="pb-2">{lang === 'fr' ? 'Nom' : 'الاسم'}</th>
                                  <th className="pb-2">{lang === 'fr' ? 'Catégorie' : 'الفئة'}</th>
                                  <th className="pb-2">{lang === 'fr' ? 'Prix' : 'السعر'}</th>
                                  <th className="pb-2">{lang === 'fr' ? 'Stock initial' : 'المخزون'}</th>
                                  <th className="pb-2">{lang === 'fr' ? 'Remise' : 'التخفيض'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                                {parsedData.map((prod, index) => (
                                  <tr key={index} className="hover:bg-slate-100/30">
                                    <td className="py-2.5 font-bold text-slate-800">{prod.name}</td>
                                    <td className="py-2.5 text-slate-500">{prod.category}</td>
                                    <td className="py-2.5 text-slate-900 font-bold">{prod.price ? formatPrice(prod.price) : '-'}</td>
                                    <td className="py-2.5 text-emerald-600 font-extrabold">{prod.stock}</td>
                                    <td className="py-2.5 font-semibold text-rose-500">
                                      {prod.discountPercent && prod.discountPercent > 0 ? `-${prod.discountPercent}%` : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 2: Duplicates Detailed Detection */}
                    {activeTab === 'duplicates' && (
                      <div className="space-y-4">
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2 text-amber-800 text-xs leading-relaxed">
                          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                          <div>
                            <p className="font-extrabold">
                              {lang === 'fr' ? 'Traitement Automatique des Doublons' : 'المعالجة التلقائية للتكرارات'}
                            </p>
                            <p className="mt-0.5 text-amber-700">
                              {lang === 'fr' 
                                ? 'Pour préserver votre catalogue de toute corruption, ces produits ont été isolés et seront automatiquement ÉCHAPPÉS de l\'importation. Seuls les produits uniques et non enregistrés seront créés.'
                                : 'لحماية دليل المنتجات من التداخل، تم عزل هذه السجلات وسيتم استبعادها تلقائياً من عملية الاستيراد. سيتم تسجيل المنتجات الجديدة والفريدة فقط.'}
                            </p>
                          </div>
                        </div>

                        {duplicates.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 text-xs flex flex-col items-center justify-center gap-1">
                            <CheckCircle size={20} className="text-emerald-500" />
                            <span>{lang === 'fr' ? 'Aucun doublon détecté.' : 'لم يتم الكشف عن تكرارات في الملف.'}</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {duplicates.map((dup, index) => (
                              <div key={index} className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-150 text-xs">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-800">{dup.name}</span>
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-md">
                                      {lang === 'fr' ? `Ligne ${dup.rowNum}` : `السطر ${dup.rowNum}`}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-semibold">
                                    {dup.category} • {formatPrice(dup.price)}
                                  </div>
                                </div>
                                <div>
                                  {dup.type === 'database' ? (
                                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-amber-100">
                                      <Database size={10} />
                                      {lang === 'fr' ? 'Déjà dans le catalogue' : 'مسجل مسبقاً بالدليل'}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-teal-100">
                                      <ListFilter size={10} />
                                      {lang === 'fr' ? 'Doublon interne Excel' : 'مكرر داخلي بالإكسل'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 3: Detailed Formatting Errors */}
                    {activeTab === 'errors' && (
                      <div className="space-y-3">
                        {errors.length === 0 ? (
                          <div className="text-center py-8 text-slate-400 text-xs flex flex-col items-center justify-center gap-1">
                            <CheckCircle size={20} className="text-emerald-500" />
                            <span>{lang === 'fr' ? 'Aucune erreur de validation.' : 'لا توجد أخطاء بيانات في الملف.'}</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {errors.map((err, index) => (
                              <div key={index} className="p-3 rounded-xl bg-white border border-rose-100 text-xs flex gap-2.5 items-start">
                                <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                  <p className="font-bold text-rose-700">
                                    {lang === 'fr' ? `Ligne ${err.rowNum}` : `السطر ${err.rowNum}`}
                                  </p>
                                  <ul className="list-disc list-inside space-y-0.5 text-slate-500 font-medium">
                                    {err.errors.map((subErr, subIndex) => (
                                      <li key={subIndex}>{subErr}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-500 hover:text-slate-800 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all shrink-0"
            disabled={loading}
          >
            {lang === 'fr' ? 'Fermer' : 'إغلاق'}
          </button>

          {!importedSuccessfully && fileName && parsedData.length > 0 && !loading && (
            <button
              onClick={importToDatabase}
              className="bg-brand-cyan hover:bg-brand-cyan/95 text-white font-extrabold text-xs py-2 px-5 rounded-xl transition-all flex items-center gap-2 shadow-md shrink-0"
            >
              <CheckCircle size={15} />
              <span>
                {lang === 'fr' 
                  ? `Enregistrer les ${parsedData.length} produits valides` 
                  : `حفظ الـ ${parsedData.length} منتجات الصالحة`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
