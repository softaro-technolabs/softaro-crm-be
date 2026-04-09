export const getLeadNotificationTemplate = (data: {
    leadName: string;
    leadEmail?: string;
    leadPhone?: string;
    leadSource: string;
    requirementType: string;
    notes?: string;
    dashboardUrl: string;
    recipientName: string;
    isAssignee: boolean;
    isRecapture?: boolean;
}) => {
    const {
        leadName,
        leadEmail,
        leadPhone,
        leadSource,
        requirementType,
        notes,
        dashboardUrl,
        recipientName,
        isAssignee,
        isRecapture
    } = data;

    const year = new Date().getFullYear();
    const roleText = isAssignee 
        ? (isRecapture ? 're-assigned/re-captured for you' : 'assigned to you')
        : (isRecapture ? 're-captured in your system' : 'captured in your system');
    
    const badgeText = isRecapture ? 'Lead Re-captured' : (isAssignee ? 'Assigned to You' : 'New Lead');

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>New Lead — Softaro CRM</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
    body { margin: 0 !important; padding: 0 !important; background-color: #edf4f5; width: 100% !important; }
    table { border-collapse: collapse !important; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { text-decoration: none; }
    body, td, th { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; }

    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .pad-mobile { padding: 28px 20px !important; }
      .hero-pad { padding: 32px 24px 28px !important; }
      .footer-pad { padding: 16px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#edf4f5;width:100%;">

<!-- Hidden preheader -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#edf4f5;line-height:1px;">
  ${isRecapture ? 'RE-CAPTURED: ' : 'New lead '} ${leadName} has been ${roleText} in Softaro CRM.
  &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#edf4f5;">
  <tr>
    <td align="center" style="padding:32px 16px 48px;">

      <!-- TOP BAR -->
      <table class="email-container" role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">
        <tr>
          <td style="padding:0 4px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <!-- Logo -->
                <td valign="middle">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td valign="middle" style="padding-right:9px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td width="30" height="30" bgcolor="#027b88" style="border-radius:7px;text-align:center;vertical-align:middle;background-color:#027b88;">
                              <span style="font-size:14px;font-weight:700;color:#ffffff;line-height:30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">S</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td valign="middle">
                        <span style="font-size:15px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">Softaro CRM</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- Badge -->
                <td align="right" valign="middle">
                  <span style="font-size:10px;font-weight:700;color: ${isRecapture ? '#b45309' : '#027b88'};background-color: ${isRecapture ? '#fef3c7' : '#dff0f2'};padding:4px 12px;border-radius:100px;letter-spacing:0.9px;text-transform:uppercase;border:1px solid ${isRecapture ? '#f59e0b' : '#b3d8db'};">${badgeText}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- MAIN CARD -->
      <table class="email-container" role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;background-color:#ffffff;border-radius:16px;border:1px solid #c4dce0;">

        <!-- HERO -->
        <tr>
          <td bgcolor="${isRecapture ? '#b45309' : '#027b88'}" style="background-color:${isRecapture ? '#b45309' : '#027b88'};padding:40px 40px 34px;border-radius:15px 15px 0 0;" class="hero-pad">
            <p style="margin:0 0 10px;font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);letter-spacing:1.8px;text-transform:uppercase;">
              Lead Notification
            </p>
            <p style="margin:0 0 2px;font-size:13px;font-weight:300;color:rgba(255,255,255,0.85);letter-spacing:-0.1px;">
              ${isRecapture ? 'Existing lead' : 'New lead'} has been ${roleText}
            </p>
            <p style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.6px;line-height:1.15;">
              ${leadName}
            </p>
            <!-- accent line -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
              <tr>
                <td width="36" height="2" bgcolor="rgba(255,255,255,0.25)" style="background-color:rgba(255,255,255,0.25);border-radius:1px;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:36px 40px 32px;background-color:#ffffff;" class="pad-mobile">

            <p style="margin:0 0 6px;font-size:15px;color:#374151;line-height:1.6;">
              Hello, <strong style="color:#0f172a;font-weight:600;">${recipientName}</strong>
            </p>
            <p style="margin:0 0 28px;font-size:13.5px;color:#64748b;line-height:1.75;">
              ${isRecapture 
                ? `An existing lead has <strong style="color:#0f172a;font-weight:600;">re-submitted their interest</strong>. Their record has been merged and reactivated.` 
                : `A new lead has been <strong style="color:#0f172a;font-weight:600;">${roleText}</strong> in Softaro CRM.`
              }
              Review the updated details below.
            </p>

            <!-- LEAD INFO TABLE -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #c4dce0;border-radius:12px;margin-bottom:26px;">

              <!-- Table header -->
              <tr>
                <td colspan="2" bgcolor="#dff0f2" style="background-color:#dff0f2;padding:10px 20px;border-radius:12px 12px 0 0;border-bottom:1px solid #b3d8db;">
                  <span style="font-size:10px;font-weight:700;color:#027b88;text-transform:uppercase;letter-spacing:1px;">
                    Lead Information ${isRecapture ? '(Updated)' : ''}
                  </span>
                </td>
              </tr>

              <!-- Name -->
              <tr>
                <td valign="top" style="padding:16px 0 12px 20px;width:130px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.7px;line-height:1.4;">Name</p>
                </td>
                <td valign="middle" style="padding:14px 20px 12px 12px;border-bottom:1px solid #e2e8f0;">
                  <span style="font-size:13.5px;font-weight:600;color:#0f172a;">${leadName}</span>
                </td>
              </tr>

              ${leadEmail ? `
              <!-- Email -->
              <tr>
                <td valign="top" style="padding:14px 0 12px 20px;width:130px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.7px;line-height:1.4;">Email</p>
                </td>
                <td valign="middle" style="padding:12px 20px 12px 12px;border-bottom:1px solid #e2e8f0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #c4dce0;border-radius:6px;padding:6px 12px;">
                        <span style="font-size:12.5px;font-weight:500;color:#0f172a;font-family:'Courier New',Courier,monospace;">${leadEmail}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>` : ''}

              ${leadPhone ? `
              <!-- Phone -->
              <tr>
                <td valign="top" style="padding:14px 0 12px 20px;width:130px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.7px;line-height:1.4;">Phone</p>
                </td>
                <td valign="middle" style="padding:12px 20px 12px 12px;border-bottom:1px solid #e2e8f0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #c4dce0;border-radius:6px;padding:6px 12px;">
                        <span style="font-size:12.5px;font-weight:500;color:#0f172a;font-family:'Courier New',Courier,monospace;">${leadPhone}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>` : ''}

              <!-- Source -->
              <tr>
                <td valign="top" style="padding:14px 0 12px 20px;width:130px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.7px;line-height:1.4;">Source</p>
                </td>
                <td valign="middle" style="padding:12px 20px 12px 12px;border-bottom:1px solid #e2e8f0;">
                  <span style="font-size:10px;font-weight:700;color:#027b88;background-color:#dff0f2;padding:3px 10px;border-radius:100px;letter-spacing:0.6px;text-transform:uppercase;border:1px solid #b3d8db;">${leadSource}</span>
                </td>
              </tr>

              <!-- Requirement -->
              <tr>
                <td valign="top" style="padding:14px 0 12px 20px;width:130px;${notes ? 'border-bottom:1px solid #e2e8f0;' : ''}">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.7px;line-height:1.4;">Requirement</p>
                </td>
                <td valign="middle" style="padding:12px 20px 12px 12px;${notes ? 'border-bottom:1px solid #e2e8f0;' : ''}">
                  <span style="font-size:13px;font-weight:500;color:#0f172a;text-transform:capitalize;">${requirementType}</span>
                </td>
              </tr>

              ${notes ? `
              <!-- Notes -->
              <tr>
                <td valign="top" style="padding:14px 0 14px 20px;width:130px;">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.7px;line-height:1.4;">Notes</p>
                </td>
                <td valign="top" style="padding:12px 20px 14px 12px;">
                  <p style="margin:0;font-size:13px;color:#475569;line-height:1.65;">${notes}</p>
                </td>
              </tr>` : ''}

            </table>
            <!-- end lead info -->

            <p style="margin:0 0 20px;font-size:13px;color:#64748b;line-height:1.65;">
              Open your dashboard to view full details, add notes, or update the lead status.
            </p>

            <!-- CTA BUTTON -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
              <tr>
                <td bgcolor="#027b88" style="border-radius:10px;background-color:#027b88;">
                  <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${dashboardUrl}" style="height:46px;v-text-anchor:middle;width:210px;" arcsize="22%" fillcolor="#027b88" strokecolor="none"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">View Lead Details &rarr;</center></v:roundrect><![endif]-->
                  <!--[if !mso]><!-->
                  <a href="${dashboardUrl}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#ffffff;background-color:#027b88;border-radius:10px;text-decoration:none;letter-spacing:-0.1px;">
                    View Lead Details &nbsp;&rarr;
                  </a>
                  <!--<![endif]-->
                </td>
              </tr>
            </table>

            <!-- Divider -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;">
              <tr>
                <td height="1" bgcolor="#e2e8f0" style="background-color:#e2e8f0;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- HELP NOTE -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
              <tr>
                <td valign="top" width="46" style="padding:15px 0 15px 16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="22" height="22" bgcolor="#dff0f2" style="background-color:#dff0f2;border:1.5px solid #b3d8db;border-radius:50%;text-align:center;vertical-align:middle;">
                        <span style="font-size:11px;font-weight:700;color:#027b88;line-height:22px;">!</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td valign="middle" style="padding:15px 18px 15px 4px;">
                  <p style="margin:0;font-size:12.5px;color:#64748b;line-height:1.65;">
                    ${isAssignee
            ? (isRecapture ? 'This lead (already assigned to you) has re-submitted a form. Stay updated on their latest requirements.' : 'This lead has been assigned to you. Please follow up as soon as possible to maximize conversion.')
            : 'This is an automated notification. You are receiving this because you manage leads in this system.'}
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td bgcolor="#f8fafc" style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 40px;border-radius:0 0 15px 15px;" class="footer-pad">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle">
                  <p style="margin:0;font-size:11px;color:#94a3b8;">
                    &copy; ${year} <strong style="color:#64748b;font-weight:700;">Softaro CRM</strong> &mdash; All rights reserved.
                  </p>
                </td>
                <td valign="middle" align="right">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding-right:14px;">
                        <a href="#" style="font-size:11px;color:#94a3b8;text-decoration:none;">Privacy Policy</a>
                      </td>
                      <td>
                        <a href="#" style="font-size:11px;color:#94a3b8;text-decoration:none;">Help Center</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
      <!-- end card -->

    </td>
  </tr>
</table>

</body>
</html>`;
};