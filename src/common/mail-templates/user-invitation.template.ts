export interface UserInvitationTemplateData {
  email: string;
  name: string;
  organization: string;
  loginUrl: string;
  password?: string;
}

export const getUserInvitationTemplate = (data: UserInvitationTemplateData): string => {
  const { email, name, organization, loginUrl, password } = data;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ${organization} — EstateOS</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          background-color: #f0f4f5;
          color: #0f1a1b;
          -webkit-font-smoothing: antialiased;
          padding: 40px 16px 60px;
        }

        .wrapper {
          max-width: 600px;
          margin: 0 auto;
        }

        /* ── Top bar ── */
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
          padding: 0 4px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 9px;
          text-decoration: none;
        }

        .logo-mark {
          width: 32px;
          height: 32px;
          background: #027b88;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .logo-mark svg {
          width: 18px;
          height: 18px;
        }

        .logo-name {
          font-size: 15px;
          font-weight: 600;
          color: #0f1a1b;
          letter-spacing: -0.2px;
        }

        .topbar-tag {
          font-size: 11px;
          font-weight: 500;
          color: #027b88;
          background: #e6f5f6;
          padding: 4px 10px;
          border-radius: 100px;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        /* ── Card ── */
        .card {
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid #d9e8ea;
        }

        /* ── Hero ── */
        .hero {
          background: #027b88;
          padding: 48px 40px 44px;
          position: relative;
          overflow: hidden;
        }

        .hero-pattern {
          position: absolute;
          inset: 0;
          opacity: 0.07;
          background-image:
            radial-gradient(circle at 70% 30%, #ffffff 1px, transparent 1px),
            radial-gradient(circle at 20% 80%, #ffffff 1px, transparent 1px);
          background-size: 40px 40px, 60px 60px;
        }

        .hero-label {
          font-size: 11px;
          font-weight: 500;
          color: rgba(255,255,255,0.6);
          letter-spacing: 1.2px;
          text-transform: uppercase;
          margin-bottom: 12px;
          position: relative;
        }

        .hero-title {
          font-size: 28px;
          font-weight: 300;
          color: #ffffff;
          letter-spacing: -0.5px;
          line-height: 1.25;
          position: relative;
        }

        .hero-title strong {
          font-weight: 600;
          display: block;
        }

        .hero-divider {
          width: 36px;
          height: 2px;
          background: rgba(255,255,255,0.3);
          margin-top: 20px;
          position: relative;
        }

        /* ── Body ── */
        .body {
          padding: 40px 40px 36px;
        }

        .greeting {
          font-size: 16px;
          color: #374848;
          line-height: 1.7;
          margin-bottom: 10px;
        }

        .greeting strong {
          color: #0f1a1b;
          font-weight: 600;
        }

        .intro {
          font-size: 14px;
          color: #5c7070;
          line-height: 1.75;
          margin-bottom: 32px;
        }

        /* ── Credentials box ── */
        .credentials {
          background: #f5fafb;
          border: 1px solid #c8dee0;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 32px;
        }

        .credentials-header {
          padding: 12px 20px;
          background: #eaf5f6;
          border-bottom: 1px solid #c8dee0;
          font-size: 11px;
          font-weight: 600;
          color: #027b88;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        .credentials-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .cred-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .cred-label {
          font-size: 12px;
          font-weight: 500;
          color: #7a9ea0;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          flex-shrink: 0;
        }

        .cred-value {
          font-family: 'DM Mono', 'Courier New', monospace;
          font-size: 13px;
          font-weight: 500;
          color: #0f1a1b;
          background: #ffffff;
          border: 1px solid #d0e4e6;
          padding: 6px 12px;
          border-radius: 6px;
          letter-spacing: 0.2px;
          word-break: break-all;
          text-align: right;
        }

        .cred-value.password {
          color: #027b88;
          background: #eaf5f6;
          border-color: #b3d8db;
        }

        /* ── CTA ── */
        .cta-section {
          margin-bottom: 36px;
        }

        .cta-note {
          font-size: 13px;
          color: #5c7070;
          margin-bottom: 18px;
          line-height: 1.65;
        }

        .cta-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #027b88;
          color: #ffffff;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.1px;
          line-height: 1;
          transition: background 0.15s ease;
        }

        .cta-arrow {
          font-size: 16px;
          opacity: 0.85;
        }

        /* ── Divider ── */
        .section-divider {
          height: 1px;
          background: #e5edef;
          margin: 32px 0;
        }

        /* ── Help note ── */
        .help-note {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: #fafbfb;
          border: 1px solid #e0eaeb;
          border-radius: 10px;
          padding: 16px 18px;
        }

        .help-icon {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #e6f5f6;
          border: 1.5px solid #b3d8db;
          color: #027b88;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .help-text {
          font-size: 13px;
          color: #5c7070;
          line-height: 1.65;
        }

        /* ── Footer ── */
        .footer {
          padding: 24px 40px;
          background: #f7fbfb;
          border-top: 1px solid #d9e8ea;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .footer-brand {
          font-size: 12px;
          color: #7a9ea0;
        }

        .footer-brand strong {
          color: #3d6b6d;
          font-weight: 600;
        }

        .footer-links {
          display: flex;
          gap: 16px;
        }

        .footer-links a {
          font-size: 12px;
          color: #7a9ea0;
          text-decoration: none;
        }

        @media (max-width: 520px) {
          .hero { padding: 36px 24px 32px; }
          .body { padding: 28px 24px 24px; }
          .footer { padding: 20px 24px; flex-direction: column; align-items: flex-start; }
          .cred-row { flex-direction: column; align-items: flex-start; }
          .cred-value { text-align: left; width: 100%; }
        }
      </style>
    </head>
    <body>
      <div class="wrapper">

        <!-- Top bar -->
        <div class="topbar">
          <div class="logo">
            <div class="logo-mark">
              <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 2L15.5 5.5V12.5L9 16L2.5 12.5V5.5L9 2Z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
                <path d="M9 7.5V11M7 9.5H11" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="logo-name">EstateOS</span>
          </div>
          <span class="topbar-tag">Invitation</span>
        </div>

        <!-- Card -->
        <div class="card">

          <!-- Hero -->
          <div class="hero">
            <div class="hero-pattern"></div>
            <div class="hero-label">You're invited</div>
            <div class="hero-title">
              Welcome to<br>
              <strong>${organization}</strong>
            </div>
            <div class="hero-divider"></div>
          </div>

          <!-- Body -->
          <div class="body">

            <p class="greeting">Hello, <strong>${name}</strong></p>
            <p class="intro">
              You've been added to <strong>${organization}</strong> on EstateOS.
              Your account is ready — log in below to access your dashboard and
              start managing your workflow.
            </p>

            <!-- Credentials -->
            <div class="credentials">
              <div class="credentials-header">Login Credentials</div>
              <div class="credentials-body">
                <div class="cred-row">
                  <span class="cred-label">Email / Login ID</span>
                  <span class="cred-value">${email}</span>
                </div>
                ${password ? `
                <div class="cred-row">
                  <span class="cred-label">Temp Password</span>
                  <span class="cred-value password">${password}</span>
                </div>
                ` : ''}
              </div>
            </div>

            <!-- CTA -->
            <div class="cta-section">
              <p class="cta-note">
                ${password
      ? 'For security, we recommend updating your password after your first login.'
      : 'Click below to access your dashboard. If you have trouble logging in, reply to this email.'
    }
              </p>
              <a href="${loginUrl}" class="cta-button">
                Open Dashboard
                <span class="cta-arrow">→</span>
              </a>
            </div>

            <div class="section-divider"></div>

            <!-- Help note -->
            <div class="help-note">
              <div class="help-icon">?</div>
              <p class="help-text">
                Questions or trouble logging in? Simply reply to this email and our
                team will get back to you promptly.
              </p>
            </div>

          </div>

          <!-- Footer -->
          <div class="footer">
            <span class="footer-brand">
              &copy; ${new Date().getFullYear()} <strong>EstateOS</strong> — All rights reserved.
            </span>
            <div class="footer-links">
              <a href="#">Privacy Policy</a>
              <a href="#">Help Center</a>
            </div>
          </div>

        </div>
      </div>
    </body>
    </html>
  `;
};