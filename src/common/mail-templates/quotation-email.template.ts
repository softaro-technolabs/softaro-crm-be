export interface QuotationEmailTemplateData {
  customerName: string;
  quotationNumber: string;
  projectName: string;
  unitNumber: string;
  amount: string;
  senderName: string;
  companyName: string;
  expiryDate?: string;
}

export const getQuotationEmailTemplate = (data: QuotationEmailTemplateData): string => {
  const { customerName, quotationNumber, projectName, unitNumber, amount, senderName, companyName, expiryDate } = data;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quotation ${quotationNumber} — ${companyName}</title>
  <style>
    * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
    body { margin: 0 !important; padding: 0 !important; background-color: #f3f6f7; width: 100% !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; }
    table { border-collapse: collapse !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    .email-container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e1e9eb; border-radius: 12px; overflow: hidden; }
    .header { background-color: #027b88; padding: 32px 40px; color: #ffffff; }
    .content { padding: 40px; }
    .footer { padding: 24px 40px; background-color: #f8fbfb; border-top: 1px solid #e1e9eb; font-size: 11px; color: #7a9ea0; }
    .button { display: inline-block; padding: 14px 32px; background-color: #027b88; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 24px; }
    .details-card { background-color: #f4f9fa; border: 1px solid #d4e2e4; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .detail-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .detail-label { color: #587070; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .detail-value { color: #0c1c1f; font-size: 14px; font-weight: 600; }
    p { margin: 0 0 16px; font-size: 15px; color: #374848; line-height: 1.6; }
  </style>
</head>
<body style="margin:0;padding:24px 0;background-color:#f3f6f7;">
  <div class="email-container">
    <div class="header">
      <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; opacity: 0.8;">NEW QUOTATION</div>
      <div style="font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Proposal ${quotationNumber}</div>
    </div>
    
    <div class="content">
      <p>Dear <strong>${customerName}</strong>,</p>
      <p>Thank you for your interest in <strong>${projectName}</strong>. We are pleased to share the cost sheet for Unit <strong>${unitNumber}</strong> as per our discussion.</p>
      
      <div class="details-card">
        <div class="detail-row">
          <span class="detail-label">Project</span>
          <span class="detail-value">${projectName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Unit Number</span>
          <span class="detail-value">${unitNumber}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Total Amount</span>
          <span class="detail-value">${amount}</span>
        </div>
        ${expiryDate ? `
        <div class="detail-row">
          <span class="detail-label">Valid Until</span>
          <span class="detail-value" style="color: #c0392b;">${expiryDate}</span>
        </div>
        ` : ''}
      </div>
      
      <p>We have attached the detailed PDF cost sheet for your reference. Please review it and let us know if you have any questions or would like to proceed with the next steps.</p>
      
      <p style="margin-top: 32px;">Best regards,<br/>
      <strong>${senderName}</strong><br/>
      ${companyName}</p>
    </div>
    
    <div class="footer">
      <div>&copy; ${year} ${companyName} · Real Estate CRM. All rights reserved.</div>
      <div style="margin-top: 8px;">This is an automated email regarding your property inquiry.</div>
    </div>
  </div>
</body>
</html>`;
};
