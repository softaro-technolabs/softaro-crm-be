export const getFollowupReminderTemplate = (data: {
    leadName: string;
    leadEmail?: string;
    leadPhone?: string;
    followupDate: string;
    followupTime: string;
    dashboardUrl: string;
    recipientName: string;
    notes?: string;
    isOverdue: boolean;
}) => {
    const {
        leadName,
        leadEmail,
        leadPhone,
        followupDate,
        followupTime,
        dashboardUrl,
        recipientName,
        notes,
        isOverdue
    } = data;

    const year = new Date().getFullYear();
    const primaryColor = isOverdue ? '#dc2626' : '#027b88';
    const secondaryColor = isOverdue ? '#fee2e2' : '#dff0f2';
    const badgeText = isOverdue ? 'Follow-up Overdue' : 'Follow-up Due Today';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Follow-up Reminder — Softaro CRM</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background-color: #edf4f5; margin: 0; padding: 0; }
    .email-container { max-width: 580px; margin: 32px auto; background: white; border-radius: 16px; border: 1px solid #c4dce0; overflow: hidden; }
    .hero { background-color: ${primaryColor}; padding: 40px; color: white; }
    .badge { display: inline-block; font-size: 10px; font-weight: 700; color: ${primaryColor}; background-color: ${secondaryColor}; padding: 4px 12px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.9px; border: 1px solid ${primaryColor}40; margin-bottom: 20px; }
    .content { padding: 40px; }
    .info-card { background-color: #f8fafc; border: 1px solid #c4dce0; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .info-row { display: flex; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
    .info-row:last-child { border-bottom: none; }
    .label { width: 120px; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.7px; }
    .value { font-size: 13.5px; font-weight: 600; color: #0f172a; }
    .btn { display: inline-block; padding: 14px 30px; font-size: 14px; font-weight: 700; color: #ffffff; background-color: ${primaryColor}; border-radius: 10px; text-decoration: none; margin-top: 10px; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 40px; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="hero">
      <span class="badge" style="background-color: white; color: ${primaryColor};">${badgeText}</span>
      <h1 style="margin: 0; font-size: 28px; letter-spacing: -0.6px;">Reminder: ${leadName}</h1>
      <p style="margin: 10px 0 0; font-size: 15px; opacity: 0.9;">Time to re-connect with your prospect.</p>
    </div>
    <div class="content">
      <p style="color: #374151;">Hello <strong>${recipientName}</strong>,</p>
      <p style="color: #64748b; line-height: 1.6;">A follow-up was scheduled for this lead. Please ensure you reach out to maintain engagement and move the deal forward.</p>
      
      <div class="info-card">
        <div style="font-size: 10px; font-weight: 700; color: ${primaryColor}; text-transform: uppercase; margin-bottom: 15px;">Schedule Details</div>
        <div style="display: table; width: 100%;">
          <div style="display: table-row;">
            <div style="display: table-cell; padding-bottom: 12px; color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; width: 110px;">Date</div>
            <div style="display: table-cell; padding-bottom: 12px; color: #0f172a; font-weight: 600;">${followupDate}</div>
          </div>
          <div style="display: table-row;">
            <div style="display: table-cell; padding-bottom: 12px; color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase;">Time</div>
            <div style="display: table-cell; padding-bottom: 12px; color: #0f172a; font-weight: 600;">${followupTime}</div>
          </div>
          <div style="display: table-row;">
            <div style="display: table-cell; padding-bottom: 12px; color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase;">Lead</div>
            <div style="display: table-cell; padding-bottom: 12px; color: #0f172a; font-weight: 600;">${leadName}</div>
          </div>
          ${leadPhone ? `
          <div style="display: table-row;">
            <div style="display: table-cell; padding-bottom: 12px; color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase;">Phone</div>
            <div style="display: table-cell; padding-bottom: 12px; color: #0f172a; font-weight: 600;">${leadPhone}</div>
          </div>` : ''}
          ${notes ? `
          <div style="display: table-row;">
            <div style="display: table-cell; color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase;">Last Note</div>
            <div style="display: table-cell; color: #475569; font-size: 13px; font-style: italic;">"${notes}"</div>
          </div>` : ''}
        </div>
      </div>
      
      <a href="${dashboardUrl}" class="btn">View Lead & Log Activity &rarr;</a>
    </div>
    <div class="footer">
      <p>&copy; ${year} Softaro CRM. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
};
