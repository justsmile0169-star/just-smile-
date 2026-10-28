import { Order, Payment, ProductReturn, UserProfile } from '../types';

export interface ClientFinancialSummary {
  client: UserProfile;
  activeOrdersCount: number;
  totalPurchases: number;
  totalReturns: number;
  totalPaid: number;
  netBalance: number; // positive = owes money (debt), negative = credit (in advance)
  debt: number; // Math.max(0, netBalance)
  credit: number; // Math.max(0, -netBalance)
  isDebtor: boolean;
}

/**
 * Computes financial summary for a single client (doctor).
 * Takes into account active orders, cancelled orders, returns, explicit payments,
 * and direct order payments.
 */
export function computeClientFinancials(
  client: UserProfile,
  ordersList: Order[],
  paymentsList: Payment[],
  returnsList: ProductReturn[]
): ClientFinancialSummary {
  const clientOrders = ordersList.filter((o) => o.userId === client.uid);
  const activeOrders = clientOrders.filter((o) => o.status !== 'cancelled');
  const cancelledOrders = clientOrders.filter((o) => o.status === 'cancelled');

  const clientReturns = returnsList.filter((r) => r.userId === client.uid);
  const explicitPayments = paymentsList.filter((p) => p.userId === client.uid);

  let unallocatedExplicit = explicitPayments
    .filter((p) => !p.orderId || p.orderId.trim() === '')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  let totalEffectivePayments = explicitPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  activeOrders.forEach((o) => {
    const paidOnOrder = Number(o.paidAmount) || 0;
    if (paidOnOrder > 0) {
      const explicitForOrder = explicitPayments
        .filter((p) => p.orderId === o.id)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      let uncoveredOnOrder = Math.max(0, paidOnOrder - explicitForOrder);

      if (uncoveredOnOrder > 0 && unallocatedExplicit > 0) {
        const coveredByGeneral = Math.min(uncoveredOnOrder, unallocatedExplicit);
        uncoveredOnOrder -= coveredByGeneral;
        unallocatedExplicit -= coveredByGeneral;
      }

      if (uncoveredOnOrder > 0) {
        totalEffectivePayments += uncoveredOnOrder;
      }
    }
  });

  const totalPurchases = activeOrders.reduce((sum, o) => sum + (Number(o.totalAfterDiscount) || 0), 0);
  const totalReturns =
    clientReturns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0) +
    cancelledOrders.reduce((sum, o) => sum + (Number(o.totalAfterDiscount) || 0), 0);
  const totalPaid = totalEffectivePayments;
  const netBalance = (totalPurchases - totalReturns) - totalPaid;
  const debt = Math.max(0, netBalance);
  const credit = Math.max(0, -netBalance);

  return {
    client,
    activeOrdersCount: activeOrders.length,
    totalPurchases,
    totalReturns,
    totalPaid,
    netBalance,
    debt,
    credit,
    isDebtor: debt > 0
  };
}

/**
 * Computes effective per-order paidAmount and remainingBalance by distributing
 * any unapplied general account payments (and returns) across active orders (oldest first).
 */
export function computeEffectiveClientOrders(
  ordersList: Order[],
  paymentsList: Payment[],
  returnsList: ProductReturn[] = [],
  userId?: string
): Order[] {
  const clientOrders = userId ? ordersList.filter((o) => o.userId === userId) : ordersList;
  const explicitPayments = userId ? paymentsList.filter((p) => p.userId === userId) : paymentsList;
  const clientReturns = userId ? returnsList.filter((r) => r.userId === userId) : returnsList;

  let unallocatedExplicit = explicitPayments
    .filter((p) => !p.orderId || p.orderId.trim() === '')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // Clone orders to compute effective balances without mutating input
  const clonedMap = new Map<string, Order>();
  clientOrders.forEach((o) => {
    if (o.status === 'cancelled') {
      clonedMap.set(o.id, {
        ...o,
        remainingBalance: 0
      });
    } else {
      const paid = Number(o.paidAmount) || 0;
      const total = Number(o.totalAfterDiscount) || 0;
      const rem = o.remainingBalance !== undefined ? Math.max(0, Number(o.remainingBalance)) : Math.max(0, total - paid);
      clonedMap.set(o.id, {
        ...o,
        paidAmount: paid,
        remainingBalance: rem
      });
    }
  });

  // Sort active orders oldest to newest
  const activeOrdersOldestFirst = clientOrders
    .filter((o) => o.status !== 'cancelled')
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  // Pass 1: Match existing paidAmount on active orders against order-specific and general payments
  activeOrdersOldestFirst.forEach((o) => {
    const current = clonedMap.get(o.id)!;
    const paidOnOrder = current.paidAmount || 0;
    const explicitForOrder = explicitPayments
      .filter((p) => p.orderId === o.id)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    if (explicitForOrder > paidOnOrder) {
      // Order has more explicit order-linked payments than recorded on order.paidAmount
      const newPaid = explicitForOrder;
      const newRem = Math.max(0, current.totalAfterDiscount - newPaid);
      clonedMap.set(o.id, {
        ...current,
        paidAmount: newPaid,
        remainingBalance: newRem,
        paymentStatus: newRem <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'
      });
    } else {
      const uncoveredOnOrder = Math.max(0, paidOnOrder - explicitForOrder);
      if (uncoveredOnOrder > 0 && unallocatedExplicit > 0) {
        const coveredByGeneral = Math.min(uncoveredOnOrder, unallocatedExplicit);
        unallocatedExplicit -= coveredByGeneral;
      }
    }
  });

  // Pass 2: If there is still unallocated general payment left over (e.g. after a general payment was added or edited upwards),
  // distribute it onto active orders that still have remainingBalance > 0 (oldest first).
  if (unallocatedExplicit > 0) {
    for (const o of activeOrdersOldestFirst) {
      if (unallocatedExplicit <= 0) break;
      const current = clonedMap.get(o.id)!;
      if (current.remainingBalance > 0) {
        const applyAmount = Math.min(current.remainingBalance, unallocatedExplicit);
        const newPaid = (current.paidAmount || 0) + applyAmount;
        const newRem = Math.max(0, current.remainingBalance - applyAmount);
        clonedMap.set(o.id, {
          ...current,
          paidAmount: newPaid,
          remainingBalance: newRem,
          paymentStatus: newRem <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid'
        });
        unallocatedExplicit -= applyAmount;
      }
    }
  }

  // Pass 3: Apply product returns to reduce remainingBalance on orders if applicable
  let unappliedReturns = clientReturns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
  if (unappliedReturns > 0) {
    for (const o of activeOrdersOldestFirst) {
      if (unappliedReturns <= 0) break;
      const current = clonedMap.get(o.id)!;
      if (current.remainingBalance > 0) {
        const reduceBy = Math.min(current.remainingBalance, unappliedReturns);
        const newRem = Math.max(0, current.remainingBalance - reduceBy);
        clonedMap.set(o.id, {
          ...current,
          remainingBalance: newRem,
          paymentStatus: newRem <= 0 ? 'paid' : current.paidAmount > 0 ? 'partial' : 'unpaid'
        });
        unappliedReturns -= reduceBy;
      }
    }
  }

  return clientOrders.map((o) => clonedMap.get(o.id) || o);
}

/**
 * Computes financial summary for a list of clients.
 */
export function computeAllClientsFinancials(
  clients: UserProfile[],
  ordersList: Order[],
  paymentsList: Payment[],
  returnsList: ProductReturn[]
): ClientFinancialSummary[] {
  return clients.map((client) =>
    computeClientFinancials(client, ordersList, paymentsList, returnsList)
  );
}
