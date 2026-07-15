/**
 * Algeria Wilayas & Communes Data Utility
 * Loaded from: algeria-cities-master/json/algeria_cities.json
 *
 * Delivery logic:
 *  - Commune "Djelfa" (wilaya_code "17") → FREE delivery
 *  - All other communes → delivery fee applies, with two options:
 *      a) Delivery to the shipping office (bureau de livraison)
 *      b) Home delivery to the doctor's clinic
 */

// ── Raw entry shape from the JSON ──────────────────────────────────────────────
interface RawCity {
  id: number;
  commune_name_ascii: string;
  commune_name: string;
  daira_name_ascii: string;
  daira_name: string;
  wilaya_code: string;
  wilaya_name_ascii: string;
  wilaya_name: string;
}

// ── Public interfaces ──────────────────────────────────────────────────────────
export interface WilayaOption {
  code: string;      // "01" … "58"
  nameAscii: string; // "Adrar"
  nameAr: string;    // "أدرار"
}

export interface CommuneOption {
  id: number;
  nameAscii: string;
  nameAr: string;
  wilayaCode: string;
}

// ── Delivery configuration ─────────────────────────────────────────────────────
export const DJELFA_WILAYA_CODE = '17';
export const DJELFA_COMMUNE_ASCII = 'Djelfa'; // exact match (case-insensitive)

/**
 * Delivery pricing from "list prix livraison.xlsx"
 * Columns: Wilaya | سعر التوصيل الى العيادة (toClinic) | سعر التوصيل الى مكتب التوصيل (toOffice)
 * Indexed by wilaya code (01–58)
 */
export const DELIVERY_PRICING: Record<string, { toOffice: number; toClinic: number }> = {
  '01': { toOffice: 1000, toClinic: 1400 }, // Adrar
  '02': { toOffice: 450,  toClinic: 800  }, // Chlef
  '03': { toOffice: 450,  toClinic: 750  }, // Laghouat
  '04': { toOffice: 450,  toClinic: 850  }, // Oum El Bouaghi
  '05': { toOffice: 450,  toClinic: 850  }, // Batna
  '06': { toOffice: 450,  toClinic: 850  }, // Béjaïa
  '07': { toOffice: 450,  toClinic: 850  }, // Biskra
  '08': { toOffice: 700,  toClinic: 1200 }, // Béchar
  '09': { toOffice: 450,  toClinic: 800  }, // Blida
  '10': { toOffice: 450,  toClinic: 850  }, // Bouira
  '11': { toOffice: 900,  toClinic: 1800 }, // Tamanrasset
  '12': { toOffice: 450,  toClinic: 850  }, // Tébessa
  '13': { toOffice: 450,  toClinic: 850  }, // Tlemcen
  '14': { toOffice: 450,  toClinic: 800  }, // Tiaret
  '15': { toOffice: 450,  toClinic: 850  }, // Tizi Ouzou
  '16': { toOffice: 450,  toClinic: 700  }, // Alger
  '17': { toOffice: 250,  toClinic: 400  }, // Djelfa (free for commune Djelfa, but priced for others)
  '18': { toOffice: 450,  toClinic: 850  }, // Jijel
  '19': { toOffice: 450,  toClinic: 850  }, // Sétif
  '20': { toOffice: 450,  toClinic: 850  }, // Saïda
  '21': { toOffice: 450,  toClinic: 850  }, // Skikda
  '22': { toOffice: 450,  toClinic: 800  }, // Sidi Bel Abbès
  '23': { toOffice: 450,  toClinic: 850  }, // Annaba
  '24': { toOffice: 450,  toClinic: 850  }, // Guelma
  '25': { toOffice: 450,  toClinic: 850  }, // Constantine
  '26': { toOffice: 450,  toClinic: 800  }, // Médéa
  '27': { toOffice: 450,  toClinic: 850  }, // Mostaganem
  '28': { toOffice: 450,  toClinic: 850  }, // M'Sila
  '29': { toOffice: 450,  toClinic: 800  }, // Mascara
  '30': { toOffice: 450,  toClinic: 900  }, // Ouargla
  '31': { toOffice: 450,  toClinic: 850  }, // Oran
  '32': { toOffice: 450,  toClinic: 1000 }, // El Bayadh
  '33': { toOffice: 1200, toClinic: 2000 }, // Illizi
  '34': { toOffice: 450,  toClinic: 850  }, // Bordj Bou Arreridj
  '35': { toOffice: 450,  toClinic: 800  }, // Boumerdès
  '36': { toOffice: 450,  toClinic: 850  }, // El Tarf
  '37': { toOffice: 1200, toClinic: 1650 }, // Tindouf
  '38': { toOffice: 450,  toClinic: 800  }, // Tissemsilt
  '39': { toOffice: 500,  toClinic: 900  }, // El Oued
  '40': { toOffice: 450,  toClinic: 850  }, // Khenchela
  '41': { toOffice: 450,  toClinic: 850  }, // Souk Ahras
  '42': { toOffice: 450,  toClinic: 800  }, // Tipaza
  '43': { toOffice: 450,  toClinic: 850  }, // Mila
  '44': { toOffice: 450,  toClinic: 800  }, // Aïn Defla
  '45': { toOffice: 500,  toClinic: 1000 }, // Naâma
  '46': { toOffice: 450,  toClinic: 850  }, // Aïn Témouchent
  '47': { toOffice: 500,  toClinic: 850  }, // Ghardaïa
  '48': { toOffice: 450,  toClinic: 800  }, // Relizane
  '49': { toOffice: 800,  toClinic: 1650 }, // Timimoun
  '50': { toOffice: 450,  toClinic: 800  }, // Ouled Djellal
  '51': { toOffice: 700,  toClinic: 1300 }, // Beni Abbes
  '52': { toOffice: 900,  toClinic: 1650 }, // In Salah
  '53': { toOffice: 450,  toClinic: 900  }, // Touggourt
  '54': { toOffice: 500,  toClinic: 900  }, // El M'Ghair
  '55': { toOffice: 600,  toClinic: 1000 }, // El Meniaa
  '56': { toOffice: 450,  toClinic: 850  }, // Djanet (not in Excel, estimated)
  '57': { toOffice: 450,  toClinic: 850  }, // In Guezzam (not in Excel, estimated)
  '58': { toOffice: 450,  toClinic: 850  }, // Touggourt extension (not in Excel, estimated)
};

/** Default pricing when a wilaya is not listed above */
export const DEFAULT_DELIVERY_PRICING = { toOffice: 450, toClinic: 850 };

// ── Lazy-loaded city data ──────────────────────────────────────────────────────
let _rawData: RawCity[] | null = null;
let _wilayas: WilayaOption[] | null = null;
let _communes: CommuneOption[] | null = null;

async function loadRaw(): Promise<RawCity[]> {
  if (_rawData) return _rawData;
  // Dynamic import so it doesn't bloat the initial bundle
  const mod = await import('../../algeria-cities-master/json/algeria_cities.json');
  _rawData = (mod.default ?? mod) as RawCity[];
  return _rawData;
}

/** Returns a deduplicated, sorted list of all wilayas. */
export async function getWilayas(): Promise<WilayaOption[]> {
  if (_wilayas) return _wilayas;
  const raw = await loadRaw();
  const map = new Map<string, WilayaOption>();
  raw.forEach((c) => {
    if (!map.has(c.wilaya_code)) {
      map.set(c.wilaya_code, {
        code: c.wilaya_code,
        nameAscii: c.wilaya_name_ascii,
        nameAr: c.wilaya_name.trim(),
      });
    }
  });
  _wilayas = Array.from(map.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );
  return _wilayas;
}

/** Returns all communes that belong to the given wilaya code. */
export async function getCommunesByWilaya(wilayaCode: string): Promise<CommuneOption[]> {
  const raw = await loadRaw();
  if (!_communes) {
    _communes = raw.map((c) => ({
      id: c.id,
      nameAscii: c.commune_name_ascii,
      nameAr: c.commune_name,
      wilayaCode: c.wilaya_code,
    }));
  }
  const filtered = _communes
    .filter((c) => c.wilayaCode === wilayaCode)
    .sort((a, b) => a.nameAscii.localeCompare(b.nameAscii));
  return filtered;
}

/** Returns true when the doctor registered in the commune of Djelfa (free delivery). */
export function isFreeDelivery(wilayaCode: string, communeNameAscii: string): boolean {
  return (
    wilayaCode === DJELFA_WILAYA_CODE &&
    communeNameAscii.trim().toLowerCase() === DJELFA_COMMUNE_ASCII.toLowerCase()
  );
}

/** Returns the delivery pricing for a given wilaya code. */
export function getDeliveryPricing(wilayaCode: string): { toOffice: number; toClinic: number } {
  return DELIVERY_PRICING[wilayaCode] ?? DEFAULT_DELIVERY_PRICING;
}
