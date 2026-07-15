import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { 
  collection, onSnapshot, query, where, doc, getDoc, setDoc, 
  writeBatch, addDoc, updateDoc, deleteDoc 
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  UserProfile, Product, CartItem, Order, AppNotification, ShopInfo, Payment, ProductReturn,
  Promotion, Expense, ActivityLog, AdminMessage
} from './types';
import { canAccessAdmin } from './utils/permissions';
import { Language, getTranslation } from './translations';

// Sub components
import Header from './components/Header';
import Footer from './components/Footer';
import BrowseView from './components/BrowseView';
import CartView from './components/CartView';
import AuthView from './components/AuthView';
import DoctorDashboard from './components/DoctorDashboard';
import AdminDashboard from './components/AdminDashboard';
import ProductDetailModal from './components/ProductDetailModal';
import InvoicePrintView from './components/InvoicePrintView';
import BarcodeScanner from './components/BarcodeScanner';
import BarcodePrintView from './components/BarcodePrintView';
import ProductCard from './components/ProductCard';
import { AppDialogProvider, showAlert, showToast } from './context/AppDialogContext';

// Icons
import { Heart, Bell, Trash2, Eye, ShieldAlert, Sparkles, UserCheck, Stethoscope } from 'lucide-react';

export default function App() {
  const [lang, setLang] = useState<Language>('fr');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('justsmile_theme') as 'light' | 'dark') || 'light';
  });
  const [activeTab, setActiveTab] = useState<'browse' | 'cart' | 'dashboard' | 'admin' | 'auth' | 'favorites' | 'notifications'>('browse');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
    localStorage.setItem('justsmile_theme', theme);
  }, [theme]);
  
  // Real-time synced collections
  const [products, setProducts] = useState<Product[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]); // Array of favorited product IDs
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]); // Array of viewed product IDs
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Admin sync lists
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [ordersList, setOrdersList] = useState<Order[]>([]);
  const [paymentsList, setPaymentsList] = useState<Payment[]>([]);
  const [returnsList, setReturnsList] = useState<ProductReturn[]>([]);
  const [promotionsList, setPromotionsList] = useState<Promotion[]>([]);
  const [expensesList, setExpensesList] = useState<Expense[]>([]);
  const [activityLogsList, setActivityLogsList] = useState<ActivityLog[]>([]);
  const [adminMessagesList, setAdminMessagesList] = useState<AdminMessage[]>([]);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showBarcodePrint, setShowBarcodePrint] = useState(false);
  const [productToPrint, setProductToPrint] = useState<Product | null>(null);

  // Shop Info (persisted in Firestore settings/shop_info)
  const defaultShopInfo: ShopInfo = {
    companyName: 'JUST SMILE',
    activity: 'Vente de consommables et matériel dentaire',
    phone: '0770821021 / 0780212989',
    email: 'justsmile0169@gmail.com',
    address: 'Algeria, Djelfa',
    nrc: '16/00-098544B',
    nif: '001916019028835',
    nis: '00195614098835',
    tvaRate: 19,
    logoUrl: '/logo.png'
  };
  const [shopInfo, setShopInfo] = useState<ShopInfo>(defaultShopInfo);

  // Local state UI modifiers
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<Product | null>(null);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const isRtl = lang === 'ar';

  // --- 1. Load cart and recently viewed from localStorage ---
  useEffect(() => {
    const savedCart = localStorage.getItem('just_smile_cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error(e);
      }
    }

    const savedRecent = localStorage.getItem('just_smile_recent_viewed');
    if (savedRecent) {
      try {
        setRecentlyViewed(JSON.parse(savedRecent));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Save cart changes
  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    localStorage.setItem('just_smile_cart', JSON.stringify(newCart));
  };

  // --- 2. Initialize Firebase authentication state listener ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoadingUser(true);
      if (firebaseUser) {
        // Sync user profile
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;

          // Block pending/rejected doctors — sign them out immediately
          // so they stay on the auth page and see the pending message.
          if (profile.role === 'doctor' && (profile.status === 'pending' || profile.status === 'rejected')) {
            if (profile.status === 'pending') {
              sessionStorage.setItem('pending_doctor_login', 'true');
            } else {
              sessionStorage.setItem('rejected_doctor_login', 'true');
            }
            await signOut(auth);
            setCurrentUser(null);
            setActiveTab('auth');
            setLoadingUser(false);
            return;
          }

          setCurrentUser(profile);
          
          // Route accordingly
          if (profile.role === 'admin' || profile.role === 'manager' || profile.role === 'cashier' || profile.role === 'accountant') {
            setActiveTab('admin');
          } else {
            setActiveTab('browse');
          }
        } else {
          // Fallback if profile didn't get saved
          setCurrentUser(null);
          await signOut(auth);
        }
      } else {
        setCurrentUser(null);
      }
      setLoadingUser(false);
    });

    return () => unsubscribe();
  }, []);

  // --- 3. Load Shop Settings from Firestore ---
  useEffect(() => {
    const loadShopInfo = async () => {
      try {
        const settingsRef = doc(db, 'settings', 'shop_info');
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          setShopInfo(snap.data() as ShopInfo);
        } else {
          // Seed default shop info
          await setDoc(settingsRef, defaultShopInfo);
          console.log('Seeded default shop info into Firestore settings/shop_info');
        }
      } catch (err) {
        console.error('Error loading shop info:', err);
      }
    };
    loadShopInfo();
  }, []);

  // --- 4. Synchronize Products Collection (Real-Time) ---
  useEffect(() => {
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: Product[] = [];
      snapshot.forEach((docSnap) => {
        const product = { ...(docSnap.data() as Product), id: docSnap.id };
        // Filter out deleted products
        if (!product.isDeleted) {
          items.push(product);
        }
      });
      setProducts(items);
    }, (err) => {
      console.error("Error syncing products catalog:", err);
    });

    return () => unsubscribe();
  }, []);

  // Helper: Seed Default Products (only callable by admin/manager)
  const seedDefaultProducts = async () => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
      console.error('Only admin or manager can seed products');
      return;
    }

    const defaultData: Omit<Product, 'id'>[] = [
      {
        name: 'Autoclave Médical de Classe B 23L - ProSmile',
        price: 285000,
        stock: 3,
        description: 'Stérilisateur autoclave dentaire de classe B à vide fractionné de 23 litres. Cycle rapide, écran tactile LCD, imprimante intégrée et traçabilité USB USB.',
        category: 'Équipements',
        technicalSheet: 'Volume: 23 Litres; Classe: B standard; Puissance: 2200W; Poids: 52 kg',
        expiryDate: undefined,
        lowStockAlert: 2,
        discountPercent: 0,
        image: 'https://images.unsplash.com/photo-1512223792601-592a9809eed4?auto=format&fit=crop&q=80&w=300'
      },
      {
        name: 'Composite Universel Seringues Kit (8x4g) - Esprit Dentaire',
        price: 16500,
        stock: 45,
        description: 'Kit de restauration composite photopolymérisable micro-hybride. Contient 8 seringues de teintes assorties (A1, A2, A3, B2...), adhésif de 5ml, gel de mordançage et applicateurs.',
        category: 'Consommables',
        technicalSheet: 'Teintes: A1, A2, A3, A3.5, B2; Polymérisation: 20 sec; Résistance: 120 MPa',
        expiryDate: '2028-06-30',
        lowStockAlert: 10,
        discountPercent: 10, // Per-product custom discount 10%
        image: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300'
      },
      {
        name: 'Désinfectant de Surfaces Ultra 5 Litres - HygiSmile',
        price: 4300,
        stock: 4, // Seed low stock alert!
        description: 'Solution détergente et désinfectante hautement efficace pour toutes les surfaces de cabinets dentaires et dispositifs médicaux non-immergeables. Sans aldéhyde.',
        category: 'Hygiène & Stérilisation',
        technicalSheet: 'Volume: 5 Litres; Temps de contact: 5 min; Spectre: Bactéricide, Fongicide, Virucide',
        expiryDate: '2027-10-31',
        lowStockAlert: 5,
        discountPercent: 0,
        image: 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&q=80&w=300'
      },
      {
        name: 'Pince à Extraire Universelle n°150 - Premium Instruments',
        price: 6800,
        stock: 15,
        description: 'Pince davier à extraire n°150 universelle pour prémolaires et incisives supérieures. En acier inoxydable chirurgical allemand à double articulation.',
        category: 'Instruments',
        technicalSheet: 'Matériau: Acier Inox Chirurgical; Pays: Allemagne; Autoclavable: Oui 134°C',
        expiryDate: undefined,
        lowStockAlert: 3,
        discountPercent: 5,
        image: 'https://images.unsplash.com/photo-1579684389782-64d84b5e9053?auto=format&fit=crop&q=80&w=300'
      },
      {
        name: 'Brackets Céramiques Roth .022 Kit (20pcs) - OrthoPlus',
        price: 18000,
        stock: 12,
        description: 'Attaches esthétiques orthodontiques transparentes en saphir synthétique polycristallin. Excellente rétention mécanique et translucidité optimale.',
        category: 'Orthodontie',
        technicalSheet: 'Système: Roth; Gorge: .022; Contenu: Kit de 20 brackets (3-3 haut/bas)',
        expiryDate: undefined,
        lowStockAlert: 5,
        discountPercent: 0,
        image: 'https://images.unsplash.com/photo-1513412583491-0d3994c50f7f?auto=format&fit=crop&q=80&w=300'
      },
      {
        name: 'Alginate de Prise Rapide Aromatisé Menthe 500g - ProDent',
        price: 1950,
        stock: 35,
        description: 'Poudre d\'alginate sans poussière à prise rapide pour empreintes dentaires précises. Arôme agréable de menthe verte et changement de couleur chromatologique.',
        category: 'Consommables',
        technicalSheet: 'Poids: 500g; Temps de prise: 2min 10s; Couleur finale: Vert d\'eau',
        expiryDate: '2026-08-30', // Expiring soon warning!
        lowStockAlert: 15,
        discountPercent: 0,
        image: 'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&q=80&w=300'
      }
    ];

    try {
      const batch = writeBatch(db);
      defaultData.forEach((item) => {
        const docRef = doc(collection(db, 'products'));
        const cleanedItem = Object.fromEntries(
          Object.entries(item).filter(([_, v]) => v !== undefined)
        );
        batch.set(docRef, {
          ...cleanedItem,
          id: docRef.id
        });
      });
      await batch.commit();
      localStorage.setItem('justsmile_catalog_seeded', '1');
      console.log('Successfully seeded 6 dental products into Firestore catalog!');
      showToast(lang === 'fr' ? 'Produits par défaut ajoutés avec succès!' : 'تمت إضافة المنتجات الافتراضية بنجاح!', 'success');
    } catch (err) {
      console.error('Error seeding default products:', err);
      showAlert(lang === 'fr' ? 'Erreur lors de l\'ajout des produits par défaut.' : 'خطأ في إضافة المنتجات الافتراضية.', 'error');
    }
  };

  // --- 4. User-Specific Dynamic Subscriptions ---
  useEffect(() => {
    if (!currentUser) {
      setUserOrders([]);
      setNotifications([]);
      setFavorites([]);
      return;
    }

    let unsubscribeOrders = () => {};
    let unsubscribeNotifications = () => {};
    let unsubscribeFavorites = () => {};

    if (currentUser.role === 'doctor') {
      // Sync doctor orders
      const ordersQuery = query(collection(db, 'orders'), where('userId', '==', currentUser.uid));
      unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
        const items: Order[] = [];
        snapshot.forEach((doc) => {
          items.push(doc.data() as Order);
        });
        setUserOrders(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }, (err) => {
        console.error("Error syncing doctor orders:", err);
      });

      // Sync doctor notifications
      const notifsQuery = query(collection(db, 'notifications'), where('userId', '==', currentUser.uid));
      unsubscribeNotifications = onSnapshot(notifsQuery, (snapshot) => {
        const items: AppNotification[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as AppNotification);
        });
        setNotifications(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }, (err) => {
        console.error("Error syncing doctor notifications:", err);
      });

      // Sync doctor favorites list
      const favsQuery = query(collection(db, 'favorites'), where('userId', '==', currentUser.uid));
      unsubscribeFavorites = onSnapshot(favsQuery, (snapshot) => {
        const items: string[] = [];
        snapshot.forEach((doc) => {
          items.push(doc.data().productId);
        });
        setFavorites(items);
      }, (err) => {
        console.error("Error syncing doctor favorites:", err);
      });
    } else if (currentUser.role !== 'doctor') {
      // Staff: admin, manager, cashier, accountant
      const usersQuery = collection(db, 'users');
      const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const items: UserProfile[] = [];
        snapshot.forEach((doc) => {
          items.push(doc.data() as UserProfile);
        });
        setUsersList(items);
      }, (err) => {
        console.error("Error syncing users list for admin:", err);
      });

      // Sync admin all orders list
      const allOrdersQuery = collection(db, 'orders');
      unsubscribeOrders = onSnapshot(allOrdersQuery, (snapshot) => {
        const items: Order[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ ...(docSnap.data() as Order), id: docSnap.id });
        });
        setOrdersList(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }, (err) => {
        console.error("Error syncing all orders for admin:", err);
      });

      const paymentsQuery = collection(db, 'payments');
      const unsubscribePayments = onSnapshot(paymentsQuery, (snapshot) => {
        const items: Payment[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as Omit<Payment, 'id'>) });
        });
        setPaymentsList(items.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)));
      }, (err) => {
        console.error("Error syncing payments for admin:", err);
      });

      const returnsQuery = collection(db, 'returns');
      const unsubscribeReturns = onSnapshot(returnsQuery, (snapshot) => {
        const items: ProductReturn[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as Omit<ProductReturn, 'id'>) });
        });
        setReturnsList(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      });

      const promotionsQuery = collection(db, 'promotions');
      const unsubscribePromotions = onSnapshot(promotionsQuery, (snapshot) => {
        const items: Promotion[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as Omit<Promotion, 'id'>) });
        });
        setPromotionsList(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      });

      const expensesQuery = collection(db, 'expenses');
      const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
        const items: Expense[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as Omit<Expense, 'id'>) });
        });
        setExpensesList(items.sort((a, b) => b.date.localeCompare(a.date)));
      });

      const logsQuery = collection(db, 'activity_logs');
      const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
        const items: ActivityLog[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as Omit<ActivityLog, 'id'>) });
        });
        setActivityLogsList(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200));
      });

      // Sync admin messages (only for admin role)
      let unsubscribeMessages = () => {};
      if (currentUser.role === 'admin') {
        const messagesQuery = collection(db, 'admin_messages');
        unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
          const items: AdminMessage[] = [];
          snapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...(docSnap.data() as Omit<AdminMessage, 'id'>) });
          });
          setAdminMessagesList(items.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          }));
        });
      }

      // Sync admin notifications
      const notifsQuery = query(collection(db, 'notifications'), where('userId', '==', 'admin'));
      unsubscribeNotifications = onSnapshot(notifsQuery, (snapshot) => {
        const items: AppNotification[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as AppNotification);
        });
        setNotifications(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }, (err) => {
        console.error("Error syncing admin notifications:", err);
      });

      return () => {
        unsubscribeUsers();
        unsubscribeOrders();
        unsubscribePayments();
        unsubscribeReturns();
        unsubscribePromotions();
        unsubscribeExpenses();
        unsubscribeLogs();
        unsubscribeMessages();
        unsubscribeNotifications();
      };
    }

    return () => {
      unsubscribeOrders();
      unsubscribeNotifications();
      unsubscribeFavorites();
    };
  }, [currentUser]);

  // --- 5. Cart Handlers ---
  const handleAddToCart = (product: Product) => {
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) {
        showAlert(lang === 'fr' ? 'Stock insuffisant.' : 'الكمية المطلوبة تتجاوز المخزون المتوفر.', 'error');
        return;
      }
      const updated = cart.map((item) =>
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      );
      saveCart(updated);
    } else {
      saveCart([...cart, { product, quantity: 1 }]);
    }

    showToast(getTranslation(lang, 'cartAdded') + ` : ${product.name}`, 'success');
  };

  const handleUpdateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      handleRemoveItem(productId);
      return;
    }
    const updated = cart.map((item) =>
      item.product.id === productId ? { ...item, quantity: qty } : item
    );
    saveCart(updated);
  };

  const handleRemoveItem = (productId: string) => {
    const updated = cart.filter((item) => item.product.id !== productId);
    saveCart(updated);
  };

  const handleClearCart = () => {
    saveCart([]);
  };

  // --- 6. Favorites Toggle Handlers ---
  const handleToggleFavorite = async (product: Product) => {
    if (!currentUser) return;
    const favDocId = `${currentUser.uid}_${product.id}`;
    
    try {
      if (favorites.includes(product.id)) {
        await deleteDoc(doc(db, 'favorites', favDocId));
      } else {
        await setDoc(doc(db, 'favorites', favDocId), {
          id: favDocId,
          userId: currentUser.uid,
          productId: product.id
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- 7. Recently Viewed Tracker ---
  const handleViewProductDetails = (product: Product) => {
    setSelectedDetailProduct(product);

    // Save/append to recently viewed array
    let updated = [product.id, ...recentlyViewed.filter((id) => id !== product.id)].slice(0, 8);
    setRecentlyViewed(updated);
    localStorage.setItem('just_smile_recent_viewed', JSON.stringify(updated));
  };

  // --- 8. Quick Reorder Handler ---
  const handleQuickReorder = (items: { productId: string; quantity: number }[]) => {
    // Attempt to match and add items to cart
    const newCartItems: CartItem[] = [...cart];
    let addedCount = 0;

    items.forEach((reorderItem) => {
      const match = products.find((p) => p.id === reorderItem.productId);
      if (match && match.stock > 0) {
        const qtyToAdd = Math.min(reorderItem.quantity, match.stock);
        const existingIdx = newCartItems.findIndex((ci) => ci.product.id === match.id);

        if (existingIdx > -1) {
          newCartItems[existingIdx].quantity = Math.min(newCartItems[existingIdx].quantity + qtyToAdd, match.stock);
        } else {
          newCartItems.push({ product: match, quantity: qtyToAdd });
        }
        addedCount++;
      }
    });

    if (addedCount > 0) {
      saveCart(newCartItems);
      showToast(
        lang === 'fr' 
          ? 'Articles de la commande ajoutés à votre panier !' 
          : 'تم إضافة مواد الفاتورة إلى سلتك بنجاح!',
        'success'
      );
      setActiveTab('cart');
    } else {
      showAlert(
        lang === 'fr' 
          ? 'Aucun article disponible pour la re-commande.' 
          : 'عذراً، المواد المطلوبة غير متوفرة حالياً في المخزون.',
        'info'
      );
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    if (!currentUser) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((notif) => {
        if (!notif.isRead) {
          batch.update(doc(db, 'notifications', notif.id), { isRead: true });
        }
      });
      await batch.commit();
    } catch (err) {
      console.error(err);
    }
  };

  // Logout routine
  const handleLogout = async () => {
    try {
      // Try to sign out from Firebase Auth (for doctors)
      await signOut(auth).catch(() => {
        // Ignore error if not signed in (staff users don't have Firebase Auth)
      });
      setCurrentUser(null);
      setActiveTab('browse');
    } catch (err) {
      console.error(err);
    }
  };

  // Barcode scanner handlers
  const handleScannerAddToCart = (product: Product, quantity: number) => {
    for (let i = 0; i < quantity; i++) {
      handleAddToCart(product);
    }
  };

  const handleScannerPrintBarcode = (product: Product) => {
    setProductToPrint(product);
    setShowBarcodePrint(true);
    setShowBarcodeScanner(false);
  };

  const handleScannerCreateProduct = (barcode: string) => {
    // Navigate to admin inventory tab with barcode pre-filled
    setActiveTab('admin');
    // Store barcode in localStorage for the admin form to pick up
    localStorage.setItem('justsmile_new_product_barcode', barcode);
  };

  // --- SANDBOX DEMO ACCOUNTS HELPER (FOR EASY TESTING) ---
  const handleQuickLogin = async (role: 'admin' | 'doctor') => {
    try {
      if (role === 'admin') {
        // Create an Admin user inside firebase profile if not exists, and sign in
        const demoAdminEmail = 'admin@justsmile.com';
        const demoPass = 'admin123';
        
        try {
          await signInWithEmailAndPassword(auth, demoAdminEmail, demoPass);
        } catch (e) {
          // If not exists, create it
          const adminProfile: UserProfile = {
            uid: 'admin_demo_uid',
            name: 'Directeur Général (Admin)',
            phone: '0550 00 11 22',
            email: demoAdminEmail,
            clinicName: 'JUST SMILE Siège',
            location: 'Bab Ezzouar, Alger',
            role: 'admin',
            status: 'approved',
            createdAt: new Date().toISOString()
          };
          // Initialize in firestore first, then ask users to log in or simulate
          showAlert(
            lang === 'fr'
              ? 'Pour vous connecter en Admin:\nEmail: admin@justsmile.com\nMot de passe: admin123\n\n(Veuillez d\'abord le créer en vous inscrivant s\'il n\'existe pas encore.)'
              : 'لتسجيل الدخول كمسؤول:\nالبريد: admin@justsmile.com\nالسر: admin123',
            'info'
          );
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const unreadNotifsCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AppDialogProvider lang={lang}>
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300" dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* Header component */}
      <Header
        lang={lang}
        onLanguageChange={setLang}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
        favoritesCount={favorites.length}
        unreadNotificationsCount={unreadNotifsCount}
        user={currentUser}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        logoUrl={shopInfo.logoUrl}
        companyName={shopInfo.companyName}
      />

      {/* Main Container Content */}
      <main className="flex-1 w-full mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-10 max-w-7xl">
        {loadingUser ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-cyan"></div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
              {lang === 'fr' ? 'Chargement de JUST SMILE...' : 'جاري التحميل...'}
            </p>
          </div>
        ) : (
          <>
            {/* Render appropriate views based on active tab state */}
            {activeTab === 'browse' && (
              <BrowseView
                products={products}
                favorites={favorites}
                lang={lang}
                onAddToCart={handleAddToCart}
                onToggleFavorite={handleToggleFavorite}
                onViewProduct={handleViewProductDetails}
                user={currentUser}
                currentUser={currentUser}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onOpenBarcodeScanner={() => setShowBarcodeScanner(true)}
              />
            )}

            {activeTab === 'cart' && (
              <CartView
                cart={cart}
                user={currentUser}
                currentUser={currentUser}
                userOrders={userOrders}
                lang={lang}
                promotions={promotionsList}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                onClearCart={handleClearCart}
                onCheckoutSuccess={() => setActiveTab('dashboard')}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === 'auth' && (
              <AuthView
                lang={lang}
                onAuthSuccess={(profile) => {
                  setCurrentUser(profile);
                  if (profile.role !== 'doctor') {
                    setActiveTab('admin');
                  } else {
                    setActiveTab('browse');
                  }
                }}
              />
            )}

            {activeTab === 'dashboard' && currentUser && currentUser.role === 'doctor' && (
              <DoctorDashboard
                user={currentUser}
                orders={userOrders}
                allProducts={products}
                favorites={favorites}
                recentlyViewed={recentlyViewed}
                lang={lang}
                onAddToCart={handleAddToCart}
                onToggleFavorite={handleToggleFavorite}
                onViewProduct={handleViewProductDetails}
                onQuickReorder={handleQuickReorder}
                onPrintInvoice={setSelectedInvoiceOrder}
                onSelectCategory={(category) => {
                  setSelectedCategory(category);
                  setActiveTab('browse');
                }}
              />
            )}

            {activeTab === 'admin' && currentUser && canAccessAdmin(currentUser) && (
              <AdminDashboard
                lang={lang}
                currentUser={currentUser}
                usersList={usersList}
                ordersList={ordersList}
                paymentsList={paymentsList}
                returnsList={returnsList}
                promotionsList={promotionsList}
                expensesList={expensesList}
                activityLogsList={activityLogsList}
                productsList={products}
                adminMessagesList={adminMessagesList}
                shopInfo={shopInfo}
                onShopInfoChange={setShopInfo}
                onRefreshData={() => {}}
                onPrintInvoice={setSelectedInvoiceOrder}
              />
            )}

            {/* 5. Favorites List (Fallback tab display) */}
            {activeTab === 'favorites' && currentUser && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
                  <Heart size={24} className="text-red-500" fill="currentColor" />
                  <h2 className="text-2xl font-black text-slate-900">
                    {getTranslation(lang, 'favorites')} ({products.filter((p) => favorites.includes(p.id)).length})
                  </h2>
                </div>

                {products.filter((p) => favorites.includes(p.id)).length === 0 ? (
                  <div className="text-center py-16 bg-white border border-slate-100 rounded-3xl p-8 space-y-4">
                    <Heart className="mx-auto text-slate-300" size={48} />
                    <h3 className="font-bold text-slate-700 text-sm">{lang === 'fr' ? 'Aucun favori enregistré.' : 'لم تقم بحفظ أي منتجات في المفضلة بعد.'}</h3>
                    <button
                      onClick={() => setActiveTab('browse')}
                      className="bg-brand-cyan text-white font-extrabold text-xs md:text-sm px-6 py-2.5 rounded-xl hover:bg-brand-cyan/90 transition-colors"
                    >
                      {getTranslation(lang, 'browse')}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {products
                      .filter((p) => favorites.includes(p.id))
                      .map((p) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          lang={lang}
                          onAddToCart={handleAddToCart}
                          isFavorite={true}
                          onToggleFavorite={handleToggleFavorite}
                          onViewDetails={handleViewProductDetails}
                          user={currentUser}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* 6. Notifications List */}
            {activeTab === 'notifications' && currentUser && (
              <div className="space-y-6 max-w-2xl mx-auto">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <Bell size={24} className="text-brand-cyan" />
                    <h2 className="text-2xl font-black text-slate-900">
                      {getTranslation(lang, 'notifications')}
                    </h2>
                  </div>
                  {unreadNotifsCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs font-bold text-brand-cyan hover:text-brand-dark transition-colors"
                    >
                      {getTranslation(lang, 'markAllRead')}
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div className="text-center py-16 bg-white border border-slate-100 rounded-3xl p-8 space-y-2">
                    <Bell className="mx-auto text-slate-300" size={40} />
                    <h4 className="font-bold text-slate-700 text-sm">{getTranslation(lang, 'noNotifications')}</h4>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notif) => (
                      <div 
                        key={notif.id} 
                        className={`p-5 rounded-2xl border transition-all flex items-start gap-3.5 relative ${
                          notif.isRead 
                            ? 'bg-white border-slate-100' 
                            : 'bg-brand-cyan/5 border-brand-cyan/20 shadow-xs'
                        }`}
                      >
                        {!notif.isRead && (
                          <span className={`absolute top-5 ${isRtl ? 'left-5' : 'right-5'} w-2.5 h-2.5 bg-brand-cyan rounded-full`} />
                        )}
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 shrink-0">
                          <Bell size={16} />
                        </div>
                        <div className="space-y-1 pr-4">
                          <h4 className="font-bold text-slate-900 text-sm">
                            {isRtl ? notif.titleAr : notif.titleFr}
                          </h4>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {isRtl ? notif.messageAr : notif.messageFr}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {new Date(notif.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')} {new Date(notif.createdAt).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'ar-DZ', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <Footer lang={lang} shopInfo={shopInfo} />

      {/* --- OVERLAYS --- */}

      {showBarcodeScanner && (
        <BarcodeScanner
          lang={lang}
          products={products}
          user={currentUser}
          onAddToCart={handleScannerAddToCart}
          onPrintBarcode={handleScannerPrintBarcode}
          onCreateProduct={handleScannerCreateProduct}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}

      {/* Product Detail Modal */}
      {selectedDetailProduct && (
        <ProductDetailModal
          product={selectedDetailProduct}
          lang={lang}
          onClose={() => setSelectedDetailProduct(null)}
          onAddToCart={handleAddToCart}
        />
      )}

      {/* Barcode Print View */}
      {showBarcodePrint && productToPrint && (
        <BarcodePrintView
          product={productToPrint}
          lang={lang}
          onClose={() => {
            setShowBarcodePrint(false);
            setProductToPrint(null);
          }}
        />
      )}

      {/* Invoice Printable PDF View */}
      {selectedInvoiceOrder && (
        <InvoicePrintView
          order={selectedInvoiceOrder}
          doctor={currentUser}
          lang={lang}
          shopInfo={shopInfo}
          onClose={() => setSelectedInvoiceOrder(null)}
        />
      )}

    </div>
    </AppDialogProvider>
  );
}
