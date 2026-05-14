import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { getQuotationHtml } from '../common/pdf-templates/quotation.template';

@Injectable()
export class PdfGeneratorService {
  async generateQuotationPdf(quotation: any): Promise<Buffer> {
    const html = getQuotationHtml(quotation);

    const reraNo      = quotation.reraNumber || quotation.tenantReraNumber || 'RERA/XXXXX/XXXXX/XXXX';
    const tenantName  = quotation.tenantName  || 'Company';
    const quotationNo = quotation.quotationNumber || 'CS-0001';
    const gstin       = quotation.tenantGstin || '—';

    // Puppeteer footer — renders at the bottom of EVERY page inside the bottom margin.
    // Inline styles only (page CSS does not apply here). Inter not available; use Arial.
    const footerTemplate = `
      <div style="
        width: 100%; box-sizing: border-box;
        font-family: Arial, sans-serif;
        background: #1B2D4F;
        border-top: 2px solid #C9A227;
        padding: 6px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      ">
        <span style="font-size:10px;font-weight:700;color:#ffffff;">${tenantName}</span>
        <span style="font-size:8.5px;color:#C9A227;font-weight:600;letter-spacing:0.3px;">
          RERA: ${reraNo} &nbsp;|&nbsp; GSTIN: ${gstin} &nbsp;|&nbsp; ${quotationNo}
          &nbsp;&nbsp;
          <span style="color:rgba(255,255,255,0.45);">
            Page <span class="pageNumber"></span> / <span class="totalPages"></span>
          </span>
        </span>
      </div>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      margin: {
        top: '12mm',
        right: '12mm',
        bottom: '16mm',   // must be >= footer height (~12 mm)
        left: '12mm'
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',   // empty — no repeated header needed
      footerTemplate,
    });

    await browser.close();
    return Buffer.from(pdf);
  }
}
