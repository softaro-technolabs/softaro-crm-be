export const getQuotationHtml = (quotation: any): string => {

  // ─── Formatters ───────────────────────────────────────────────────────────────

  const fmt = (n: number | string): string => {
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (isNaN(num) || num === 0) return '₹ 0';
    return '₹ ' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const fmtDate = (d: any): string =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  // ─── Amount in words (Indian system) ─────────────────────────────────────────

  const toWords = (n: number): string => {
    if (!n || isNaN(n) || n <= 0) return '';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
      'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
      'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two   = (x: number) => x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
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

  const today      = fmtDate(new Date());
  const issueDate  = fmtDate(quotation.issueDate) || today;
  const expiryDate = fmtDate(quotation.expiryDate);

  const basePrice           = parseFloat(quotation.basePrice)           || 0;
  const plc                 = parseFloat(quotation.plc)                 || 0;
  const parking             = parseFloat(quotation.parking)             || 0;
  const clubMembership      = parseFloat(quotation.clubMembership)      || 0;
  const gstRate             = parseFloat(quotation.gstRate)             || 5;
  const gstAmount           = parseFloat(quotation.gstAmount)           || 0;
  const stampDuty           = parseFloat(quotation.stampDuty)           || 0;
  const registrationCharges = parseFloat(quotation.registrationCharges) || 0;
  const discount            = parseFloat(quotation.discount)            || 0;

  const otherCharges: { label: string; amount: number }[] = Array.isArray(quotation.otherCharges)
    ? quotation.otherCharges
        .map((c: any) => ({ label: c.label, amount: parseFloat(c.amount) || 0 }))
        .filter((c: any) => c.amount > 0)
    : [];

  const otherTotal     = otherCharges.reduce((s, c) => s + c.amount, 0);
  const agreementValue = basePrice + plc + parking + clubMembership + otherTotal;
  const grandTotal     = agreementValue + gstAmount + stampDuty + registrationCharges - discount;

  const carpetAreaNum = quotation.carpetArea ? parseFloat(quotation.carpetArea) : 0;
  const pricePerSqft  = carpetAreaNum > 0 && basePrice > 0 ? Math.round(basePrice / carpetAreaNum) : 0;

  // ─── Unit meta ────────────────────────────────────────────────────────────────

  const unitMeta = [
    { label: 'Project',        value: quotation.projectName || '' },
    { label: 'Unit No.',       value: quotation.unitNumber  || '' },
    { label: 'Floor / Tower',  value: quotation.floorTower  || '' },
    { label: 'Unit Type',      value: quotation.unitType    || '' },
    { label: 'Carpet Area',    value: carpetAreaNum > 0 ? `${carpetAreaNum.toLocaleString('en-IN')} sq.ft` : '' },
    { label: 'Super Built-up', value: quotation.superBuiltUp ? `${Number(quotation.superBuiltUp).toLocaleString('en-IN')} sq.ft` : '' },
    { label: 'Possession',     value: quotation.possession  || '' },
  ].filter(m => m.value);

  const unitMetaHtml = unitMeta.map(m => `
    <tr>
      <td class="meta-label">${m.label}</td>
      <td class="meta-sep">:</td>
      <td class="meta-value">${m.value}</td>
    </tr>`).join('');

  // ─── Pricing rows ─────────────────────────────────────────────────────────────

  const pricingRows = [
    {
      label: 'Basic Sale Price',
      sub: pricePerSqft > 0
        ? `@ ₹ ${pricePerSqft.toLocaleString('en-IN')} per sq.ft &times; ${carpetAreaNum.toLocaleString('en-IN')} sq.ft`
        : undefined,
      amount: basePrice,
    },
    ...(plc            > 0 ? [{ label: 'Preferential Location Charges (PLC)', amount: plc }]            : []),
    ...(parking        > 0 ? [{ label: 'Parking Charges',                     amount: parking }]        : []),
    ...(clubMembership > 0 ? [{ label: 'Club Membership',                     amount: clubMembership }] : []),
    ...otherCharges.map(c  => ({ label: c.label,                              amount: c.amount })),
  ].filter(r => r.amount > 0);

  const pricingRowsHtml = pricingRows.map((row, i) => `
    <tr class="${i % 2 === 1 ? 'row-alt' : ''}">
      <td class="row-label">
        ${row.label}
        ${'sub' in row && row.sub ? `<span class="row-sub">${row.sub}</span>` : ''}
      </td>
      <td class="row-amount">${fmt(row.amount)}</td>
    </tr>`).join('');

  // ─── Statutory rows ───────────────────────────────────────────────────────────

  const statutoryRows: { label: string; amount: number; deduct?: boolean }[] = [
    { label: `GST @ ${gstRate}% on Agreement Value`, amount: gstAmount },
    ...(stampDuty           > 0 ? [{ label: 'Stamp Duty',            amount: stampDuty }]           : []),
    ...(registrationCharges > 0 ? [{ label: 'Registration Charges',  amount: registrationCharges }] : []),
    ...(discount            > 0 ? [{ label: 'Discount / Concession', amount: discount, deduct: true }] : []),
  ];

  const statutoryRowsHtml = statutoryRows.map((row, i) => `
    <tr class="${row.deduct ? 'row-deduct' : (i % 2 === 1 ? 'row-alt' : '')}">
      <td class="row-label row-stat-label">${row.label}</td>
      <td class="row-amount row-stat-amount">${row.deduct ? '&minus; ' : ''}${fmt(row.amount)}</td>
    </tr>`).join('');

  // ─── Pills ────────────────────────────────────────────────────────────────────

  const pills = [
    ...(pricePerSqft     > 0 ? [{ label: 'Rate / Sq.Ft', value: `₹ ${pricePerSqft.toLocaleString('en-IN')}` }] : []),
    ...(quotation.paymentPlan  ? [{ label: 'Payment Plan', value: quotation.paymentPlan }]  : []),
    ...(quotation.possession   ? [{ label: 'Possession',   value: quotation.possession }]   : []),
    ...(expiryDate             ? [{ label: 'Valid Until',  value: expiryDate }]             : []),
  ];

  const pillsHtml = pills.map(p => `
    <div class="pill">
      <div class="pill-label">${p.label}</div>
      <div class="pill-value">${p.value}</div>
    </div>`).join('');

  const reraNo = quotation.reraNumber || quotation.tenantReraNumber || 'RERA/XXXXX/XXXXX/XXXX';

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
      --navy:    #1B2D4F;
      --navy-lt: #243B60;
      --gold:    #C9A227;
      --gold-lt: #FDF8EC;
      --gold-bd: #E8D5A3;
      --green:   #065F46;
      --red:     #B91C1C;
      --line:    #E2E8F0;
      --surface: #F8FAFC;
      --ink:     #1A202C;
      --muted:   #718096;
      --white:   #FFFFFF;
    }

    /*
     * PAGE BORDER — box-shadow on html element is the most reliable technique
     * in Puppeteer. It renders on every page and stays within the margin zone.
     * inset spread of -5mm keeps it inside the 12mm margin area.
     */
    html {
      box-shadow: inset 0 0 0 1.5px rgba(27, 45, 79, 0.35);
    }

    /* Gold corner marks — position: fixed works reliably for corner pins */
    .corner {
      position: fixed;
      width: 10px;
      height: 10px;
      background: var(--gold);
      z-index: 999;
      pointer-events: none;
    }
    .c-tl { top: 0;    left: 0;    border-radius: 0 0 3px 0; }
    .c-tr { top: 0;    right: 0;   border-radius: 0 0 0 3px; }
    .c-bl { bottom: 0; left: 0;    border-radius: 0 3px 0 0; }
    .c-br { bottom: 0; right: 0;   border-radius: 3px 0 0 0; }

    /* Watermark — very subtle, only readable up close */
    .watermark {
      position: fixed;
      top: 46%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-28deg);
      font-size: 58px;
      font-weight: 800;
      color: rgba(27, 45, 79, 0.055);
      letter-spacing: 10px;
      text-transform: uppercase;
      pointer-events: none;
      z-index: 0;
      white-space: nowrap;
      user-select: none;
    }

    body {
      font-family: 'Inter', sans-serif;
      background: var(--white);
      color: var(--ink);
      font-size: 11.5px;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page { position: relative; z-index: 1; }

    /* ══ HEADER ══ */
    .header {
      background: var(--navy);
      padding: 20px 26px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .company-name {
      font-size: 20px;
      font-weight: 800;
      color: var(--white);
      letter-spacing: -0.4px;
      line-height: 1.15;
    }

    .company-tagline {
      font-size: 9.5px;
      font-weight: 500;
      color: var(--gold);
      letter-spacing: 0.4px;
      margin-top: 3px;
    }

    .hdr-right { text-align: right; }

    .doc-type-label {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: var(--gold);
      margin-bottom: 3px;
    }

    .doc-number {
      font-size: 19px;
      font-weight: 800;
      color: var(--white);
      letter-spacing: -0.4px;
    }

    .doc-dates {
      margin-top: 4px;
      font-size: 9.5px;
      color: rgba(255,255,255,0.5);
      line-height: 1.8;
    }

    .doc-expiry { color: #FCA5A5; font-weight: 600; }

    /* ══ RERA STRIP ══ */
    .rera-strip {
      background: var(--navy-lt);
      padding: 7px 26px;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      border-top: 1px solid rgba(255,255,255,0.07);
    }

    .ri {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-right: 16px;
      margin-right: 16px;
      border-right: 1px solid rgba(255,255,255,0.12);
    }

    .ri:last-child { border-right: none; margin-right: 0; padding-right: 0; }

    .ri-label {
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 1.8px;
      text-transform: uppercase;
      color: var(--gold);
    }

    .ri-value {
      font-size: 9.5px;
      font-weight: 600;
      color: rgba(255,255,255,0.9);
    }

    /* ══ CONTENT ══ */
    .content { padding: 16px 26px 0; }

    /* ══ INFO GRID ══ */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }

    .info-card {
      border: 1px solid var(--line);
      border-radius: 7px;
      overflow: hidden;
    }

    .info-card-hdr { background: var(--navy); padding: 6px 13px; }

    .info-card-title {
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: var(--gold);
    }

    .info-card-body { padding: 11px 13px; }

    .buyer-name {
      font-size: 13.5px;
      font-weight: 700;
      color: var(--ink);
      margin-bottom: 4px;
    }

    .buyer-detail { font-size: 10.5px; color: var(--muted); line-height: 1.8; }

    table.unit-table { width: 100%; border-collapse: collapse; }
    .meta-label { font-size: 9.5px; color: var(--muted); padding: 2.5px 0; width: 38%; }
    .meta-sep   { font-size: 9.5px; color: var(--line);  padding: 2.5px 4px; }
    .meta-value { font-size: 10px;  font-weight: 600; color: var(--ink); padding: 2.5px 0; }

    /* ══ SECTION HEADER ══ */
    .sec-hdr {
      background: var(--navy);
      padding: 7px 13px;
      border-radius: 6px 6px 0 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .sec-title {
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: var(--white);
    }

    .sec-note { font-size: 9px; color: rgba(255,255,255,0.38); }

    /* ══ PRICING TABLE ══ */
    .pricing-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid var(--line);
      border-top: none;
      margin-bottom: 14px;
    }

    .pricing-table tbody tr { border-bottom: 1px solid var(--line); }
    .pricing-table tbody tr:last-child { border-bottom: none; }
    .row-alt { background: var(--surface); }

    .row-label  { padding: 9px 13px; font-size: 11px; color: var(--ink); }
    .row-sub    { display: block; font-size: 9px; color: var(--muted); font-weight: 400; margin-top: 1px; }
    .row-amount { padding: 9px 13px; text-align: right; font-size: 11px; font-weight: 600; color: var(--ink); white-space: nowrap; }

    /* Agreement Value */
    .row-agr { background: var(--gold-lt) !important; }
    .row-agr td { border-top: 2px solid var(--gold-bd) !important; border-bottom: 2px solid var(--gold-bd) !important; }
    .row-agr .row-label  { font-size: 11.5px; font-weight: 700; color: var(--green); }
    .row-agr .row-amount { font-size: 11.5px; font-weight: 800; color: var(--green); }

    /* Statutory */
    .row-stat-label  { color: var(--muted); font-size: 10.5px; }
    .row-stat-amount { color: var(--muted); font-weight: 500; }
    .row-deduct .row-stat-label  { color: var(--red); font-weight: 600; }
    .row-deduct .row-stat-amount { color: var(--red); font-weight: 700; }

    /* ══ GRAND TOTAL ══ */
    .grand-block {
      background: var(--navy);
      border-radius: 8px;
      padding: 17px 22px;
      margin-bottom: 14px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
    }

    .gt-label {
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: var(--gold);
      margin-bottom: 6px;
    }

    .gt-amount {
      font-size: 28px;
      font-weight: 800;
      color: var(--white);
      letter-spacing: -1.5px;
      line-height: 1;
    }

    .gt-words {
      font-size: 9px;
      color: rgba(255,255,255,0.36);
      margin-top: 6px;
      font-style: italic;
      line-height: 1.5;
      max-width: 340px;
    }

    .gt-badge {
      display: inline-block;
      background: var(--gold);
      color: var(--navy);
      font-size: 7.5px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 3px;
      margin-bottom: 6px;
    }

    .gt-incl {
      font-size: 9px;
      color: rgba(255,255,255,0.26);
      line-height: 1.8;
      text-align: right;
    }

    /* ══ PILLS ══ */
    .pills-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }

    .pill {
      flex: 1;
      min-width: 90px;
      border: 1px solid var(--gold-bd);
      background: var(--gold-lt);
      border-radius: 5px;
      padding: 8px 12px;
    }

    .pill-label {
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #92400E;
      margin-bottom: 3px;
    }

    .pill-value { font-size: 11.5px; font-weight: 700; color: var(--ink); }

    /* ══ NOTES ══ */
    .notes-block {
      border: 1px solid var(--line);
      border-left: 4px solid var(--navy);
      border-radius: 0 5px 5px 0;
      padding: 10px 14px;
      margin-bottom: 14px;
      background: var(--surface);
    }

    .notes-title {
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--navy);
      margin-bottom: 5px;
    }

    .notes-text { font-size: 10px; color: var(--muted); white-space: pre-wrap; line-height: 1.75; }

    /* ══ DISCLAIMER ══ */
    .disclaimer {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      border-radius: 5px;
      padding: 9px 13px;
      margin-bottom: 14px;
    }

    .disclaimer-title {
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #92400E;
      margin-bottom: 4px;
    }

    .disclaimer-text { font-size: 9px; color: #78350F; line-height: 1.7; }

    /* ══ SIGNATURES — kept together, page-break-inside: avoid ══ */
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .sig-box {
      border: 1px solid var(--line);
      border-radius: 6px;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .sig-hdr { background: var(--surface); border-bottom: 1px solid var(--line); padding: 6px 13px; }

    .sig-hdr-title {
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--muted);
    }

    .sig-body { padding: 12px 13px 13px; }

    .sig-seal {
      width: 48px;
      height: 48px;
      border: 2px dashed #CBD5E0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 7px;
      color: #CBD5E0;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-align: center;
      margin-bottom: 18px;
      line-height: 1.3;
    }

    .sig-space { height: 30px; margin-bottom: 8px; }
    .sig-line  { border-top: 1.5px solid var(--ink); padding-top: 5px; }
    .sig-name  { font-size: 11px; font-weight: 700; color: var(--ink); }
    .sig-role  { font-size: 9px; color: var(--muted); margin-top: 1px; }
    .sig-date  { font-size: 9px; color: var(--muted); margin-top: 4px; }
  </style>
</head>
<body>

<!-- Gold corner marks — appear on every page via position:fixed -->
<div class="corner c-tl"></div>
<div class="corner c-tr"></div>
<div class="corner c-bl"></div>
<div class="corner c-br"></div>

<!-- Subtle watermark -->
<div class="watermark">COST SHEET</div>

<div class="page">

  <!-- ══ HEADER ══ -->
  <div class="header">
    <div>
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
    ${quotation.projectName ? `<div class="ri"><span class="ri-label">Project</span><span class="ri-value">${quotation.projectName}</span></div>` : ''}
    <div class="ri"><span class="ri-label">RERA No.</span><span class="ri-value">${reraNo}</span></div>
    ${quotation.unitNumber  ? `<div class="ri"><span class="ri-label">Unit</span><span class="ri-value">${quotation.unitNumber}</span></div>` : ''}
    <div class="ri"><span class="ri-label">All Amounts In</span><span class="ri-value">Indian Rupees (INR)</span></div>
  </div>

  <!-- ══ CONTENT ══ -->
  <div class="content">

    <!-- Info cards -->
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
            ${unitMetaHtml || '<tr><td class="meta-label" colspan="3" style="color:var(--muted)">—</td></tr>'}
          </table>
        </div>
      </div>
    </div>

    <!-- Pricing table -->
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

    <!-- Grand total -->
    <div class="grand-block">
      <div>
        <div class="gt-label">Total Amount Payable</div>
        <div class="gt-amount">${fmt(grandTotal)}</div>
        ${grandTotal > 0 ? `<div class="gt-words">${toWords(Math.round(grandTotal))}</div>` : ''}
      </div>
      <div style="text-align:right;">
        <div class="gt-badge">All Inclusive</div>
        <div class="gt-incl">
          Base &middot; PLC &middot; Parking<br/>
          GST &middot; Stamp Duty &middot; Registration
        </div>
      </div>
    </div>

    <!-- Pills -->
    ${pills.length > 0 ? `<div class="pills-row">${pillsHtml}</div>` : ''}

    <!-- Notes & Terms -->
    ${(quotation.notes || quotation.terms) ? `
    <div class="notes-block">
      <div class="notes-title">Notes &amp; Terms</div>
      ${quotation.notes ? `<p class="notes-text">${quotation.notes}</p>` : ''}
      ${quotation.terms ? `<p class="notes-text" style="margin-top:6px;">${quotation.terms}</p>` : ''}
    </div>` : ''}

    <!-- Disclaimer -->
    <div class="disclaimer">
      <div class="disclaimer-title">Important Disclaimer</div>
      <div class="disclaimer-text">
        This cost sheet is indicative and prepared for discussion purposes only. All prices are subject to revision by management
        without prior notice. Final amounts will be confirmed in the registered Agreement for Sale / Allotment Letter. GST, stamp duty,
        registration charges and other statutory levies are applicable as per government norms prevailing at the time of execution.
        This document does not constitute a legal offer or binding commitment. Subject to RERA — ${reraNo}.
      </div>
    </div>

    <!-- Signatures — page-break-inside: avoid keeps both boxes together -->
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
</div><!-- /page -->

</body>
</html>`;
};
