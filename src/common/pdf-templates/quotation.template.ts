export const getQuotationHtml = (quotation: any): string => {

  // ─── Formatters ───────────────────────────────────────────────────────────────

  const fmt = (n: number | string): string => {
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (isNaN(num) || num === 0) return '₹ 0';
    return '₹ ' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const fmtDate = (d: any): string =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  // ─── Amount in words (Indian system) ─────────────────────────────────────────

  const toWords = (n: number): string => {
    if (!n || isNaN(n) || n <= 0) return '';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x: number) => x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
    const three = (x: number) => x < 100 ? two(x) : ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' and ' + two(x % 100) : '');
    const cr = Math.floor(n / 10000000);
    const lk = Math.floor((n % 10000000) / 100000);
    const th = Math.floor((n % 100000) / 1000);
    const rm = Math.floor(n % 1000);
    let r = '';
    if (cr) r += three(cr) + ' Crore ';
    if (lk) r += two(lk) + ' Lakh ';
    if (th) r += two(th) + ' Thousand ';
    if (rm) r += three(rm);
    return 'Rupees ' + r.trim() + ' Only';
  };

  // ─── Data ─────────────────────────────────────────────────────────────────────

  const today     = fmtDate(new Date());
  const issueDate = fmtDate(quotation.issueDate) || today;
  const expiryDate = fmtDate(quotation.expiryDate);

  const basePrice          = parseFloat(quotation.basePrice)          || 0;
  const plc                = parseFloat(quotation.plc)                || 0;
  const parking            = parseFloat(quotation.parking)            || 0;
  const clubMembership     = parseFloat(quotation.clubMembership)     || 0;
  const gstRate            = parseFloat(quotation.gstRate)            || 5;
  const gstAmount          = parseFloat(quotation.gstAmount)          || 0;
  const stampDuty          = parseFloat(quotation.stampDuty)          || 0;
  const registrationCharges = parseFloat(quotation.registrationCharges) || 0;
  const discount           = parseFloat(quotation.discount)           || 0;

  const otherCharges: { label: string; amount: number }[] = Array.isArray(quotation.otherCharges)
    ? quotation.otherCharges.map((c: any) => ({ label: c.label, amount: parseFloat(c.amount) || 0 })).filter((c: any) => c.amount > 0)
    : [];

  const otherChargesTotal  = otherCharges.reduce((s, c) => s + c.amount, 0);
  const agreementValue     = basePrice + plc + parking + clubMembership + otherChargesTotal;
  const grandTotal         = agreementValue + gstAmount + stampDuty + registrationCharges - discount;

  // Price per sq.ft
  const carpetAreaNum = quotation.carpetArea ? parseFloat(quotation.carpetArea) : 0;
  const pricePerSqft  = carpetAreaNum > 0 && basePrice > 0 ? Math.round(basePrice / carpetAreaNum) : 0;

  // ─── Unit meta rows ───────────────────────────────────────────────────────────

  const unitMeta: { label: string; value: string }[] = [
    { label: 'Project',       value: quotation.projectName || '' },
    { label: 'Unit No.',      value: quotation.unitNumber  || '' },
    { label: 'Floor / Tower', value: quotation.floorTower  || '' },
    { label: 'Unit Type',     value: quotation.unitType    || '' },
    { label: 'Carpet Area',   value: carpetAreaNum  > 0 ? `${carpetAreaNum.toLocaleString('en-IN')} sq.ft`  : '' },
    { label: 'Super Built-up',value: quotation.superBuiltUp ? `${Number(quotation.superBuiltUp).toLocaleString('en-IN')} sq.ft` : '' },
    { label: 'Possession',    value: quotation.possession  || '' },
  ].filter(m => m.value);

  const unitMetaHtml = unitMeta.map(m => `
    <tr>
      <td class="meta-label">${m.label}</td>
      <td class="meta-sep">:</td>
      <td class="meta-value">${m.value}</td>
    </tr>`).join('');

  // ─── Pricing rows ─────────────────────────────────────────────────────────────

  const pricingRows: { label: string; sub?: string; amount: number }[] = [
    { label: 'Basic Sale Price', sub: pricePerSqft > 0 ? `@ ₹ ${pricePerSqft.toLocaleString('en-IN')} per sq.ft × ${carpetAreaNum.toLocaleString('en-IN')} sq.ft` : undefined, amount: basePrice },
    ...(plc            > 0 ? [{ label: 'Preferential Location Charges (PLC)',   amount: plc }]            : []),
    ...(parking        > 0 ? [{ label: 'Parking Charges',                       amount: parking }]        : []),
    ...(clubMembership > 0 ? [{ label: 'Club Membership',                       amount: clubMembership }] : []),
    ...otherCharges.map(c => ({ label: c.label, amount: c.amount })),
  ].filter(r => r.amount > 0);

  const pricingRowsHtml = pricingRows.map((row, i) => `
    <tr class="${i % 2 === 1 ? 'row-alt' : ''}">
      <td class="row-label">
        ${row.label}
        ${row.sub ? `<span class="row-sub">${row.sub}</span>` : ''}
      </td>
      <td class="row-amount">${fmt(row.amount)}</td>
    </tr>`).join('');

  // ─── Statutory rows ───────────────────────────────────────────────────────────

  const statutoryRows: { label: string; amount: number; deduct?: boolean }[] = [
    { label: `GST @ ${gstRate}% on Agreement Value`, amount: gstAmount },
    ...(stampDuty           > 0 ? [{ label: 'Stamp Duty',              amount: stampDuty }]           : []),
    ...(registrationCharges > 0 ? [{ label: 'Registration Charges',    amount: registrationCharges }] : []),
    ...(discount            > 0 ? [{ label: 'Discount / Concession',   amount: discount, deduct: true }] : []),
  ];

  const statutoryRowsHtml = statutoryRows.map((row, i) => `
    <tr class="${row.deduct ? 'row-deduct' : (i % 2 === 1 ? 'row-alt' : '')}">
      <td class="row-label row-stat-label">${row.label}</td>
      <td class="row-amount row-stat-amount">${row.deduct ? '− ' : ''}${fmt(row.amount)}</td>
    </tr>`).join('');

  // ─── Highlight pills ──────────────────────────────────────────────────────────

  const pills: { label: string; value: string }[] = [
    ...(pricePerSqft      > 0            ? [{ label: 'Rate / sq.ft', value: `₹ ${pricePerSqft.toLocaleString('en-IN')}` }] : []),
    ...(quotation.paymentPlan             ? [{ label: 'Payment Plan',  value: quotation.paymentPlan }]       : []),
    ...(quotation.possession              ? [{ label: 'Possession',    value: quotation.possession }]        : []),
    ...(expiryDate                        ? [{ label: 'Valid Until',   value: expiryDate }]                  : []),
  ];

  const pillsHtml = pills.map(p => `
    <div class="pill">
      <div class="pill-label">${p.label}</div>
      <div class="pill-value">${p.value}</div>
    </div>`).join('');

  // ─── RERA / company extras ────────────────────────────────────────────────────

  const reraNo  = quotation.reraNumber   || quotation.tenantReraNumber   || 'RERA/XXXXX/XXXXX/XXXX';
  const gstin   = quotation.tenantGstin  || '&mdash;';

  // ─── HTML ─────────────────────────────────────────────────────────────────────

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cost Sheet &mdash; ${quotation.quotationNumber || 'CS-0001'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --navy:     #1B2D4F;
      --navy-lt:  #243B60;
      --gold:     #C9A227;
      --gold-lt:  #FDF8EC;
      --gold-bd:  #E8D5A3;
      --green:    #065F46;
      --red:      #B91C1C;
      --line:     #E2E8F0;
      --surface:  #F8FAFC;
      --ink:      #1A202C;
      --muted:    #718096;
      --white:    #FFFFFF;
    }

    body {
      font-family: 'Inter', sans-serif;
      background: var(--white);
      color: var(--ink);
      font-size: 12px;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Watermark ── */
    .watermark {
      position: fixed;
      top: 48%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-32deg);
      font-size: 88px;
      font-weight: 800;
      color: rgba(27, 45, 79, 0.035);
      letter-spacing: 10px;
      text-transform: uppercase;
      pointer-events: none;
      z-index: 0;
      white-space: nowrap;
      user-select: none;
    }

    .page { position: relative; z-index: 1; }

    /* ══ HEADER ══ */
    .header {
      background: var(--navy);
      padding: 26px 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .hdr-left {}

    .company-name {
      font-size: 22px;
      font-weight: 800;
      color: var(--white);
      letter-spacing: -0.4px;
      line-height: 1.15;
    }

    .company-tagline {
      font-size: 10.5px;
      font-weight: 500;
      color: var(--gold);
      letter-spacing: 0.6px;
      margin-top: 5px;
    }

    .hdr-right { text-align: right; }

    .doc-type-label {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: var(--gold);
      margin-bottom: 4px;
    }

    .doc-number {
      font-size: 21px;
      font-weight: 800;
      color: var(--white);
      letter-spacing: -0.4px;
    }

    .doc-dates {
      margin-top: 5px;
      font-size: 10.5px;
      color: rgba(255,255,255,0.5);
      line-height: 1.9;
    }

    .doc-expiry { color: #FCA5A5; font-weight: 600; }

    /* ══ RERA STRIP ══ */
    .rera-strip {
      background: var(--navy-lt);
      padding: 9px 40px;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0;
      border-top: 1px solid rgba(255,255,255,0.08);
    }

    .ri {
      display: flex;
      align-items: center;
      gap: 7px;
      padding-right: 20px;
      margin-right: 20px;
      border-right: 1px solid rgba(255,255,255,0.12);
    }

    .ri:last-child { border-right: none; margin-right: 0; padding-right: 0; }

    .ri-label {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: var(--gold);
    }

    .ri-value {
      font-size: 10.5px;
      font-weight: 600;
      color: rgba(255,255,255,0.9);
    }

    /* ══ CONTENT ══ */
    .content { padding: 24px 40px 0; }

    /* ══ INFO GRID ══ */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 22px;
    }

    .info-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }

    .info-card-hdr {
      background: var(--navy);
      padding: 7px 16px;
    }

    .info-card-title {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: var(--gold);
    }

    .info-card-body { padding: 14px 16px; }

    .buyer-name {
      font-size: 15px;
      font-weight: 700;
      color: var(--ink);
      margin-bottom: 5px;
    }

    .buyer-detail {
      font-size: 11.5px;
      color: var(--muted);
      line-height: 1.9;
    }

    table.unit-table { width: 100%; border-collapse: collapse; }

    .meta-label { font-size: 10.5px; color: var(--muted); padding: 3px 0; width: 38%; }
    .meta-sep   { font-size: 10.5px; color: var(--line);  padding: 3px 4px; }
    .meta-value { font-size: 11px;   font-weight: 600; color: var(--ink); padding: 3px 0; }

    /* ══ SECTION HEADER ══ */
    .sec-hdr {
      background: var(--navy);
      padding: 8px 16px;
      border-radius: 6px 6px 0 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .sec-title {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: var(--white);
    }

    .sec-note {
      font-size: 10px;
      color: rgba(255,255,255,0.45);
    }

    /* ══ PRICING TABLE ══ */
    .pricing-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--line);
      border-top: none;
      margin-bottom: 20px;
    }

    .pricing-table tbody tr { border-bottom: 1px solid var(--line); }
    .pricing-table tbody tr:last-child { border-bottom: none; }

    .row-alt { background: var(--surface); }

    .row-label {
      padding: 11px 16px;
      font-size: 12px;
      color: var(--ink);
    }

    .row-sub {
      display: block;
      font-size: 10px;
      color: var(--muted);
      font-weight: 400;
      margin-top: 2px;
    }

    .row-amount {
      padding: 11px 16px;
      text-align: right;
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
      white-space: nowrap;
    }

    /* Agreement Value highlight */
    .row-agr { background: var(--gold-lt) !important; }
    .row-agr td { border-top: 2px solid var(--gold-bd) !important; border-bottom: 2px solid var(--gold-bd) !important; }
    .row-agr .row-label { font-size: 12.5px; font-weight: 700; color: var(--green); }
    .row-agr .row-amount { font-size: 12.5px; font-weight: 800; color: var(--green); }

    /* Statutory rows */
    .row-stat-label  { color: var(--muted); font-size: 11.5px; }
    .row-stat-amount { color: var(--muted); font-weight: 500; }

    /* Deduct row */
    .row-deduct .row-stat-label  { color: var(--red); font-weight: 600; }
    .row-deduct .row-stat-amount { color: var(--red); font-weight: 700; }

    /* ══ GRAND TOTAL BLOCK ══ */
    .grand-block {
      background: var(--navy);
      border-radius: 10px;
      padding: 22px 28px;
      margin-bottom: 20px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
    }

    .gt-label {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: var(--gold);
      margin-bottom: 8px;
    }

    .gt-amount {
      font-size: 32px;
      font-weight: 800;
      color: var(--white);
      letter-spacing: -1.5px;
      line-height: 1;
    }

    .gt-words {
      font-size: 10px;
      color: rgba(255,255,255,0.4);
      margin-top: 8px;
      font-style: italic;
      line-height: 1.5;
      max-width: 380px;
    }

    .gt-right { text-align: right; }

    .gt-badge {
      display: inline-block;
      background: var(--gold);
      color: var(--navy);
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 5px 13px;
      border-radius: 4px;
      margin-bottom: 8px;
    }

    .gt-incl {
      font-size: 10px;
      color: rgba(255,255,255,0.3);
      line-height: 1.8;
      text-align: right;
    }

    /* ══ HIGHLIGHTS ══ */
    .pills-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    .pill {
      flex: 1;
      min-width: 110px;
      border: 1px solid var(--gold-bd);
      background: var(--gold-lt);
      border-radius: 6px;
      padding: 10px 14px;
    }

    .pill-label {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #92400E;
      margin-bottom: 4px;
    }

    .pill-value {
      font-size: 12.5px;
      font-weight: 700;
      color: var(--ink);
    }

    /* ══ NOTES ══ */
    .notes-block {
      border: 1px solid var(--line);
      border-left: 4px solid var(--navy);
      border-radius: 0 6px 6px 0;
      padding: 14px 18px;
      margin-bottom: 20px;
      background: var(--surface);
    }

    .notes-title {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--navy);
      margin-bottom: 7px;
    }

    .notes-text {
      font-size: 11px;
      color: var(--muted);
      white-space: pre-wrap;
      line-height: 1.8;
    }

    /* ══ DISCLAIMER ══ */
    .disclaimer {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      border-radius: 6px;
      padding: 11px 16px;
      margin-bottom: 20px;
    }

    .disclaimer-title {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #92400E;
      margin-bottom: 5px;
    }

    .disclaimer-text {
      font-size: 10px;
      color: #78350F;
      line-height: 1.75;
    }

    /* ══ SIGNATURES ══ */
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      margin-bottom: 24px;
    }

    .sig-box {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }

    .sig-hdr {
      background: var(--surface);
      border-bottom: 1px solid var(--line);
      padding: 7px 16px;
    }

    .sig-hdr-title {
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--muted);
    }

    .sig-body { padding: 20px 16px 16px; }

    .sig-seal {
      width: 60px;
      height: 60px;
      border: 2px dashed var(--line);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
      color: #CBD5E0;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-align: center;
      margin-bottom: 28px;
      line-height: 1.3;
    }

    .sig-space { height: 48px; margin-bottom: 8px; }

    .sig-line {
      border-top: 1.5px solid var(--ink);
      padding-top: 6px;
    }

    .sig-name { font-size: 12px; font-weight: 700; color: var(--ink); }
    .sig-role { font-size: 10px; color: var(--muted); margin-top: 2px; }
    .sig-date { font-size: 10px; color: var(--muted); margin-top: 6px; }

    /* ══ FOOTER ══ */
    .footer {
      background: var(--navy);
      padding: 14px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
    }

    .footer-company {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--white);
      margin-bottom: 3px;
    }

    .footer-detail {
      font-size: 10px;
      color: rgba(255,255,255,0.45);
      line-height: 1.8;
    }

    .footer-right { text-align: right; }

    .footer-rera {
      font-size: 9.5px;
      font-weight: 600;
      color: var(--gold);
      margin-bottom: 3px;
    }

    .footer-gen {
      font-size: 9px;
      color: rgba(255,255,255,0.3);
      line-height: 1.9;
      letter-spacing: 0.3px;
    }
  </style>
</head>
<body>

<div class="watermark">COST SHEET</div>

<div class="page">

  <!-- ══ HEADER ══ -->
  <div class="header">
    <div class="hdr-left">
      <div class="company-name">${quotation.tenantName || 'Your Company'}</div>
      <div class="company-tagline">${quotation.tenantTagline || 'Real Estate &amp; Property Development'}</div>
    </div>
    <div class="hdr-right">
      <div class="doc-type-label">Cost Sheet</div>
      <div class="doc-number">${quotation.quotationNumber || 'CS-0001'}</div>
      <div class="doc-dates">
        <div>Date of Issue: ${issueDate}</div>
        ${expiryDate ? `<div class="doc-expiry">Valid Until: ${expiryDate}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- ══ RERA STRIP ══ -->
  <div class="rera-strip">
    ${quotation.projectName ? `
    <div class="ri">
      <span class="ri-label">Project</span>
      <span class="ri-value">${quotation.projectName}</span>
    </div>` : ''}
    <div class="ri">
      <span class="ri-label">RERA No.</span>
      <span class="ri-value">${reraNo}</span>
    </div>
    ${quotation.unitNumber ? `
    <div class="ri">
      <span class="ri-label">Unit</span>
      <span class="ri-value">${quotation.unitNumber}</span>
    </div>` : ''}
    <div class="ri">
      <span class="ri-label">All Amounts In</span>
      <span class="ri-value">Indian Rupees (INR)</span>
    </div>
  </div>

  <!-- ══ CONTENT ══ -->
  <div class="content">

    <!-- Info Grid -->
    <div class="info-grid">

      <div class="info-card">
        <div class="info-card-hdr"><div class="info-card-title">Prepared For</div></div>
        <div class="info-card-body">
          <div class="buyer-name">${quotation.lead?.name || 'Prospective Buyer'}</div>
          <div class="buyer-detail">
            ${[quotation.lead?.phone, quotation.lead?.email].filter(Boolean).join('<br/>')}
          </div>
        </div>
      </div>

      <div class="info-card">
        <div class="info-card-hdr"><div class="info-card-title">Unit Specifications</div></div>
        <div class="info-card-body">
          <table class="unit-table">
            ${unitMetaHtml || '<tr><td class="meta-label" colspan="3" style="color:var(--muted);">No unit details provided</td></tr>'}
          </table>
        </div>
      </div>

    </div>

    <!-- Pricing Breakup -->
    ${pricingRows.length > 0 ? `
    <div>
      <div class="sec-hdr">
        <span class="sec-title">Pricing Breakup</span>
        <span class="sec-note">Agreement Value Computation</span>
      </div>
      <table class="pricing-table">
        <tbody>
          ${pricingRowsHtml}
          <tr class="row-agr">
            <td class="row-label">Agreement Value</td>
            <td class="row-amount">${fmt(agreementValue)}</td>
          </tr>
          ${statutoryRowsHtml}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Grand Total -->
    <div class="grand-block">
      <div class="gt-left">
        <div class="gt-label">Total Amount Payable</div>
        <div class="gt-amount">${fmt(grandTotal)}</div>
        ${grandTotal > 0 ? `<div class="gt-words">${toWords(Math.round(grandTotal))}</div>` : ''}
      </div>
      <div class="gt-right">
        <div class="gt-badge">All Inclusive</div>
        <div class="gt-incl">
          Base · PLC · Parking<br/>
          GST · Stamp Duty · Registration
        </div>
      </div>
    </div>

    <!-- Key Highlights -->
    ${pills.length > 0 ? `
    <div class="pills-row">
      ${pillsHtml}
    </div>` : ''}

    <!-- Notes & Terms -->
    ${(quotation.notes || quotation.terms) ? `
    <div class="notes-block">
      <div class="notes-title">Notes &amp; Terms</div>
      ${quotation.notes  ? `<p class="notes-text">${quotation.notes}</p>`                              : ''}
      ${quotation.terms  ? `<p class="notes-text" style="margin-top:8px;">${quotation.terms}</p>`    : ''}
    </div>` : ''}

    <!-- Disclaimer -->
    <div class="disclaimer">
      <div class="disclaimer-title">Important Disclaimer</div>
      <div class="disclaimer-text">
        This cost sheet is indicative and prepared for discussion purposes only. All prices are subject to revision by management without prior notice.
        Final amounts will be confirmed in the registered Agreement for Sale / Allotment Letter. GST, stamp duty, registration charges and other statutory levies are
        applicable as per government norms prevailing at the time of execution. This document does not constitute a legal offer or binding commitment.
        Subject to RERA guidelines — ${reraNo}.
      </div>
    </div>

    <!-- Signatures -->
    <div class="sig-grid">

      <div class="sig-box">
        <div class="sig-hdr"><div class="sig-hdr-title">For &mdash; ${quotation.tenantName || 'Company'}</div></div>
        <div class="sig-body">
          <div class="sig-seal">COMPANY<br/>SEAL</div>
          <div class="sig-line">
            <div class="sig-name">${quotation.tenantName || 'Authorised Signatory'}</div>
            <div class="sig-role">Authorised Signatory</div>
            <div class="sig-date">Date: ___________________</div>
          </div>
        </div>
      </div>

      <div class="sig-box">
        <div class="sig-hdr"><div class="sig-hdr-title">Buyer / Allottee Acknowledgement</div></div>
        <div class="sig-body">
          <div class="sig-space"></div>
          <div class="sig-line">
            <div class="sig-name">${quotation.lead?.name || 'Buyer Name'}</div>
            <div class="sig-role">Signature &amp; Thumb Impression</div>
            <div class="sig-date">Date: ___________________</div>
          </div>
        </div>
      </div>

    </div>

  </div><!-- /content -->

  <!-- ══ FOOTER ══ -->
  <div class="footer">
    <div class="footer-left">
      <div class="footer-company">${quotation.tenantName || 'Your Company'}</div>
      <div class="footer-detail">
        ${[quotation.tenantAddress, quotation.tenantPhone, quotation.tenantEmail].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;')}
      </div>
    </div>
    <div class="footer-right">
      <div class="footer-rera">RERA: ${reraNo}&nbsp;&nbsp;|&nbsp;&nbsp;GSTIN: ${gstin}</div>
      <div class="footer-gen">
        Computer Generated Document &nbsp;·&nbsp; No Signature Required<br/>
        Generated on ${today} &nbsp;·&nbsp; ${quotation.quotationNumber || 'CS-0001'}
      </div>
    </div>
  </div>

</div><!-- /page -->

</body>
</html>`;
};
