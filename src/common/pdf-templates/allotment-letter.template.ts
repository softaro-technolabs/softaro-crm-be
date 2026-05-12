import PDFDocument from 'pdfkit';

export interface AllotmentLetterData {
  letterNumber: string;
  date: string;
  buyerName: string;
  buyerPhone?: string;
  buyerEmail?: string;
  buyerAddress?: string;
  projectName: string;
  unitNumber: string;
  floor?: string;
  unitType?: string;
  carpetArea?: string;
  superBuiltUp?: string;
  totalConsideration: number;
  bookingAmount: number;
  possessionDate?: string;
  reraNumber?: string;
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

const drawTableRow = (
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  col1W: number,
  label: string,
  value: string,
  bgColor: string,
  labelColor: string,
  valueColor: string,
  labelFontSize = 9.5,
  valueFontSize = 10,
) => {
  doc.rect(x, y, w, h).fill(bgColor);
  doc
    .font('Helvetica')
    .fontSize(labelFontSize)
    .fillColor(labelColor)
    .text(label, x + 12, y + (h - labelFontSize) / 2, { width: col1W - 12 });
  doc
    .font('Helvetica-Bold')
    .fontSize(valueFontSize)
    .fillColor(valueColor)
    .text(value, x + col1W + 8, y + (h - valueFontSize) / 2, {
      width: w - col1W - 20,
    });
};

export async function generateAllotmentLetterPdf(
  data: AllotmentLetterData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const currency = data.currency ?? 'INR';

    const doc = new PDFDocument({
      size: 'A4',
      margin: 60,
      info: {
        Title: `Allotment Letter - ${data.letterNumber}`,
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

    const brandColor = '#154360';
    const accentColor = '#1a5276';
    const gold = '#b7950b';
    const lightGray = '#f4f6f7';
    const medGray = '#e5e8e8';
    const darkGray = '#555555';
    const black = '#1a1a1a';
    const rowH = 30;

    // ══════════════════════════════════════
    // PAGE 1
    // ══════════════════════════════════════

    // ── Header ──
    doc.rect(0, 0, pageWidth, 120).fill(brandColor);

    // Logo placeholder box
    doc
      .rect(marginLeft, 20, 70, 70)
      .fillAndStroke('#1f618d', '#2471a3')
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#aed6f1')
      .text('LOGO', marginLeft + 20, 51);

    // Developer name
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor('#ffffff')
      .text(data.developerName, marginLeft + 82, 24, {
        width: contentWidth - 82,
      });

    if (data.developerAddress) {
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#aed6f1')
        .text(data.developerAddress, marginLeft + 82, 50, {
          width: contentWidth * 0.55,
        });
    }

    // Allotment Letter title (right)
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor('#f0f3f4')
      .text('ALLOTMENT LETTER', marginLeft, 28, {
        width: contentWidth,
        align: 'right',
      });

    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#aed6f1')
      .text(`Ref No: ${data.letterNumber}`, marginLeft, 50, {
        width: contentWidth,
        align: 'right',
      })
      .text(`Date: ${data.date}`, marginLeft, 63, {
        width: contentWidth,
        align: 'right',
      });

    // RERA badge
    if (data.reraNumber) {
      doc.rect(marginLeft, 88, contentWidth, 22).fill(gold);
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#ffffff')
        .text(
          `RERA Registration No: ${data.reraNumber}`,
          marginLeft,
          94,
          { width: contentWidth, align: 'center' },
        );
    }

    let y = 140;

    // ── Buyer details ──
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(darkGray)
      .text('To,', marginLeft, y);

    y += 14;
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(black)
      .text(data.buyerName, marginLeft, y);

    y += 16;
    const buyerContact = [data.buyerPhone, data.buyerEmail]
      .filter(Boolean)
      .join('  |  ');
    if (buyerContact) {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(darkGray)
        .text(buyerContact, marginLeft, y);
      y += 14;
    }
    if (data.buyerAddress) {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(darkGray)
        .text(data.buyerAddress, marginLeft, y, { width: contentWidth * 0.6 });
      y = doc.y + 6;
    } else {
      y += 6;
    }

    // ── Salutation ──
    y += 10;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(black)
      .text(`Dear ${data.buyerName},`, marginLeft, y);

    y += 20;

    // ── Subject ──
    doc.rect(marginLeft, y, contentWidth, 26).fill(lightGray);
    doc
      .moveTo(marginLeft, y)
      .lineTo(marginLeft, y + 26)
      .lineWidth(3)
      .stroke(accentColor);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(accentColor)
      .text(
        `Sub: Allotment of Unit No. ${data.unitNumber} in ${data.projectName}`,
        marginLeft + 12,
        y + 7,
        { width: contentWidth - 16 },
      );

    y += 36;

    // ── Allotment declaration ──
    const declaration =
      `We are pleased to inform you that, subject to the terms and conditions of the Allotment Agreement and ` +
      `compliance with applicable RERA regulations, you have been allotted the following residential unit in our project ` +
      `"${data.projectName}". This allotment is provisional and shall become absolute upon execution of the Sale Agreement ` +
      `and compliance with the payment schedule.`;

    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(black)
      .text(declaration, marginLeft, y, { width: contentWidth, lineGap: 4 });

    y = doc.y + 22;

    // ── Property Details Table ──
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(brandColor)
      .text('PROPERTY DETAILS', marginLeft, y);

    doc
      .moveTo(marginLeft, y + 14)
      .lineTo(marginLeft + 130, y + 14)
      .lineWidth(2)
      .stroke(gold);

    y += 22;

    const tableW = contentWidth;
    const col1W = tableW * 0.42;

    const propRows: [string, string][] = [
      ['Project Name', data.projectName],
      ['Unit Number', data.unitNumber],
      ...(data.floor ? [['Floor', data.floor] as [string, string]] : []),
      ...(data.unitType ? [['Unit Type', data.unitType] as [string, string]] : []),
      ...(data.carpetArea
        ? [['Carpet Area', `${data.carpetArea} sq.ft.`] as [string, string]]
        : []),
      ...(data.superBuiltUp
        ? [
            [
              'Super Built-Up Area',
              `${data.superBuiltUp} sq.ft.`,
            ] as [string, string],
          ]
        : []),
      ...(data.reraNumber
        ? [['RERA No.', data.reraNumber] as [string, string]]
        : []),
      ...(data.possessionDate
        ? [
            [
              'Estimated Possession',
              data.possessionDate,
            ] as [string, string],
          ]
        : []),
    ];

    // Table header
    doc.rect(marginLeft, y, tableW, rowH).fill(accentColor);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#ffffff')
      .text('PARTICULARS', marginLeft + 12, y + 10, { width: col1W - 12 })
      .text('DETAILS', marginLeft + col1W + 8, y + 10, {
        width: tableW - col1W - 20,
      });

    y += rowH;

    propRows.forEach((row, idx) => {
      const bg = idx % 2 === 0 ? lightGray : '#ffffff';
      drawTableRow(
        doc,
        marginLeft,
        y,
        tableW,
        rowH,
        col1W,
        row[0],
        row[1],
        bg,
        darkGray,
        black,
      );
      y += rowH;
    });

    y += 18;

    // ── Financial Summary Table ──
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(brandColor)
      .text('FINANCIAL SUMMARY', marginLeft, y);

    doc
      .moveTo(marginLeft, y + 14)
      .lineTo(marginLeft + 145, y + 14)
      .lineWidth(2)
      .stroke(gold);

    y += 22;

    const balanceAmount = data.totalConsideration - data.bookingAmount;

    // Fin table header
    doc.rect(marginLeft, y, tableW, rowH).fill(accentColor);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#ffffff')
      .text('DESCRIPTION', marginLeft + 12, y + 10, { width: col1W - 12 })
      .text('AMOUNT', marginLeft + col1W + 8, y + 10, {
        width: tableW - col1W - 20,
        align: 'right',
      });

    y += rowH;

    // Total consideration
    drawTableRow(
      doc,
      marginLeft,
      y,
      tableW,
      rowH,
      col1W,
      'Total Sale Consideration',
      fmt(data.totalConsideration, currency),
      lightGray,
      darkGray,
      black,
    );
    y += rowH;

    // Booking amount
    drawTableRow(
      doc,
      marginLeft,
      y,
      tableW,
      rowH,
      col1W,
      'Booking Amount (Received)',
      fmt(data.bookingAmount, currency),
      '#ffffff',
      darkGray,
      '#1d8348',
    );
    y += rowH;

    // Balance
    doc.rect(marginLeft, y, tableW, rowH + 4).fill(brandColor);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#aed6f1')
      .text('Balance Amount Due', marginLeft + 12, y + 11, {
        width: col1W - 12,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#ffffff')
      .text(fmt(balanceAmount, currency), marginLeft + col1W + 8, y + 10, {
        width: tableW - col1W - 20,
        align: 'right',
      });
    y += rowH + 4;

    // ══════════════════════════════════════
    // PAGE 2
    // ══════════════════════════════════════
    doc.addPage();

    // Page 2 mini header
    doc.rect(0, 0, pageWidth, 48).fill(brandColor);
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#ffffff')
      .text(data.developerName, marginLeft, 16, { width: contentWidth * 0.6 });
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#aed6f1')
      .text('ALLOTMENT LETTER (Continued)', marginLeft, 16, {
        width: contentWidth,
        align: 'right',
      })
      .text(`Ref: ${data.letterNumber}`, marginLeft, 29, {
        width: contentWidth,
        align: 'right',
      });

    y = 68;

    // ── Terms & Conditions ──
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(brandColor)
      .text('TERMS & CONDITIONS', marginLeft, y);

    doc
      .moveTo(marginLeft, y + 16)
      .lineTo(marginLeft + 175, y + 16)
      .lineWidth(2)
      .stroke(gold);

    y += 28;

    const terms = [
      'This allotment is subject to the execution of the Sale/Allotment Agreement within 30 days from the date of this letter. Failure to do so may result in cancellation of the allotment at the developer\'s discretion.',
      'The allottee(s) shall make payments strictly as per the payment schedule attached herewith. Delay in payment shall attract interest at the rate specified in the Agreement, and persistent default may result in cancellation of allotment.',
      'The physical possession of the unit shall be handed over to the allottee(s) upon full payment of all dues including the total sale consideration, registration charges, GST, maintenance deposit, and any other applicable charges.',
      `This allotment is subject to the rules and regulations of RERA${data.reraNumber ? ` (Reg. No. ${data.reraNumber})` : ''} and all other applicable laws. The allottee(s) shall be bound by all conditions stipulated by the regulatory authority.`,
      'The developer reserves the right to make minor structural modifications, change specifications, or alter layouts to comply with statutory requirements. However, the carpet area as registered under RERA shall remain unaltered.',
    ];

    terms.forEach((term, idx) => {
      // Bullet circle
      doc
        .circle(marginLeft + 8, y + 7, 6)
        .fillAndStroke(accentColor, accentColor);
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#ffffff')
        .text(`${idx + 1}`, marginLeft + 5.5, y + 3.5);

      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(black)
        .text(term, marginLeft + 22, y, { width: contentWidth - 22, lineGap: 2 });

      y = doc.y + 12;
    });

    y += 8;

    // ── Acceptance & Signature blocks ──
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(brandColor)
      .text('ACCEPTANCE & SIGNATURES', marginLeft, y);

    doc
      .moveTo(marginLeft, y + 14)
      .lineTo(marginLeft + 200, y + 14)
      .lineWidth(2)
      .stroke(gold);

    y += 24;

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(black)
      .text(
        'By signing below, both parties confirm acceptance of the above allotment and the terms & conditions stated herein.',
        marginLeft,
        y,
        { width: contentWidth, lineGap: 3 },
      );

    y = doc.y + 28;

    // Two-column signature blocks
    const sigColW = contentWidth / 2 - 20;

    // Developer signature block
    doc.rect(marginLeft, y, sigColW, 90).stroke(medGray).lineWidth(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(darkGray)
      .text('FOR & ON BEHALF OF DEVELOPER', marginLeft + 10, y + 10, {
        width: sigColW - 20,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(brandColor)
      .text(data.developerName, marginLeft + 10, y + 24, {
        width: sigColW - 20,
      });

    doc
      .moveTo(marginLeft + 10, y + 72)
      .lineTo(marginLeft + sigColW - 10, y + 72)
      .stroke('#cccccc');
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(darkGray)
      .text('Authorized Signatory & Date', marginLeft + 10, y + 76, {
        width: sigColW - 20,
      });

    // Buyer signature block
    const buyerSigX = marginLeft + sigColW + 40;
    doc
      .rect(buyerSigX, y, sigColW, 90)
      .stroke(medGray)
      .lineWidth(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(darkGray)
      .text('ALLOTTEE / BUYER', buyerSigX + 10, y + 10, {
        width: sigColW - 20,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(black)
      .text(data.buyerName, buyerSigX + 10, y + 24, { width: sigColW - 20 });

    doc
      .moveTo(buyerSigX + 10, y + 72)
      .lineTo(buyerSigX + sigColW - 10, y + 72)
      .stroke('#cccccc');
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(darkGray)
      .text('Buyer Signature & Date', buyerSigX + 10, y + 76, {
        width: sigColW - 20,
      });

    // ── Footer (Page 2) ──
    const footerY2 = doc.page.height - 50;
    doc
      .moveTo(marginLeft, footerY2 - 8)
      .lineTo(pageWidth - marginRight, footerY2 - 8)
      .stroke('#cccccc');

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#aaaaaa')
      .text(
        `${data.developerName}  |  This is a computer-generated document. Not valid without authorized signature.`,
        marginLeft,
        footerY2,
        { width: contentWidth * 0.75 },
      )
      .text('Page 2 of 2', marginLeft, footerY2, {
        width: contentWidth,
        align: 'right',
      });

    // Footer page 1 (added after since we know it's 1 of 2)
    // Page 1 footer was already drawn earlier — skip double-write.

    doc.end();
  });
}
