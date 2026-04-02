export const getQuotationHtml = (quotation: any): string => {

  const fmt = (amount: number | string): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '₹\u00a00';
    return '₹\u00a0' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const fmtDate = (d: any): string | null =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : null;

  const today = fmtDate(new Date())!;
  const issueDate = fmtDate(quotation.issueDate) || today;
  const expiryDate = fmtDate(quotation.expiryDate);

  // Build pricing rows — skip zero/missing entries
  const pricingRows: { label: string; amount: number }[] = [
    { label: 'Base price', amount: parseFloat(quotation.basePrice) || 0 },
    ...(quotation.plc ? [{ label: 'Preferential location charge (PLC)', amount: parseFloat(quotation.plc) || 0 }] : []),
    ...(quotation.parking ? [{ label: 'Parking charges', amount: parseFloat(quotation.parking) || 0 }] : []),
    ...(quotation.clubMembership ? [{ label: 'Club membership', amount: parseFloat(quotation.clubMembership) || 0 }] : []),
    ...(Array.isArray(quotation.otherCharges)
      ? (quotation.otherCharges as { label: string; amount: any }[]).map(c => ({ label: c.label, amount: parseFloat(c.amount) || 0 }))
      : []),
  ].filter(r => r.amount > 0);

  const subtotal = pricingRows.reduce((s, r) => s + r.amount, 0);
  const gstRate = quotation.gstRate ?? 5;
  const gstAmount = quotation.gstAmount != null ? parseFloat(quotation.gstAmount) : subtotal * (gstRate / 100);
  const stampDuty = parseFloat(quotation.stampDuty) || 0;
  const discount = parseFloat(quotation.discount) || 0;
  const grandTotal = subtotal + gstAmount + stampDuty - discount;

  const pricingRowsHtml = pricingRows.map((row, i) => `
    <tr class="${i % 2 === 1 ? 'row-alt' : ''}">
      <td class="row-label">${row.label}</td>
      <td class="row-amount">${fmt(row.amount)}</td>
    </tr>`).join('');

  const unitMeta: { label: string; value: string }[] = [
    { label: 'Project', value: quotation.projectName || '' },
    { label: 'Unit no.', value: quotation.unitNumber || '' },
    { label: 'Floor / Tower', value: quotation.floorTower || '' },
    { label: 'Type', value: quotation.unitType || '' },
    { label: 'Carpet area', value: quotation.carpetArea ? `${Number(quotation.carpetArea).toLocaleString('en-IN')} sq ft` : '' },
    { label: 'Super built-up', value: quotation.superBuiltUp ? `${Number(quotation.superBuiltUp).toLocaleString('en-IN')} sq ft` : '' },
  ].filter(m => m.value);

  const unitMetaHtml = unitMeta.map(m => `
    <tr>
      <td class="meta-label">${m.label}</td>
      <td class="meta-value">${m.value}</td>
    </tr>`).join('');

  const pillItems = [
    quotation.paymentPlan ? { label: 'Payment plan', value: quotation.paymentPlan } : null,
    expiryDate ? { label: 'Valid until', value: expiryDate } : null,
    quotation.possession ? { label: 'Est. possession', value: quotation.possession } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const pillsHtml = pillItems.map(p => `
    <div class="pill">
      <div class="pill-label">${p.label}</div>
      <div class="pill-value">${p.value}</div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cost Sheet — ${quotation.quotationNumber || 'CS-0001'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Inter:wght@400;500;600&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --brand:    #027b88;
      --brand-dk: #015f69;
      --brand-lt: #e5f4f6;
      --brand-md: #9fd2d8;
      --ink:      #0c1c1f;
      --muted:    #5a7b80;
      --line:     #dce8ea;
      --surface:  #f3fafb;
      --white:    #ffffff;
      --red:      #c0392b;
    }

    body {
      font-family: 'Inter', sans-serif;
      background: var(--white);
      color: var(--ink);
      font-size: 13px;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Left brand stripe ── */
    .stripe {
      position: fixed;
      left: 0; top: 0; bottom: 0;
      width: 5px;
      background: var(--brand);
    }

    /* ── Page wrapper ── */
    .page {
      margin-left: 5px;
      padding: 44px 52px 60px 52px;
    }

    /* ══ HEADER ══ */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
    }

    .company-name {
      font-family: 'Playfair Display', serif;
      font-size: 26px;
      font-weight: 600;
      color: var(--brand-dk);
      letter-spacing: -0.3px;
      line-height: 1.1;
    }

    .company-sub {
      font-size: 11px;
      color: var(--muted);
      margin-top: 5px;
      letter-spacing: 0.2px;
    }

    .doc-meta { text-align: right; }

    .doc-type {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: var(--brand);
      margin-bottom: 5px;
    }

    .doc-number {
      font-family: 'Playfair Display', serif;
      font-size: 26px;
      font-weight: 600;
      color: var(--ink);
      line-height: 1.1;
      letter-spacing: -0.3px;
    }

    .doc-dates {
      margin-top: 6px;
      font-size: 11px;
      color: var(--muted);
      line-height: 1.9;
    }

    .expiry { color: var(--red); font-weight: 500; }

    /* ── Rule ── */
    hr.rule { border: none; border-top: 1px solid var(--line); margin: 0 0 28px; }

    /* ══ INFO STRIP ══ */
    .info-strip {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      margin-bottom: 32px;
    }

    .info-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-top: 3px solid var(--brand);
      border-radius: 0 0 8px 8px;
      padding: 16px 18px;
    }

    .card-title {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--brand);
      margin-bottom: 10px;
    }

    .buyer-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--ink);
      margin-bottom: 5px;
    }

    .buyer-detail {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.8;
    }

    table.unit-table { width: 100%; border-collapse: collapse; }

    .meta-label {
      font-size: 11px;
      color: var(--muted);
      padding: 3px 0;
      width: 44%;
      vertical-align: top;
    }

    .meta-value {
      font-size: 12px;
      font-weight: 500;
      color: var(--ink);
      padding: 3px 0;
    }

    /* ══ SECTION HEADING ══ */
    .sec-head {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--brand);
      padding-bottom: 8px;
      border-bottom: 2px solid var(--brand-md);
      margin-bottom: 0;
    }

    /* ══ PRICING TABLE ══ */
    .pricing-table { width: 100%; border-collapse: collapse; }

    .pricing-table thead tr { background: var(--brand); }

    .pricing-table thead th {
      padding: 11px 16px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--white);
      text-align: left;
    }

    .pricing-table thead th:last-child { text-align: right; }

    .pricing-table tbody tr { border-bottom: 1px solid var(--line); }

    .row-alt { background: var(--surface); }

    .row-label { padding: 12px 16px; font-size: 13px; color: var(--ink); }

    .row-amount {
      padding: 12px 16px;
      text-align: right;
      font-size: 13px;
      font-weight: 500;
      color: var(--ink);
      white-space: nowrap;
    }

    /* ══ TOTALS ══ */
    .totals-outer { display: flex; justify-content: flex-end; }

    .totals-table { width: 300px; border-collapse: collapse; }

    .totals-table td {
      padding: 9px 16px;
      font-size: 13px;
      border-bottom: 1px solid var(--line);
    }

    .totals-table tr:last-child td { border-bottom: none; }

    .t-label { color: var(--muted); }

    .t-value { text-align: right; font-weight: 500; white-space: nowrap; }

    .t-deduct .t-value { color: var(--red); }

    .t-grand td {
      background: var(--brand);
      color: var(--white);
      font-size: 14px;
      font-weight: 600;
      padding: 13px 16px;
      border-bottom: none;
    }

    .t-grand td:last-child { text-align: right; }

    /* ══ PILLS ══ */
    .pills-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 28px;
    }

    .pill {
      border: 1px solid var(--brand-md);
      background: var(--brand-lt);
      border-radius: 6px;
      padding: 9px 14px;
    }

    .pill-label {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--brand);
      margin-bottom: 3px;
    }

    .pill-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
    }

    /* ══ NOTES ══ */
    .notes-block {
      margin-top: 28px;
      padding: 14px 18px;
      background: var(--surface);
      border-left: 3px solid var(--brand);
      border-radius: 0 8px 8px 0;
    }

    .notes-title {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--brand);
      margin-bottom: 7px;
    }

    .notes-block p {
      font-size: 12px;
      color: var(--muted);
      white-space: pre-wrap;
      line-height: 1.7;
    }

    /* ══ SIGNATURES ══ */
    .sig-strip {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      margin-top: 56px;
    }

    .sig-box { border-top: 1px solid var(--line); padding-top: 10px; }

    .sig-label { font-size: 11px; color: var(--muted); }

    .sig-name { font-size: 13px; font-weight: 600; color: var(--ink); margin-top: 2px; }

    /* ══ FOOTER ══ */
    .footer {
      margin-top: 44px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .footer-left { font-size: 11px; color: var(--muted); line-height: 1.8; }

    .footer-right { text-align: right; font-size: 10px; color: #a8c8cb; line-height: 1.8; }
  </style>
</head>
<body>

<div class="stripe"></div>

<div class="page">

  <!-- ── Header ── -->
  <div class="header">
    <div>
      <div class="company-name">${quotation.tenantName || 'Softaro CRM'}</div>
      <div class="company-sub">${quotation.tenantTagline || 'Sales &amp; Marketing'}</div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Cost Sheet</div>
      <div class="doc-number">${quotation.quotationNumber || 'CS-0001'}</div>
      <div class="doc-dates">
        <div>Issued: ${issueDate}</div>
        ${expiryDate ? `<div class="expiry">Valid until: ${expiryDate}</div>` : ''}
      </div>
    </div>
  </div>

  <hr class="rule" />

  <!-- ── Buyer + Unit ── -->
  <div class="info-strip">

    <div class="info-card">
      <div class="card-title">Prepared for</div>
      <div class="buyer-name">${quotation.lead?.name || 'Buyer Name'}</div>
      <div class="buyer-detail">
        ${[quotation.lead?.phone, quotation.lead?.email, quotation.lead?.address].filter(Boolean).join('<br/>')}
      </div>
    </div>

    <div class="info-card">
      <div class="card-title">Unit details</div>
      <table class="unit-table">
        ${unitMetaHtml}
      </table>
    </div>

  </div>

  <!-- ── Pricing ── -->
  <div class="sec-head">Pricing breakup</div>

  <table class="pricing-table">
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${pricingRowsHtml}
    </tbody>
  </table>

  <!-- ── Totals ── -->
  <div class="totals-outer">
    <table class="totals-table">
      <tr>
        <td class="t-label">Sub-total</td>
        <td class="t-value">${fmt(subtotal)}</td>
      </tr>
      <tr>
        <td class="t-label">GST @ ${gstRate}%</td>
        <td class="t-value">${fmt(gstAmount)}</td>
      </tr>
      ${stampDuty > 0 ? `
      <tr>
        <td class="t-label">Stamp duty &amp; registration</td>
        <td class="t-value">${fmt(stampDuty)}</td>
      </tr>` : ''}
      ${discount > 0 ? `
      <tr class="t-deduct">
        <td class="t-label">Discount</td>
        <td class="t-value">− ${fmt(discount)}</td>
      </tr>` : ''}
      <tr class="t-grand">
        <td>Total payable</td>
        <td>${fmt(grandTotal)}</td>
      </tr>
    </table>
  </div>

  <!-- ── Pills ── -->
  ${pillsHtml ? `<div class="pills-row">${pillsHtml}</div>` : ''}

  <!-- ── Notes ── -->
  ${quotation.notes || quotation.terms ? `
  <div class="notes-block">
    <div class="notes-title">Notes &amp; terms</div>
    ${quotation.notes ? `<p>${quotation.notes}</p>` : ''}
    ${quotation.terms ? `<p style="margin-top:6px;">${quotation.terms}</p>` : ''}
  </div>` : ''}

  <!-- ── Signatures ── -->
  <div class="sig-strip">
    <div class="sig-box">
      <div class="sig-label">Authorised signatory</div>
      <div class="sig-name">${quotation.tenantName || 'Company Name'}</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Buyer acknowledgement</div>
      <div class="sig-name" style="color:var(--muted);font-weight:400;">Signature &amp; date</div>
    </div>
  </div>

  <!-- ── Footer ── -->
  <div class="footer">
    <div class="footer-left">
      <div style="font-weight:600;color:var(--ink);">${quotation.tenantName || 'Softaro CRM'}</div>
      ${quotation.tenantAddress ? `<div>${quotation.tenantAddress}</div>` : ''}
      ${quotation.tenantPhone ? `<div>${quotation.tenantPhone}</div>` : ''}
      ${quotation.tenantEmail ? `<div>${quotation.tenantEmail}</div>` : ''}
    </div>
    <div class="footer-right">
      <div>This is a computer-generated document.</div>
      <div>Generated on ${today} · Softaro CRM</div>
    </div>
  </div>

</div>
</body>
</html>`;
};