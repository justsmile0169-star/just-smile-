import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order } from '../types';
import { getWilayas, getCommunesByWilaya } from './algeriaData';

export interface YalidineConfig {
  enabled: boolean;
  apiKey: string;
  apiToken: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  isSandbox: boolean;
}

const DEFAULT_CONFIG: YalidineConfig = {
  enabled: false,
  apiKey: '',
  apiToken: '',
  senderName: 'JUST SMILE',
  senderPhone: '0770821021',
  senderAddress: 'Djelfa, Algérie',
  isSandbox: true,
};

/** Get Yalidine configuration from Firestore settings */
export async function getYalidineConfig(): Promise<YalidineConfig> {
  try {
    const docRef = doc(db, 'settings', 'yalidine_config');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { ...DEFAULT_CONFIG, ...docSnap.data() } as YalidineConfig;
    }
  } catch (error) {
    console.error('Error fetching Yalidine config:', error);
  }
  return DEFAULT_CONFIG;
}

/** Save Yalidine configuration to Firestore settings */
export async function saveYalidineConfig(config: YalidineConfig): Promise<void> {
  const docRef = doc(db, 'settings', 'yalidine_config');
  await setDoc(docRef, config);
}

/**
 * Creates a parcel in Yalidine Express.
 * Handles simulated sandbox mode or actual API calling.
 */
export async function createYalidineParcel(
  order: Order,
  config: YalidineConfig
): Promise<{ success: boolean; trackingNumber?: string; labelUrl?: string; error?: string }> {
  if (!config.enabled) {
    return { success: false, error: 'Yalidine integration is not enabled in settings.' };
  }

  // 1. Resolve ASCII location names for Yalidine
  let wilayaAscii = 'Djelfa';
  let communeAscii = 'Djelfa';

  try {
    const wilayas = await getWilayas();
    const wilayaObj = wilayas.find((w) => w.code === order.doctorWilayaCode);
    if (wilayaObj) {
      wilayaAscii = wilayaObj.nameAscii;
    }

    const communes = await getCommunesByWilaya(order.doctorWilayaCode || '17');
    const communeObj = communes.find(
      (c) => c.nameAr === order.doctorCommuneName || c.nameAscii.toLowerCase() === order.doctorCommuneName?.toLowerCase()
    );
    if (communeObj) {
      communeAscii = communeObj.nameAscii;
    }
  } catch (err) {
    console.warn('Could not map ASCII names for Yalidine, using defaults:', err);
  }

  // 2. Prepare Yalidine Parcel payload
  // delivery_type: 1 = home/clinic delivery, 2 = desk/office delivery
  const deliveryTypeNum = order.deliveryType === 'to_office' ? 2 : 1;
  
  // stopprice is the Cash On Delivery (COD) amount.
  // If payment method is credit/debt, stopprice is 0 because the customer pays later.
  // If payment method is cash, stopprice is the total order cost.
  const stopPrice = order.paymentMethod === 'cash' ? Math.round(order.totalAfterDiscount) : 0;

  const productList = order.items
    .map((item) => `${item.name} (x${item.quantity})`)
    .join(', ');

  const nameParts = order.doctorName.trim().split(' ');
  const firstName = nameParts[0] || 'Dr.';
  const familyName = nameParts.slice(1).join(' ') || 'Médecin';

  const parcelData = {
    order_id: order.id,
    firstname: firstName,
    familyname: familyName,
    contact_phone: order.doctorPhone,
    to_wilaya_name: wilayaAscii,
    to_commune_name: communeAscii,
    address: order.doctorClinic || 'Cabinet Dentaire',
    delivery_type: deliveryTypeNum,
    stopprice: stopPrice,
    has_exchange: 0,
    product_list: productList.substring(0, 150), // API limit
    declared_value: stopPrice > 0 ? stopPrice : 1000,
    comment: order.notes || 'Dentist dental supplies delivery',
  };

  // 3. Simulated Sandbox Mode
  if (config.isSandbox || !config.apiKey || !config.apiToken) {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Generate simulated tracking number and label
    const randomNum = Math.floor(100000000 + Math.random() * 900000000);
    const simulatedTracking = `JS${randomNum}DZ`;
    const simulatedLabel = `https://api.yalidine.app/v1/parcels/label/${simulatedTracking}`;

    console.log('[Yalidine Sandbox] Created Parcel Payload:', parcelData);

    return {
      success: true,
      trackingNumber: simulatedTracking,
      labelUrl: simulatedLabel,
    };
  }

  // 4. Production API Request (with CORS catch-all fallback)
  try {
    const response = await fetch('https://api.yalidine.app/v1/parcels', {
      method: 'POST',
      headers: {
        'X-API-KEY': config.apiKey,
        'X-API-TOKEN': config.apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([parcelData]),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Yalidine API Error (${response.status}): ${errorText}` };
    }

    const resData = await response.json();
    
    // Yalidine returns details of created parcels
    if (resData && typeof resData === 'object') {
      // Find parcel status or error
      const keys = Object.keys(resData);
      if (keys.length > 0) {
        const firstParcel = resData[keys[0]];
        if (firstParcel.error) {
          return { success: false, error: String(firstParcel.error) };
        }
        if (firstParcel.tracking || firstParcel.tracking_number) {
          const tracking = firstParcel.tracking || firstParcel.tracking_number;
          return {
            success: true,
            trackingNumber: tracking,
            labelUrl: `https://api.yalidine.app/v1/parcels/label/${tracking}`,
          };
        }
      }
    }

    return { success: false, error: 'Invalid response structure from Yalidine API.' };
  } catch (error: any) {
    console.error('Yalidine API request failed:', error);
    
    // Check if it looks like a CORS error (TypeError: Failed to fetch)
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      return {
        success: false,
        error: 'CORS policy blocked direct browser request to Yalidine. In production, use a proxy server or Firebase serverless functions to call the Yalidine API. Note: Simulation/Sandbox mode can be enabled to bypass this.',
      };
    }

    return { success: false, error: error.message || 'Unknown network error.' };
  }
}
