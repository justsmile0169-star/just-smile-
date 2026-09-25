import { Order, Payment, ProductReturn, ShopInfo, UserProfile } from '../types';
import { Language } from '../translations';
import { computeAllClientsFinancials, ClientFinancialSummary } from './clientFinancials';

interface ExportAllDebtsOptions {
  doctors: UserProfile[];
  orders: Order[];
  payments: Payment[];
  returns: ProductReturn[];
  shopInfo?: ShopInfo;
  lang: Language;
  includeAllClients?: boolean; // if false/undefined, only debtors (debt > 0)
}

export function exportAllDebtsPDF({
  doctors,
  orders,
  payments,
  returns,
  shopInfo,
  lang,
  includeAllClients = false
}: ExportAllDebtsOptions) {
  const isRtl = lang === 'ar';
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert(
      lang === 'fr'
        ? 'Veuillez autoriser les fenêtres surgissantes (popups) pour exporter le document PDF.'
        : 'يرجى السماح بالنوافذ المنبثقة (Popups) للتمكن من استخراج وطباعة ملف PDF.'
    );
    return;
  }

  // Calculate summaries for all clients
  const allSummaries = computeAllClientsFinancials(doctors, orders, payments, returns);

  // Filter based on includeAllClients (default: only clients with debt > 0)
  const filteredSummaries: ClientFinancialSummary[] = includeAllClients
    ? allSummaries.sort((a, b) => b.debt - a.debt)
    : allSummaries.filter((s) => s.debt > 0).sort((a, b) => b.debt - a.debt);

  // Grand totals
  const totalDebtorsCount = allSummaries.filter((s) => s.debt > 0).length;
  const grandTotalPurchases = filteredSummaries.reduce((sum, s) => sum + s.totalPurchases, 0);
  const grandTotalReturns = filteredSummaries.reduce((sum, s) => sum + s.totalReturns, 0);
  const grandTotalPaid = filteredSummaries.reduce((sum, s) => sum + s.totalPaid, 0);
  const grandTotalDebt = allSummaries.reduce((sum, s) => sum + s.debt, 0);

  const currencySymbol = isRtl ? 'دج' : 'DA';
  const fmtNum = (num: number) =>
    new Intl.NumberFormat(isRtl ? 'ar-DZ' : 'fr-FR').format(Math.round(num)) + ' ' + currencySymbol;

  const reportDate = new Date().toLocaleDateString(isRtl ? 'ar-DZ' : 'fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const reportTime = new Date().toLocaleTimeString(isRtl ? 'ar-DZ' : 'fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const companyName = shopInfo?.companyName || 'JUST SMILE';
  const companyPhone = shopInfo?.phone || '0770821021 / 0780212989';
  const companyAddress = shopInfo?.address || 'Algeria, Djelfa';

  const L = isRtl
    ? {
        docTitle: `كشف ديون جميع الزبائن - ${companyName}`,
        previewTitle: 'كشف إجمالي ديون ومستحقات الزبائن',
        previewSubtitle: '(جاهز للطباعة أو الحفظ بصيغة PDF)',
        btnPrint: 'طباعة / حفظ PDF 🖨️',
        btnClose: 'إغلاق',
        companyTitle: `${companyName} - مستلزمات طب الأسنان`,
        companySub: 'التقرير المالي الإجمالي لمتابعة الديون والذمم المدينة للزبائن',
        exportDate: 'تاريخ الاستخراج',
        exportTime: 'التوقيت',
        kpiTotalDebt: 'إجمالي الديون المعلقة',
        kpiDebtorsCount: 'عدد الزبائن المدينين',
        kpiTotalSales: 'إجمالي المشتريات / الفواتير',
        kpiTotalCollected: 'إجمالي المبالغ المحصلة',
        colNum: '#',
        colClient: 'الطبيب / الزبون',
        colClinic: 'العيادة',
        colPhone: 'رقم الهاتف',
        colWilaya: 'الولاية / المدينة',
        colOrdersCount: 'الطلبيات',
        colPurchases: 'إجمالي المشتريات',
        colReturns: 'المرتجعات',
        colPaid: 'المسدد',
        colDebt: 'الدين المتبقي',
        grandTotalRow: 'المجموع الإجمالي العام',
        noData: 'لا توجد ديون معلقة على أي زبون حالياً.',
        footerNote: 'تم إنشاء هذا الكشف المالي الشامل آلياً عبر نظام إدارة JUST SMILE.'
      }
    : {
        docTitle: `État Global des Créances Clients - ${companyName}`,
        previewTitle: 'État Récapitulatif Global des Créances & Dettes Clients',
        previewSubtitle: '(Prêt pour impression ou enregistrement en PDF)',
        btnPrint: 'Imprimer / Enregistrer PDF 🖨️',
        btnClose: 'Fermer',
        companyTitle: `${companyName} - Matériel Dentaire`,
        companySub: 'Rapport Financier Global des Créances et Soldes Débiteurs',
        exportDate: 'Date d\'extraction',
        exportTime: 'Heure',
        kpiTotalDebt: 'Total des Créances Restantes',
        kpiDebtorsCount: 'Nombre de Clients Débiteurs',
        kpiTotalSales: 'Total Facturation (Achats)',
        kpiTotalCollected: 'Total des Versements Perçus',
        colNum: 'N°',
        colClient: 'Médecin / Client',
        colClinic: 'Cabinet',
        colPhone: 'Téléphone',
        colWilaya: 'Wilaya / Ville',
        colOrdersCount: 'Cmds',
        colPurchases: 'Total Achats',
        colReturns: 'Retours',
        colPaid: 'Total Payé',
        colDebt: 'Reste Dû (Dette)',
        grandTotalRow: 'Total Général',
        noData: 'Aucune créance client en cours.',
        footerNote: 'Ce relevé financier global a été généré automatiquement par le système JUST SMILE.'
      };

  const rowsHtml =
    filteredSummaries.length === 0
      ? `<tr><td colspan="9" style="text-align: center; padding: 24px; color: #64748b; font-weight: bold;">${L.noData}</td></tr>`
      : filteredSummaries
          .map((item, idx) => {
            const doc = item.client;
            return `
        <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding: 10px 8px; font-weight: bold; text-align: center; color: #64748b; font-size: 11px;">${idx + 1}</td>
          <td style="padding: 10px 10px; font-weight: 800; color: #0f172a; font-size: 12px;">
            <div>${doc.name || 'بدون اسم'}</div>
            ${doc.email ? `<div style="font-size: 10px; color: #94a3b8; font-weight: normal;">${doc.email}</div>` : ''}
          </td>
          <td style="padding: 10px 8px; color: #475569; font-size: 11.5px; font-weight: 600;">
            ${doc.clinicName || '-'}
          </td>
          <td style="padding: 10px 8px; font-family: monospace; font-size: 11px; color: #334155; font-weight: 600; direction: ltr; text-align: ${isRtl ? 'right' : 'left'};">
            ${doc.phone || '-'}
          </td>
          <td style="padding: 10px 8px; color: #475569; font-size: 11.5px;">
            ${doc.wilayaName || doc.communeName || '-'}
          </td>
          <td style="padding: 10px 8px; text-align: center; font-weight: bold; color: #64748b; font-size: 11px;">
            ${item.activeOrdersCount}
          </td>
          <td style="padding: 10px 8px; text-align: ${isRtl ? 'left' : 'right'}; font-weight: 700; color: #0f172a; font-size: 11.5px;">
            ${fmtNum(item.totalPurchases)}
          </td>
          <td style="padding: 10px 8px; text-align: ${isRtl ? 'left' : 'right'}; font-weight: 700; color: #059669; font-size: 11.5px;">
            ${fmtNum(item.totalPaid)}
          </td>
          <td style="padding: 10px 8px; text-align: ${isRtl ? 'left' : 'right'}; font-weight: 900; color: #e11d48; font-size: 12.5px; background: rgba(225, 29, 72, 0.04);">
            ${fmtNum(item.debt)}
          </td>
        </tr>
      `;
          })
          .join('');

  const htmlContent = `<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${L.docTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: ${isRtl ? "'Cairo', 'Segoe UI', Arial, sans-serif" : "'Inter', -apple-system, system-ui, sans-serif"};
      color: #0f172a;
      background: #f8fafc;
      margin: 0;
      padding: 20px;
      font-size: 12px;
      line-height: 1.4;
    }
    .no-print-bar {
      position: sticky;
      top: 0;
      background: #0f172a;
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
      z-index: 1000;
    }
    .no-print-bar-info h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 800;
      color: #38bdf8;
    }
    .no-print-bar-info p {
      margin: 2px 0 0;
      font-size: 11px;
      color: #94a3b8;
    }
    .btn-print {
      background: #0891b2;
      color: #ffffff;
      border: none;
      padding: 9px 20px;
      border-radius: 8px;
      font-weight: 800;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.2s;
    }
    .btn-print:hover {
      background: #0e7490;
    }
    .btn-close {
      background: #334155;
      color: #cbd5e1;
      border: none;
      padding: 9px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
      margin-${isRtl ? 'right' : 'left'}: 10px;
    }
    .page-container {
      background: #ffffff;
      padding: 24px 28px;
      border-radius: 16px;
      max-width: 210mm;
      margin: 0 auto;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      border: 1px solid #e2e8f0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2.5px solid #0891b2;
      padding-bottom: 16px;
      margin-bottom: 18px;
    }
    .company-brand h1 {
      color: #0891b2;
      margin: 0;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.5px;
    }
    .company-brand p {
      color: #64748b;
      margin: 4px 0 0;
      font-size: 12px;
      font-weight: 600;
    }
    .company-contacts {
      margin-top: 6px;
      font-size: 11px;
      color: #475569;
    }
    .report-meta {
      text-align: ${isRtl ? 'left' : 'right'};
    }
    .report-badge {
      display: inline-block;
      background: #e11d48;
      color: #ffffff;
      padding: 4px 12px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 11.5px;
      margin-bottom: 6px;
    }
    .report-meta-text {
      font-size: 11px;
      color: #64748b;
      margin: 2px 0;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px 14px;
    }
    .kpi-card.highlight {
      background: #fff1f2;
      border-color: #fecdd3;
    }
    .kpi-label {
      font-size: 10px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .kpi-card.highlight .kpi-label {
      color: #e11d48;
    }
    .kpi-value {
      font-size: 15px;
      font-weight: 900;
      color: #0f172a;
    }
    .kpi-card.highlight .kpi-value {
      color: #be123c;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #0891b2;
      color: #ffffff;
      font-weight: 800;
      font-size: 11px;
      text-align: ${isRtl ? 'right' : 'left'};
      padding: 9px 8px;
    }
    th.center {
      text-align: center;
    }
    th.num {
      text-align: ${isRtl ? 'left' : 'right'};
    }
    .table-totals {
      background: #0f172a !important;
      color: #ffffff !important;
      font-weight: 900;
      font-size: 12px;
    }
    .table-totals td {
      padding: 11px 8px;
      border: none;
      color: #ffffff;
    }
    .table-totals td.highlight {
      color: #fda4af;
      font-size: 13px;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #94a3b8;
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .no-print-bar {
        display: none !important;
      }
      .page-container {
        box-shadow: none;
        border: none;
        padding: 0;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div class="no-print-bar-info">
      <h3>${L.previewTitle}</h3>
      <p>${L.previewSubtitle}</p>
    </div>
    <div>
      <button class="btn-print" onclick="window.print()">${L.btnPrint}</button>
      <button class="btn-close" onclick="window.close()">${L.btnClose}</button>
    </div>
  </div>

  <div class="page-container">
    <div class="header">
      <div class="company-brand">
        <h1>${companyName}</h1>
        <p>${L.companySub}</p>
        <div class="company-contacts">
          📍 ${companyAddress} &nbsp;•&nbsp; 📞 ${companyPhone}
        </div>
      </div>
      <div class="report-meta">
        <div class="report-badge">${L.previewTitle}</div>
        <div class="report-meta-text"><strong>${L.exportDate}:</strong> ${reportDate}</div>
        <div class="report-meta-text"><strong>${L.exportTime}:</strong> ${reportTime}</div>
      </div>
    </div>

    <!-- KPI Summary Grid -->
    <div class="kpi-grid">
      <div class="kpi-card highlight">
        <div class="kpi-label">${L.kpiTotalDebt}</div>
        <div class="kpi-value">${fmtNum(grandTotalDebt)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">${L.kpiDebtorsCount}</div>
        <div class="kpi-value">${totalDebtorsCount} ${isRtl ? 'طبيب / عيادة' : 'Clients'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">${L.kpiTotalSales}</div>
        <div class="kpi-value">${fmtNum(grandTotalPurchases)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">${L.kpiTotalCollected}</div>
        <div class="kpi-value">${fmtNum(grandTotalPaid)}</div>
      </div>
    </div>

    <!-- Main Table -->
    <table>
      <thead>
        <tr>
          <th class="center" style="width: 30px;">${L.colNum}</th>
          <th>${L.colClient}</th>
          <th>${L.colClinic}</th>
          <th>${L.colPhone}</th>
          <th>${L.colWilaya}</th>
          <th class="center" style="width: 50px;">${L.colOrdersCount}</th>
          <th class="num">${L.colPurchases}</th>
          <th class="num">${L.colPaid}</th>
          <th class="num">${L.colDebt}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr class="table-totals">
          <td colspan="5" style="text-align: ${isRtl ? 'right' : 'left'};">${L.grandTotalRow} (${filteredSummaries.length} ${isRtl ? 'زبون' : 'clients'})</td>
          <td style="text-align: center;">-</td>
          <td style="text-align: ${isRtl ? 'left' : 'right'};">${fmtNum(grandTotalPurchases)}</td>
          <td style="text-align: ${isRtl ? 'left' : 'right'};">${fmtNum(grandTotalPaid)}</td>
          <td class="highlight" style="text-align: ${isRtl ? 'left' : 'right'};">${fmtNum(grandTotalDebt)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>${L.footerNote}</div>
      <div>${companyName} &copy; ${new Date().getFullYear()}</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 350);
    };
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.focus();
}
