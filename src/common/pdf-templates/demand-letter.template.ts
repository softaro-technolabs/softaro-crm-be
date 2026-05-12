import PDFDocument from 'pdfkit';

export interface DemandLetterData {
  letterNumber: string;
  date: string;
  buyerName: string;
  buyerAddress?: string;
  projectName: string;
  unitNumber: string;
  floor?: string;
  totalAmount: number;
  amountDue: number;
  dueDate: string;
  milestoneLabel: string;
  developerName: string;
  developerAddress?: string;
  currency?: string;
}

const fmt = (amount: number, currency = 'INR'): string => {
  if (currency === 'INR') {
    return (
      '₹ ' +
      amount.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  return (
    currency +
    ' ' +
    amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

export async function generateDemandLetterPdf(
  data: DemandLetterData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const currency = data.currency ?? 'INR';
    const doc = new PDFDocument({
      size: 'A4',
      margin: 60,
      info: {
        Title: `Demand Letter - ${data.letterNumber}`,
        Author: data.developerName,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const marginLeft = 60;
    const marginRight = 60;
    const contentWidth = pageWidth - marginLeft - marginRight;

    const brandColor = '#1a5276';
    const accentColor = '#2e86c1';
    const lightGray = '#f2f3f4';
    const darkGray = '#555555';
    const black = '#1a1a1a';

    // ── Header background stripe ──
    doc.rect(0, 0, pageWidth, 110).fill(brandColor);

    // Developer name
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor('#ffffff')
      .text(data.developerName, marginLeft, 28, { width: contentWidth * 0.6 });

    if (data.developerAddress) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#aed6f1')
        .text(data.developerAddress, marginLeft, 56, {
          width: contentWidth * 0.6,
        });
    }

    // DEMAND LETTER title (right side)
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#ffffff')
      .text('DEMAND LETTER', marginLeft, 28, {
        width: contentWidth,
        align: 'right',
      });

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#aed6f1')
      .text(`Ref: ${data.letterNumber}`, marginLeft, 50, {
        width: contentWidth,
        align: 'right',
      })
      .text(`Date: ${data.date}`, marginLeft, 63, {
        width: contentWidth,
        align: 'right',
      });

    // ── Buyer Details ──
    let y = 130;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(darkGray)
      .text('To,', marginLeft, y);

    y += 16;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(black)
      .text(data.buyerName, marginLeft, y);

    if (data.buyerAddress) {
      y += 16;
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(darkGray)
        .text(data.buyerAddress, marginLeft, y, { width: contentWidth * 0.55 });
      y = doc.y + 8;
    } else {
      y += 20;
    }

    // ── Salutation ──
    y += 8;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(black)
      .text(`Dear ${data.buyerName},`, marginLeft, y);

    y += 20;

    // ── Subject line ──
    doc.rect(marginLeft, y, contentWidth, 28).fill(lightGray);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(brandColor)
      .text(
        `Sub: Demand Notice — ${data.projectName} | Unit No. ${data.unitNumber}${data.floor ? ` | Floor: ${data.floor}` : ''}`,
        marginLeft + 10,
        y + 8,
        { width: contentWidth - 20 },
      );

    y += 40;

    // ── Body paragraph ──
    const bodyText =
      `With reference to your booking for Unit No. ${data.unitNumber}` +
      (data.floor ? ` on Floor ${data.floor}` : '') +
      ` in ${data.projectName}, we hereby inform you that the payment installment for the milestone ` +
      `"${data.milestoneLabel}" has now become due as per the agreed payment schedule.\n\n` +
      `We request you to kindly arrange for the payment of the demand amount as mentioned below on or before the due date to avoid any inconvenience.`;

    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(black)
      .text(bodyText, marginLeft, y, {
        width: contentWidth,
        lineGap: 4,
      });

    y = doc.y + 24;

    // ── Amount Table ──
    const tableX = marginLeft + contentWidth * 0.15;
    const tableW = contentWidth * 0.7;
    const colLabel = tableW * 0.55;
    const colValue = tableW * 0.45;
    const rowH = 32;

    // Table header
    doc.rect(tableX, y, tableW, rowH).fill(brandColor);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#ffffff')
      .text('DESCRIPTION', tableX + 12, y + 10, { width: colLabel - 12 })
      .text('AMOUNT', tableX + colLabel + 8, y + 10, {
        width: colValue - 16,
        align: 'right',
      });

    y += rowH;

    // Row 1 – Total Amount
    doc.rect(tableX, y, tableW, rowH).fill(lightGray);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(black)
      .text('Total Consideration Amount', tableX + 12, y + 10, {
        width: colLabel - 12,
      })
      .text(fmt(data.totalAmount, currency), tableX + colLabel + 8, y + 10, {
        width: colValue - 16,
        align: 'right',
      });

    y += rowH;

    // Row 2 – Milestone
    doc.rect(tableX, y, tableW, rowH).fill('#ffffff');
    doc
      .rect(tableX, y, tableW, rowH)
      .stroke('#dde1e4')
      .lineWidth(0.5);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(black)
      .text(`Milestone: ${data.milestoneLabel}`, tableX + 12, y + 10, {
        width: colLabel - 12,
      });

    y += rowH;

    // Row 3 – Amount Due (highlighted)
    doc.rect(tableX, y, tableW, rowH + 4).fill(accentColor);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#ffffff')
      .text('AMOUNT DUE NOW', tableX + 12, y + 10, { width: colLabel - 12 })
      .text(fmt(data.amountDue, currency), tableX + colLabel + 8, y + 10, {
        width: colValue - 16,
        align: 'right',
      });

    y += rowH + 4;

    // Row 4 – Due Date
    doc.rect(tableX, y, tableW, rowH).fill(lightGray);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#922b21')
      .text('Payment Due Date', tableX + 12, y + 10, { width: colLabel - 12 })
      .text(data.dueDate, tableX + colLabel + 8, y + 10, {
        width: colValue - 16,
        align: 'right',
      });

    y += rowH + 20;

    // ── Payment Instructions ──
    doc.rect(marginLeft, y, contentWidth, 2).fill(accentColor);
    y += 10;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(brandColor)
      .text('PAYMENT INSTRUCTIONS', marginLeft, y);

    y += 16;

    const paymentNote =
      `Please ensure payment is made via NEFT / RTGS / Cheque / Demand Draft in favour of "${data.developerName}". ` +
      `Kindly retain your payment receipt for future reference. For any queries, please contact our sales office.\n\n` +
      `Note: Failure to make the payment by the due date may attract interest as per the allotment agreement terms.`;

    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(darkGray)
      .text(paymentNote, marginLeft, y, { width: contentWidth, lineGap: 3 });

    y = doc.y + 30;

    // ── Signature Block ──
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(black)
      .text('Yours faithfully,', marginLeft, y);

    y += 14;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(brandColor)
      .text(`For ${data.developerName}`, marginLeft, y);

    y += 50;
    doc
      .moveTo(marginLeft, y)
      .lineTo(marginLeft + 180, y)
      .stroke('#cccccc');

    y += 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(darkGray)
      .text('Authorized Signatory', marginLeft, y);

    // ── Footer ──
    const footerY = doc.page.height - 50;
    doc
      .moveTo(marginLeft, footerY - 8)
      .lineTo(pageWidth - marginRight, footerY - 8)
      .stroke('#cccccc');

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#aaaaaa')
      .text(
        `${data.developerName}  |  This is a computer-generated document.`,
        marginLeft,
        footerY,
        { width: contentWidth * 0.7 },
      )
      .text('Page 1 of 1', marginLeft, footerY, {
        width: contentWidth,
        align: 'right',
      });

    doc.end();
  });
}
