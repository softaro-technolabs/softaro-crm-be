export interface UserInvitationTemplateData {
  email: string;
  name: string;
  organization: string;
  loginUrl: string;
  password?: string;
}

export const getUserInvitationTemplate = (data: UserInvitationTemplateData): string => {
  const { email, name, organization, loginUrl, password } = data;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>Welcome to ${organization} — EstateOS</title>
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
      .hero-pad { padding: 36px 24px 32px !important; }
      .footer-pad { padding: 18px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#edf4f5;width:100%;">

<!-- Hidden preheader -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#edf4f5;line-height:1px;">
  You've been invited to ${organization} on EstateOS. Your account is ready.
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
                <td valign="middle">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td valign="middle" style="padding-right:9px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td width="30" height="30" bgcolor="#027b88" style="border-radius:7px;text-align:center;vertical-align:middle;background-color:#027b88;">
                              <span style="font-size:14px;font-weight:700;color:#ffffff;line-height:30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">E</span>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td valign="middle">
                        <span style="font-size:15px;font-weight:700;color:#0f1a1b;letter-spacing:-0.3px;">EstateOS</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td align="right" valign="middle">
                  <span style="font-size:10px;font-weight:700;color:#027b88;background-color:#dff0f2;padding:4px 12px;border-radius:100px;letter-spacing:0.9px;text-transform:uppercase;border:1px solid #b3d8db;">Invitation</span>
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
          <td bgcolor="#027b88" style="background-color:#027b88;padding:44px 40px 38px;border-radius:15px 15px 0 0;" class="hero-pad">
            <p style="margin:0 0 10px;font-size:10px;font-weight:600;color:rgba(255,255,255,0.5);letter-spacing:1.8px;text-transform:uppercase;">
              You're invited
            </p>
            <p style="margin:0 0 2px;font-size:13px;font-weight:300;color:rgba(255,255,255,0.85);letter-spacing:-0.1px;">
              Welcome to
            </p>
            <p style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.6px;line-height:1.15;">
              ${organization}
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

            <p style="margin:0 0 6px;font-size:15px;color:#374848;line-height:1.6;">
              Hello, <strong style="color:#0f1a1b;font-weight:600;">${name}</strong>
            </p>
            <p style="margin:0 0 28px;font-size:13.5px;color:#587070;line-height:1.75;">
              You've been added to <strong style="color:#0f1a1b;font-weight:600;">${organization}</strong> on EstateOS.
              Your account is ready — log in below to access your dashboard and start managing your workflow.
            </p>

            <!-- CREDENTIALS TABLE -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f9fa;border:1px solid #c4dce0;border-radius:12px;margin-bottom:26px;">

              <!-- Credentials header -->
              <tr>
                <td colspan="2" bgcolor="#daeef0" style="background-color:#daeef0;padding:10px 20px;border-radius:12px 12px 0 0;border-bottom:1px solid #c4dce0;">
                  <span style="font-size:10px;font-weight:700;color:#027b88;text-transform:uppercase;letter-spacing:1px;">
                    Login Credentials
                  </span>
                </td>
              </tr>

              <!-- Email -->
              <tr>
                <td valign="top" style="padding:18px 0 ${password ? '8px' : '18px'} 20px;width:120px;">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#7a9ea0;text-transform:uppercase;letter-spacing:0.7px;line-height:1.4;">
                    Email /<br>Login ID
                  </p>
                </td>
                <td valign="top" style="padding:16px 20px ${password ? '8px' : '16px'} 12px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #cce0e2;border-radius:6px;padding:7px 12px;">
                        <span style="font-size:13px;font-weight:500;color:#0f1a1b;font-family:'Courier New',Courier,monospace;">${email}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              ${password ? `
              <!-- Password -->
              <tr>
                <td valign="top" style="padding:8px 0 18px 20px;width:120px;">
                  <p style="margin:0;font-size:10px;font-weight:700;color:#7a9ea0;text-transform:uppercase;letter-spacing:0.7px;line-height:1.4;">
                    Temp<br>Password
                  </p>
                </td>
                <td valign="top" style="padding:6px 20px 16px 12px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td bgcolor="#e4f5f6" style="background-color:#e4f5f6;border:1px solid #a8d4d8;border-radius:6px;padding:7px 14px;">
                        <span style="font-size:13px;font-weight:700;color:#027b88;font-family:'Courier New',Courier,monospace;letter-spacing:0.5px;">${password}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              ` : ''}

            </table>
            <!-- end credentials -->

            <p style="margin:0 0 20px;font-size:13px;color:#587070;line-height:1.65;">
              ${password
      ? 'For security, please update your password after your first login.'
      : 'Click the button below to access your dashboard.'}
            </p>

            <!-- CTA BUTTON -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
              <tr>
                <td bgcolor="#027b88" style="border-radius:10px;background-color:#027b88;">
                  <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${loginUrl}" style="height:46px;v-text-anchor:middle;width:210px;" arcsize="22%" fillcolor="#027b88" strokecolor="none"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;">Open Dashboard &rarr;</center></v:roundrect><![endif]-->
                  <!--[if !mso]><!-->
                  <a href="${loginUrl}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#ffffff;background-color:#027b88;border-radius:10px;text-decoration:none;letter-spacing:-0.1px;">
                    Open Dashboard &nbsp;&rarr;
                  </a>
                  <!--<![endif]-->
                </td>
              </tr>
            </table>

            <!-- Divider -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;">
              <tr>
                <td height="1" bgcolor="#e2ecee" style="background-color:#e2ecee;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- HELP NOTE -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fbfb;border:1px solid #dbe9ea;border-radius:10px;">
              <tr>
                <td valign="top" width="46" style="padding:15px 0 15px 16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="22" height="22" bgcolor="#daeef0" style="background-color:#daeef0;border:1.5px solid #a8d4d8;border-radius:50%;text-align:center;vertical-align:middle;">
                        <span style="font-size:11px;font-weight:700;color:#027b88;line-height:22px;">?</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td valign="middle" style="padding:15px 18px 15px 4px;">
                  <p style="margin:0;font-size:12.5px;color:#587070;line-height:1.65;">
                    Questions or trouble logging in? Simply reply to this email and our team will get back to you promptly.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td bgcolor="#eef6f7" style="background-color:#eef6f7;border-top:1px solid #ccdfe1;padding:18px 40px;border-radius:0 0 15px 15px;" class="footer-pad">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle">
                  <p style="margin:0;font-size:11px;color:#7a9ea0;">
                    &copy; ${year} <strong style="color:#3d6b6d;font-weight:700;">EstateOS</strong> &mdash; All rights reserved.
                  </p>
                </td>
                <td valign="middle" align="right">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="padding-right:14px;">
                        <a href="#" style="font-size:11px;color:#7a9ea0;text-decoration:none;">Privacy Policy</a>
                      </td>
                      <td>
                        <a href="#" style="font-size:11px;color:#7a9ea0;text-decoration:none;">Help Center</a>
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