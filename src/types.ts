/**
 * JUST SMILE B2B Dental E-commerce Types
 */

export type UserRole = 'admin' | 'manager' | 'cashier' | 'accountant' | 'doctor';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  uid: string;
  name: string;
  phone: string;
  email: string;
  clinicName: string;
  location: string; // Legacy free-text or derived "Wilaya, Commune"
  // ── Structured location fields (set during registration) ──────────────────
  wilayaCode?: string;      // e.g. "17"
  wilayaName?: string;      // e.g. "الجلفة"
  communeName?: string;     // e.g. "الجلفة" (commune)
  communeNameAscii?: string; // e.g. "Djelfa"
  // ─────────────────────────────────────────────────────────────────────────
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  discountPercent?: number; // per-doctor custom discount (applied to invoice level)
  commercialName?: string; // assigned sales representative
  allowCreditPayment?: boolean; // if true, doctor can pay by credit (20 days debt). if false, only cash payment allowed
  password?: string; // for staff accounts login
  lastLoginAt?: string; // track last login time
}

export interface Product {
  id: string;
  name: string;
  price: number; // in DZD
  stock: number;
  description: string;
  category: 'Équipements' | 'Consommables' | 'Instruments' | 'Orthodontie' | 'Hygiène & Stérilisation' | 'Prothèse dentaire';
  technicalSheet?: string; // Specifications
  image?: string; // Placeholder or generated SVG data-url
  expiryDate?: string; // Expiration alert if applicable (YYYY-MM-DD)
  lowStockAlert?: number; // Alert threshold (default 5)
  discountPercent?: number; // per-product custom discount
  barcode?: string; // EAN / barcode for scanner
  isDeleted?: boolean; // Soft delete flag
  salesCount?: number; // Total units sold
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface CartItem {
  product: Product;
  quantity: number;
}

export type DeliveryType = 'free' | 'to_office' | 'to_clinic';

export interface Order {
  id: string;
  userId: string;
  doctorName: string;
  doctorClinic: string;
  doctorPhone: string;
  commercialName?: string; // assigned sales representative for this order
  items: {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    category: string;
    discountPercent?: number;
  }[];
  totalBeforeDiscount: number;
  discountAmount: number; // Total combined discounts
  totalAfterDiscount: number; // This creates the debt
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  remainingBalance: number;
  createdAt: string;
  deadlineDate: string; // createdAt + 20 days
  paymentMethod?: 'credit' | 'cash'; // 'credit' = 20-day debt, 'cash' = cash on delivery immediate
  notes?: string;
  processedBy?: string; // uid of staff member who processed this order
  processedByName?: string; // name of staff member who processed this order
  // ── Cancellation ───────────────────────────────────────────────────────────
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledByName?: string;
  // ── Delivery ─────────────────────────────────────────────────────────────
  deliveryType?: DeliveryType;   // 'free' | 'to_office' | 'to_clinic'
  deliveryCost?: number;          // 0 for free, otherwise in DZD
  doctorWilayaCode?: string;      // wilaya code at order time
  doctorWilayaName?: string;      // wilaya name at order time
  doctorCommuneName?: string;     // commune at order time
  // Yalidine Integration Fields
  yalidineTrackingNumber?: string;
  yalidineStatus?: string;
  yalidineLabelUrl?: string;
}

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  paymentDate: string;
  notes?: string;
}

export interface ProductReturn {
  id: string;
  userId: string;
  doctorName: string;
  orderId?: string;
  items?: {
    productId: string;
    name: string;
    quantity: number;
    amount: number;
  }[];
  totalAmount: number;
  reason?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  titleFr: string;
  titleAr: string;
  messageFr: string;
  messageAr: string;
  type: 'payment_reminder' | 'order_update' | 'system';
  isRead: boolean;
  createdAt: string;
}

export interface AdminMessage {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorClinic: string;
  doctorPhone: string;
  doctorEmail: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  repliedAt?: string;
  reply?: string;
}

// Shop / Company Information (stored in Firestore settings/shop_info)
export interface ShopInfo {
  companyName: string;
  activity: string;
  phone: string;
  email: string;
  address: string;
  nrc: string;    // Registre du Commerce
  nif: string;    // Identifiant Fiscal
  nis: string;    // Numéro d'Identification Statistique
  tvaRate: number; // TVA rate in percent, e.g., 19
  logoUrl?: string; // Optional custom logo URL or base64 image
}

export type PromotionType = 'percentage' | 'buy_x_get_y';

export interface Promotion {
  id: string;
  name: string;
  type: PromotionType;
  discountPercent?: number;
  buyQuantity?: number;
  freeQuantity?: number;
  productIds?: string[];
  category?: Product['category'];
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  imageUrl?: string;
}

export type ExpenseCategory = 'rent' | 'electricity' | 'salaries' | 'supplies' | 'other';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  createdAt: string;
}

export interface BackupMeta {
  lastBackupAt?: string;
  collectionCounts?: Record<string, number>;
}

// ── Announcements (Ads) ────────────────────────────────────────────────────────
export interface Announcement {
  id: string;
  titleFr: string;
  titleAr: string;
  descriptionFr?: string;
  descriptionAr?: string;
  imageUrl?: string;      // URL to image (base64 or https)
  linkUrl?: string;       // Optional CTA link
  isActive: boolean;
  createdBy: string;      // UID of creator
  createdByName: string;
  createdAt: string;
  expiresAt?: string;     // Optional expiry date ISO string
  order?: number;         // Display order (lower = first)
}
