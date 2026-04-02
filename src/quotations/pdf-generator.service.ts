import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { getQuotationHtml } from '../common/pdf-templates/quotation.template';

@Injectable()
export class PdfGeneratorService {
  async generateQuotationPdf(quotation: any): Promise<Buffer> {
    const html = getQuotationHtml(quotation);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      },
      printBackground: true
    });

    await browser.close();
    return Buffer.from(pdf);
  }
}
