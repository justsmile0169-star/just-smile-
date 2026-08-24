import { Order, Payment, ProductReturn, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';

interface ExportFinancialStatementOptions {
  client: UserProfile;
  orders: Order[];
  payments: Payment[];
  returns: ProductReturn[];
  lang: Language;
}

export function exportFinancialStatement({
  client,
  orders,
  payments,
  returns,
  lang
}: ExportFinancialStatementOptions) {
  const isRtl = lang === 'ar';
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert(
      lang === 'fr'
        ? 'Veuillez autoriser les fenêtres surgissantes (popups) pour imprimer le relevé.'
        : 'يرجى السماح بالنوافذ المنبثقة (Popups) للتمكن من طباعة كشف الحساب.'
    );
    return;
  }

  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');
  const activeOrders = orders.filter((o) => o.status !== 'cancelled');

  const explicitPayments = payments || [];
  const effectivePayments: Payment[] = [...explicitPayments];

  let unallocatedExplicit = explicitPayments
    .filter((p) => !p.orderId || p.orderId.trim() === '')
    .reduce((sum, p) => sum + p.amount, 0);

  activeOrders.forEach((o) => {
    const paidOnOrder = o.paidAmount || 0;
    if (paidOnOrder > 0) {
      const explicitForOrder = explicitPayments
        .filter((p) => p.orderId === o.id)
        .reduce((sum, p) => sum + p.amount, 0);

      let uncoveredOnOrder = Math.max(0, paidOnOrder - explicitForOrder);

      if (uncoveredOnOrder > 0 && unallocatedExplicit > 0) {
        const coveredByGeneral = Math.min(uncoveredOnOrder, unallocatedExplicit);
        uncoveredOnOrder -= coveredByGeneral;
        unallocatedExplicit -= coveredByGeneral;
      }

      if (uncoveredOnOrder > 0) {
        effectivePayments.push({
          id: `synth-${o.id}`,
          orderId: o.id,
          userId: o.userId,
          amount: uncoveredOnOrder,
          paymentDate: o.createdAt,
          notes: isRtl ? 'دفعة عند الطلب / مباشرة' : 'Paiement à la commande / Direct'
        });
      }
    }
  });

  effectivePayments.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  const totalPurchases = activeOrders.reduce((s, o) => s + o.totalAfterDiscount, 0);
  const totalReturns =
    returns.reduce((s, r) => s + r.totalAmount, 0) +
    cancelledOrders.reduce((s, o) => s + o.totalAfterDiscount, 0);
  const totalPaid = effectivePayments.reduce((s, p) => s + p.amount, 0);
  const totalDebt = activeOrders.reduce((s, o) => s + o.remainingBalance, 0);

  const reportDate = new Date().toLocaleDateString(isRtl ? 'ar-DZ' : 'fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const statusLabel = (status: string) => getTranslation(lang, `status_${status}` as any) || status;
  const currencySymbol = isRtl ? 'دج' : 'DA';

  const L = isRtl ? {
    docTitle: `كشف حساب مالي - ${client.name}`,
    previewTitle: 'معاينة كشف الحساب المالي',
    previewSubtitle: '(جاهز للطباعة أو التصدير PDF)',
    btnPrint: 'طباعة الكشف 🖨️',
    btnClose: 'إغلاق',
    companyTitle: 'JUST SMILE - مستلزمات طب الأسنان',
    companySub: 'كشف حساب مالي رسمي للعيادة — Relevé De Compte Financier',
    exportDate: 'تاريخ الاستخراج',
    doctorClinic: 'الطبيب / العيادة',
    privateClinic: 'عيادة خاصة',
    phone: 'رقم الهاتف',
    email: 'البريد الإلكتروني',
    wilaya: 'الولاية / المدينة',
    totalPurchases: 'إجمالي المشتريات',
    totalReturns: 'إجمالي المرتجعات',
    totalPaid: 'إجمالي المدفوعات',
    netDebt: 'الصافي المتبقي / الدين',
    section1Title: '1. تفاصيل المشتريات حسب الطلبيات والمنتجات (Factures & Articles)',
    noOrders: 'لا توجد طلبات مسجلة.',
    colDate: 'التاريخ',
    colOrderNum: 'رقم الطلب',
    colPaymentType: 'نوع الدفع',
    colTotal: 'المبلغ الإجمالي',
    colPaid: 'المبلغ المدفوع',
    colRemaining: 'المتبقي',
    colStatus: 'الحالة',
    creditPayment: 'دَين (Crédit)',
    cashPayment: 'نقداً (Cash)',
    itemsListTitle: (id: string) => `📦 قائمة المنتجات والمشتريات للطلب (#${id}):`,
    noItemsDetail: 'لا توجد عناصر تفصيلية.',
    colProductName: 'اسم المنتج',
    colVariantCategory: 'الخيار / الفئة',
    colQuantity: 'الكمية',
    colUnitPrice: 'سعر الوحدة',
    colSubtotal: 'المجموع',
    section2Title: '2. المدفوعات المستلمة (Paiements Reçus)',
    colPaymentDate: 'تاريخ السداد',
    colLinkedOrder: 'رقم الطلب المرتبط',
    colAmountReceived: 'المبلغ المستلم',
    colNotes: 'ملاحظات / بيان الدفع',
    noPayments: 'لا توجد مدفوعات مسجلة.',
    section3Title: '3. المرتجعات والطلبات الملغاة (Retours & Annulations)',
    colReturnAmount: 'قيمة المرتجع / الإلغاء',
    colReasonType: 'السبب / النوع',
    defaultReturnReason: 'مرتجع منتجات',
    orderCancelled: 'طلب ملغى',
    footerText: 'تم استخراج هذا الكشف آلياً من نظام JUST SMILE لمستلزمات طب الأسنان.'
  } : {
    docTitle: `Relevé Financier - ${client.name}`,
    previewTitle: 'Aperçu du Relevé Financier',
    previewSubtitle: '(Prêt pour impression ou export PDF)',
    btnPrint: 'Imprimer le Relevé 🖨️',
    btnClose: 'Fermer',
    companyTitle: 'JUST SMILE - Matériel Dentaire',
    companySub: 'Relevé de Compte Financier Officiel du Cabinet',
    exportDate: 'Date d\'extraction',
    doctorClinic: 'Médecin / Cabinet',
    privateClinic: 'Cabinet Privé',
    phone: 'Téléphone',
    email: 'E-mail',
    wilaya: 'Wilaya / Ville',
    totalPurchases: 'Total Achats',
    totalReturns: 'Total Retours',
    totalPaid: 'Total Payé',
    netDebt: 'Reste Dû / Solde Débiteur',
    section1Title: '1. Détail des Achats par Commande et Produits (Factures & Articles)',
    noOrders: 'Aucune commande enregistrée.',
    colDate: 'Date',
    colOrderNum: 'N° Commande',
    colPaymentType: 'Mode de Paiement',
    colTotal: 'Montant Total',
    colPaid: 'Montant Payé',
    colRemaining: 'Reste Dû',
    colStatus: 'Statut',
    creditPayment: 'Crédit (15j)',
    cashPayment: 'Comptant (COD)',
    itemsListTitle: (id: string) => `📦 Articles et produits de la commande (#${id}) :`,
    noItemsDetail: 'Aucun détail disponible.',
    colProductName: 'Désignation Produit',
    colVariantCategory: 'Option / Catégorie',
    colQuantity: 'Quantité',
    colUnitPrice: 'Prix Unitaire',
    colSubtotal: 'Sous-Total',
    section2Title: '2. Paiements Reçus (Paiements Reçus)',
    colPaymentDate: 'Date du Paiement',
    colLinkedOrder: 'N° Commande Associée',
    colAmountReceived: 'Montant Reçu',
    colNotes: 'Notes / Justificatif',
    noPayments: 'Aucun paiement enregistré.',
    section3Title: '3. Retours & Annulations (Retours & Annulations)',
    colReturnAmount: 'Valeur Retour / Annulation',
    colReasonType: 'Motif / Type',
    defaultReturnReason: 'Retour de marchandise',
    orderCancelled: 'Commande annulée',
    footerText: 'Ce relevé a été généré électroniquement par le système JUST SMILE Matériel Dentaire.'
  };

  const fmtNum = (num: number) =>
    new Intl.NumberFormat(isRtl ? 'ar-DZ' : 'fr-FR').format(num) + ' ' + currencySymbol;

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="${isRtl ? 'rtl' : 'ltr'}">
    <head>
      <meta charset="utf-8" />
      <title>${L.docTitle}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body {
          font-family: ${isRtl ? "'Cairo', Arial, sans-serif" : "'Inter', system-ui, Arial, sans-serif"};
          padding: 24px;
          color: #1e293b;
          background: #ffffff;
          margin: 0;
          line-height: 1.5;
        }
        .no-print-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 12px 20px;
          border-radius: 12px;
          margin-bottom: 24px;
        }
        .btn-print {
          background: #0891b2;
          color: white;
          border: none;
          padding: 8px 18px;
          border-radius: 8px;
          font-weight: bold;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-close {
          background: #cbd5e1;
          color: #334155;
          border: none;
          padding: 8px 14px;
          border-radius: 8px;
          font-weight: bold;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #0891b2;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .header h1 { color: #0891b2; margin: 0; font-size: 22px; font-weight: 800; }
        .header p { color: #64748b; margin: 4px 0 0 0; font-size: 13px; font-weight: 600; }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 18px;
          margin-bottom: 24px;
          font-size: 13px;
        }
        .info-item span { color: #64748b; font-weight: 600; }
        .info-item strong { color: #0f172a; }
        
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }
        .summary-card {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px;
          background: #ffffff;
          text-align: center;
        }
        .summary-card .label { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; }
        .summary-card .val { font-size: 15px; font-weight: 800; margin-top: 4px; }
        
        .section-title {
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
          margin: 24px 0 12px 0;
          padding-bottom: 6px;
          border-bottom: 2px solid #0891b2;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        .data-table th, .data-table td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: ${isRtl ? 'right' : 'left'}; }
        .data-table th { background-color: #f1f5f9; font-weight: 700; color: #334155; }
        
        .order-row-header {
          background-color: #f8fafc;
          font-weight: 700;
        }
        .items-container-cell {
          padding: 8px 14px 14px 14px !important;
          background-color: #ffffff;
        }
        .items-subtable {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          overflow: hidden;
          margin-top: 4px;
        }
        .items-subtable th {
          background-color: #e2e8f0;
          color: #334155;
          font-weight: 700;
          padding: 5px 8px;
          border: 1px solid #cbd5e1;
          font-size: 10.5px;
        }
        .items-subtable td {
          padding: 5px 8px;
          border: 1px solid #e2e8f0;
        }

        .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }

        @media print {
          .no-print { display: none !important; }
          body { padding: 0; background: white; }
          .info-grid, .summary-card { border-color: #cbd5e1; }
        }
      </style>
    </head>
    <body>
      <div class="no-print-bar no-print">
        <div>
          <strong style="font-size: 14px;">${L.previewTitle}</strong>
          <span style="color: #64748b; font-size: 12px; ${isRtl ? 'margin-right' : 'margin-left'}: 10px;">${L.previewSubtitle}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn-print" onclick="window.print()">${L.btnPrint}</button>
          <button class="btn-close" onclick="window.close()">${L.btnClose}</button>
        </div>
      </div>

      <div class="header">
        <h1>${L.companyTitle}</h1>
        <p>${L.companySub}</p>
        <p>${L.exportDate}: ${reportDate}</p>
      </div>

      <div class="info-grid">
        <div class="info-item"><span>${L.doctorClinic}:</span> <strong>${client.name} (${client.clinicName || L.privateClinic})</strong></div>
        <div class="info-item"><span>${L.phone}:</span> <strong>${client.phone || '-'}</strong></div>
        <div class="info-item"><span>${L.email}:</span> <strong>${client.email || '-'}</strong></div>
        <div class="info-item"><span>${L.wilaya}:</span> <strong>${client.wilayaName || '-'}</strong></div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">${L.totalPurchases}</div>
          <div class="val" style="color: #0891b2;">${fmtNum(totalPurchases)}</div>
        </div>
        <div class="summary-card">
          <div class="label">${L.totalReturns}</div>
          <div class="val" style="color: #d97706;">${fmtNum(totalReturns)}</div>
        </div>
        <div class="summary-card">
          <div class="label">${L.totalPaid}</div>
          <div class="val" style="color: #059669;">${fmtNum(totalPaid)}</div>
        </div>
        <div class="summary-card" style="background: #fff1f2; border-color: #fecdd3;">
          <div class="label" style="color: #be123c;">${L.netDebt}</div>
          <div class="val" style="color: #e11d48;">${fmtNum(totalDebt)}</div>
        </div>
      </div>

      <div class="section-title">${L.section1Title}</div>
      ${orders.length === 0 ? `
        <div style="text-align: center; color: #94a3b8; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">${L.noOrders}</div>
      ` : `
        <table class="data-table">
          <thead>
            <tr>
              <th>${L.colDate}</th>
              <th>${L.colOrderNum}</th>
              <th>${L.colPaymentType}</th>
              <th>${L.colTotal}</th>
              <th>${L.colPaid}</th>
              <th>${L.colRemaining}</th>
              <th>${L.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map((o) => {
              const items = o.items || [];
              const orderIdClean = o.id ? o.id.slice(-8).toUpperCase() : '';
              return `
                <tr class="order-row-header">
                  <td>${new Date(o.createdAt).toLocaleDateString(isRtl ? 'ar-DZ' : 'fr-FR')}</td>
                  <td>#${orderIdClean}</td>
                  <td>${o.paymentMethod === 'credit' ? L.creditPayment : L.cashPayment}</td>
                  <td style="font-weight: 800;">${fmtNum(o.totalAfterDiscount)}</td>
                  <td style="color: #059669;">${fmtNum(o.paidAmount)}</td>
                  <td style="color: ${o.remainingBalance > 0 ? '#e11d48' : '#64748b'}; font-weight: 800;">${fmtNum(o.remainingBalance)}</td>
                  <td>${statusLabel(o.status)}</td>
                </tr>
                <tr>
                  <td colspan="7" class="items-container-cell">
                    <div style="font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                      ${L.itemsListTitle(orderIdClean)}
                    </div>
                    ${items.length === 0 ? `
                      <div style="font-size: 10.5px; color: #94a3b8; font-style: italic;">${L.noItemsDetail}</div>
                    ` : `
                      <table class="items-subtable">
                        <thead>
                          <tr>
                            <th style="text-align: ${isRtl ? 'right' : 'left'};">${L.colProductName}</th>
                            <th style="text-align: center;">${L.colVariantCategory}</th>
                            <th style="text-align: center;">${L.colQuantity}</th>
                            <th style="text-align: ${isRtl ? 'left' : 'right'};">${L.colUnitPrice}</th>
                            <th style="text-align: ${isRtl ? 'left' : 'right'};">${L.colSubtotal}</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${items.map((item) => `
                            <tr>
                              <td style="font-weight: 600; color: #0f172a;">${item.name}</td>
                              <td style="text-align: center; color: #64748b;">${item.variantName || item.category || '-'}</td>
                              <td style="text-align: center; font-weight: 700; color: #0f172a;">x${item.quantity}</td>
                              <td style="text-align: ${isRtl ? 'left' : 'right'}; color: #475569;">${fmtNum(item.price)}</td>
                              <td style="text-align: ${isRtl ? 'left' : 'right'}; font-weight: 700; color: #0891b2;">${fmtNum(item.price * item.quantity)}</td>
                            </tr>
                          `).join('')}
                          ${o.deliveryCost && o.deliveryCost > 0 ? `
                            <tr style="background: #f8fafc;">
                              <td style="font-weight: 600; color: #475569;">🚚 ${isRtl ? 'خدمة توصيل الطلب (شركة التوصيل)' : 'Frais de livraison'}</td>
                              <td style="text-align: center; color: #64748b;">${isRtl ? 'توصيل' : 'Livraison'}</td>
                              <td style="text-align: center; font-weight: 700; color: #0f172a;">1</td>
                              <td style="text-align: ${isRtl ? 'left' : 'right'}; color: #475569;">${fmtNum(o.deliveryCost)}</td>
                              <td style="text-align: ${isRtl ? 'left' : 'right'}; font-weight: 700; color: #0891b2;">${fmtNum(o.deliveryCost)}</td>
                            </tr>
                          ` : ''}
                        </tbody>
                      </table>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `}

      <div class="section-title">${L.section2Title}</div>
      <table class="data-table">
        <thead>
          <tr>
            <th>${L.colPaymentDate}</th>
            <th>${L.colLinkedOrder}</th>
            <th>${L.colAmountReceived}</th>
            <th>${L.colNotes}</th>
          </tr>
        </thead>
        <tbody>
          ${effectivePayments.length === 0 ? `
            <tr><td colSpan="4" style="text-align: center; color: #94a3b8;">${L.noPayments}</td></tr>
          ` : effectivePayments.map((p) => `
            <tr>
              <td>${new Date(p.paymentDate).toLocaleDateString(isRtl ? 'ar-DZ' : 'fr-FR')}</td>
              <td>#${p.orderId ? p.orderId.slice(-8).toUpperCase() : '-'}</td>
              <td style="color: #059669; font-weight: bold;">${fmtNum(p.amount)}</td>
              <td>${p.notes || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${(returns.length > 0 || cancelledOrders.length > 0) ? `
        <div class="section-title">${L.section3Title}</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>${L.colDate}</th>
              <th>${L.colOrderNum}</th>
              <th>${L.colReturnAmount}</th>
              <th>${L.colReasonType}</th>
            </tr>
          </thead>
          <tbody>
            ${returns.map((r) => `
              <tr>
                <td>${new Date(r.createdAt).toLocaleDateString(isRtl ? 'ar-DZ' : 'fr-FR')}</td>
                <td>${r.orderId ? `#${r.orderId.slice(-8).toUpperCase()}` : '-'}</td>
                <td style="color: #d97706; font-weight: bold;">${fmtNum(r.totalAmount)}</td>
                <td>${r.reason || L.defaultReturnReason}</td>
              </tr>
            `).join('')}
            ${cancelledOrders.map((o) => `
              <tr style="background: #fff5f5;">
                <td>${new Date(o.createdAt).toLocaleDateString(isRtl ? 'ar-DZ' : 'fr-FR')}</td>
                <td>#${o.id ? o.id.slice(-8).toUpperCase() : ''}</td>
                <td style="color: #e11d48; font-weight: bold;">${fmtNum(o.totalAfterDiscount)}</td>
                <td style="color: #be123c;">${L.orderCancelled}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : ''}

      <div class="footer">
        ${L.footerText}
      </div>

      <script>
        function triggerPrint() {
          window.focus();
          window.print();
        }
        if (document.readyState === 'complete') {
          setTimeout(triggerPrint, 350);
        } else {
          window.addEventListener('load', function() { setTimeout(triggerPrint, 350); });
          setTimeout(triggerPrint, 500);
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    try {
      printWindow.print();
    } catch (err) {
      console.error('Error triggering window.print()', err);
    }
  }, 450);
}
