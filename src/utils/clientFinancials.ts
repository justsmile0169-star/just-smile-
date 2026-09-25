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
