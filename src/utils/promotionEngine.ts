import { CartItem, Promotion } from '../types';

export interface PromotionResult {
  promotionDiscount: number;
  appliedPromotions: { id: string; name: string; saved: number }[];
  freeItems: number;
}

function isPromotionActive(promo: Promotion, now = new Date()): boolean {
  if (!promo.isActive) return false;
  const start = new Date(promo.startDate);
  const end = new Date(promo.endDate);
  end.setHours(23, 59, 59, 999);
  return now >= start && now <= end;
}

function matchesProduct(promo: Promotion, productId: string, category: string): boolean {
  if (promo.productIds?.length && !promo.productIds.includes(productId)) return false;
  if (promo.category && promo.category !== category) return false;
  return true;
}

export function calculatePromotionDiscount(
  cart: CartItem[],
  promotions: Promotion[]
): PromotionResult {
  const currentDate = new Date();
  const active = promotions.filter(p => isPromotionActive(p, currentDate));
  let promotionDiscount = 0;
  let freeItems = 0;
  const appliedPromotions: PromotionResult['appliedPromotions'] = [];

  for (const promo of active) {
    if (promo.type === 'percentage' && promo.discountPercent) {
      let saved = 0;
      for (const item of cart) {
        if (!matchesProduct(promo, item.product.id, item.product.category)) continue;
        const unitPrice = item.product.discountPercent
          ? Math.round(item.product.price * (1 - item.product.discountPercent / 100))
          : item.product.price;
        saved += Math.round(unitPrice * item.quantity * (promo.discountPercent / 100));
      }
      if (saved > 0) {
        promotionDiscount += saved;
        appliedPromotions.push({ id: promo.id, name: promo.name, saved });
      }
    }

    if (promo.type === 'buy_x_get_y' && promo.buyQuantity && promo.freeQuantity) {
      for (const item of cart) {
        if (!matchesProduct(promo, item.product.id, item.product.category)) continue;
        const sets = Math.floor(item.quantity / promo.buyQuantity);
        const freeQty = sets * promo.freeQuantity;
        if (freeQty <= 0) continue;
        const unitPrice = item.product.discountPercent
          ? Math.round(item.product.price * (1 - item.product.discountPercent / 100))
          : item.product.price;
        const saved = unitPrice * freeQty;
        promotionDiscount += saved;
        freeItems += freeQty;
        appliedPromotions.push({ id: promo.id, name: promo.name, saved });
      }
    }
  }

  return { promotionDiscount, appliedPromotions, freeItems };
}
