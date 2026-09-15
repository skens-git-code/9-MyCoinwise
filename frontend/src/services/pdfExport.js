// =============================================
// MyCoinwise – PDF Export (client-side using jsPDF-like approach)
// Generates a styled PDF report from transaction data
// =============================================

export async function exportToPDF(user, transactions = [], currencyInfo, localeOpt) {
  // Dynamically import jsPDF + autoTable
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const symbol = currencyInfo?.symbol || '$';
  const currency = user?.currency || 'USD';
  const activeLocale = localeOpt || user?.locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, 210, 42, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text('MYCOINWISE', 15, 20);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('AI-Powered Finance Tracker', 15, 28);
  doc.text(`Report for: ${user?.username || 'User'}`, 15, 35);

  // Date
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString(activeLocale)}`, 140, 28);
  doc.text(`Currency: ${currency}`, 140, 35);

  // ── Summary Box ─────────────────────────────────────────────────────────────
  const income = transactions.filter(t => t.type === 'income').reduce((a, c) => {
    const val = Number(c.amount);
    return a + (Number.isFinite(val) ? val : 0);
  }, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((a, c) => {
    const val = Number(c.amount);
    return a + (Number.isFinite(val) ? val : 0);
  }, 0);
  const balance = Number.isFinite(Number(user?.balance)) ? Number(user.balance) : 0;
  const savingsRate = income > 0 ? ((income - expense) / income * 100).toFixed(1) : 0;

  const summaryY = 52;
  const cols = [
    { label: 'Balance', value: `${symbol}${balance.toFixed(2)}`, color: balance >= 0 ? [16, 185, 129] : [239, 68, 68] },
    { label: 'Total Income', value: `${symbol}${income.toFixed(2)}`, color: [16, 185, 129] },
    { label: 'Total Spent', value: `${symbol}${expense.toFixed(2)}`, color: [239, 68, 68] },
    { label: 'Savings Rate', value: `${savingsRate}%`, color: [5, 150, 105] },
  ];

  cols.forEach((col, i) => {
    const x = 10 + i * 47.5;
    doc.setFillColor(248, 248, 255);
    doc.roundedRect(x, summaryY, 45, 22, 3, 3, 'F');
    doc.setFillColor(...col.color);
    doc.roundedRect(x, summaryY, 45, 5, 3, 3, 'F');
    doc.rect(x, summaryY + 2.5, 45, 2.5, 'F'); // flat bottom on top rect

    doc.setTextColor(...col.color);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(col.value, x + 22.5, summaryY + 14, { align: 'center' });
    doc.setTextColor(100, 100, 120);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(col.label, x + 22.5, summaryY + 20, { align: 'center' });
  });

  // ── Table ────────────────────────────────────────────────────────────────────
  const tableData = transactions.map(t => {
    const parsedDate = t.date ? new Date(t.date) : new Date();
    const formattedDate = !isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleDateString(activeLocale, { day: 'numeric', month: 'short', year: 'numeric' })
      : (t.date || '—');
    const amtNum = Number(t.amount);
    const safeAmount = Number.isFinite(amtNum) ? amtNum.toFixed(2) : '0.00';
    return [
      formattedDate,
      t.type === 'income' ? 'Income' : 'Expense',
      t.category || '—',
      t.note || '—',
      (t.type === 'income' ? '+' : '-') + symbol + safeAmount,
    ];
  });

  autoTable(doc, {
    startY: summaryY + 28,
    head: [['Date', 'Type', 'Category', 'Note', `Amount (${currency})`]],
    body: tableData,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3.5 },
    headStyles: {
      fillColor: [5, 150, 105],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 22 },
      2: { cellWidth: 33 },
      3: { cellWidth: 70 },
      4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [250, 248, 255] },
    willDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const val = data.cell.raw || '';
        doc.setTextColor(val.startsWith('+') ? 16 : 239, val.startsWith('+') ? 185 : 68, val.startsWith('+') ? 129 : 68);
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body') doc.setTextColor(30, 30, 60);
    },
  });

  // ── Footer ───────────────────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 180);
    doc.text(
      `© ${new Date().getFullYear()} MyCoinwise · Page ${i} of ${pageCount}`,
      105, 290, { align: 'center' }
    );
  }

  const now = new Date();
  const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  doc.save(`MyCoinwise_${user?.username || 'Report'}_${dateStamp}.pdf`);
}
