const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
doc.pipe(fs.createWriteStream('_test_pdf.pdf'));

const startY = 100;
const col1 = 50; 
const cardW = 246; 
const col2 = col1 + cardW + 20;
const cardH = 75;

doc.roundedRect(col1, startY, cardW, cardH, 6).fillAndStroke('#f8fafc', '#e2e8f0');
doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('TOTAL CASOS PROCESADOS', col1 + 15, startY + 18, { characterSpacing: 0.5 });
doc.font('Helvetica-Bold').fontSize(28).fillColor('#0f172a').text(String(10), col1 + 15, startY + 32);

doc.end();
