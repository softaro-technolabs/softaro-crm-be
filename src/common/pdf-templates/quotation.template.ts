export const getQuotationHtml = (quotation: any) => {
  const itemsHtml = quotation.items.map((item: any) => `
    <tr>
      <td>${item.description}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${item.unitPrice}</td>
      <td style="text-align: center;">${item.taxRate}%</td>
      <td style="text-align: right;">${item.total}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Quotation ${quotation.quotationNumber}</title>
      <style>
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 40px;
          color: #334155;
          line-height: 1.5;
        }
        .header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
          border-bottom: 2px solid #f1f5f9;
          padding-bottom: 20px;
        }
        .company-info h1 {
          margin: 0;
          color: #0f172a;
          font-size: 24px;
        }
        .quotation-title {
          text-align: right;
        }
        .quotation-title h2 {
          margin: 0;
          color: #2563eb;
          font-size: 32px;
          letter-spacing: -1px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-bottom: 40px;
        }
        .info-box h3 {
          margin: 0 0 10px 0;
          font-size: 14px;
          text-transform: uppercase;
          color: #64748b;
          letter-spacing: 1px;
        }
        .info-box p {
          margin: 2px 0;
          font-size: 15px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        th {
          background-color: #f8fafc;
          padding: 12px 15px;
          text-align: left;
          font-size: 13px;
          text-transform: uppercase;
          color: #64748b;
          border-bottom: 1px solid #e2e8f0;
        }
        td {
          padding: 15px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 14px;
        }
        .totals {
          margin-left: auto;
          width: 250px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
        }
        .total-row.grand {
          border-top: 2px solid #f1f5f9;
          margin-top: 10px;
          padding-top: 15px;
          font-weight: 700;
          font-size: 18px;
          color: #0f172a;
        }
        .notes {
          margin-top: 60px;
          padding: 20px;
          background-color: #f8fafc;
          border-radius: 8px;
        }
        .notes h4 {
          margin: 0 0 10px 0;
          font-size: 14px;
          color: #1e293b;
        }
        .notes p {
          margin: 0;
          font-size: 13px;
          color: #64748b;
          white-space: pre-wrap;
        }
        .footer {
          margin-top: 80px;
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-info">
          <h1>${quotation.tenantName || 'Softaro CRM'}</h1>
          <p>Sales Team</p>
        </div>
        <div class="quotation-title">
          <h2>QUOTATION</h2>
          <p style="font-weight: 600;"># ${quotation.quotationNumber}</p>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <h3>Bill To</h3>
          <p><strong>${quotation.lead?.name || 'Customer'}</strong></p>
          <p>${quotation.lead?.email || ''}</p>
          <p>${quotation.lead?.phone || ''}</p>
        </div>
        <div class="info-box" style="text-align: right;">
          <h3>Details</h3>
          <p>Date: ${new Date(quotation.issueDate).toLocaleDateString()}</p>
          ${quotation.expiryDate ? `<p>Valid Until: ${new Date(quotation.expiryDate).toLocaleDateString()}</p>` : ''}
          <p>Currency: ${quotation.currency}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 45%;">Description</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Price</th>
            <th style="text-align: center;">Tax</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span>Subtotal</span>
          <span>${quotation.subTotal}</span>
        </div>
        <div class="total-row">
          <span>Discount</span>
          <span style="color: #ef4444;">-${quotation.discountTotal}</span>
        </div>
        <div class="total-row">
          <span>Tax</span>
          <span style="color: #10b981;">+${quotation.taxTotal}</span>
        </div>
        <div class="total-row grand">
          <span>Grand Total</span>
          <span>${quotation.currency} ${quotation.grandTotal}</span>
        </div>
      </div>

      ${quotation.notes || quotation.terms ? `
        <div class="notes">
          <h4>Notes & Terms</h4>
          <p>${quotation.notes || ''}</p>
          ${quotation.terms ? `<p style="margin-top: 10px;">${quotation.terms}</p>` : ''}
        </div>
      ` : ''}

      <div class="footer">
        <p>Thank you for your business!</p>
        <p>This is a computer generated document.</p>
      </div>
    </body>
    </html>
  `;
};
