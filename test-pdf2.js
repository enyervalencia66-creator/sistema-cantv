const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Simulate the logic from server.js
const PDF_MARGIN = 50;
const PDF_BRAND_BLUE = '#2563eb';
const PDF_BRAND_DARK = '#1e293b';
const PDF_MUTED = '#64748b';
const PDF_TEXT = '#334155';

function pdfHeader(doc, eyebrow, titulo, subtitulo) {
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - PDF_MARGIN * 2;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PDF_MUTED)
        .text('SISTEMA DE INVESTIGACIONES RELACIONALES', PDF_MARGIN, 26, { width: contentWidth, align: 'right', characterSpacing: 0.4 });
    doc.font('Helvetica').fontSize(7.5).fillColor(PDF_MUTED)
        .text(`Generado el ${new Date().toLocaleString('es-VE')}`, PDF_MARGIN, 38, { width: contentWidth, align: 'right' });
    doc.moveTo(PDF_MARGIN, 74).lineTo(pageWidth - PDF_MARGIN, 74).lineWidth(1.4).strokeColor(PDF_BRAND_BLUE).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_BRAND_BLUE).text(eyebrow.toUpperCase(), PDF_MARGIN, 86, { characterSpacing: 1.2 });
    doc.font('Helvetica-Bold').fontSize(19).fillColor(PDF_BRAND_DARK).text(titulo, PDF_MARGIN, doc.y + 2, { width: contentWidth });
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(PDF_MUTED).text(subtitulo, PDF_MARGIN, doc.y + 2, { width: contentWidth });
    doc.moveDown(0.7);
    doc.moveTo(PDF_MARGIN, doc.y).lineTo(pageWidth - PDF_MARGIN, doc.y).lineWidth(0.6).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.9);
    doc.fillColor(PDF_TEXT);
    doc.x = PDF_MARGIN;
}

function pdfSectionTitle(doc, text) {
    if (doc.y > doc.page.height - 80) doc.addPage();
    const y = doc.y;
    doc.rect(PDF_MARGIN, y + 1, 3, 12).fill(PDF_BRAND_BLUE);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(PDF_BRAND_DARK).text(text.toUpperCase(), PDF_MARGIN + 11, y, { characterSpacing: 0.6 });
    doc.moveDown(0.4);
    doc.x = PDF_MARGIN;
}

function pdfDataTable(doc, rows) {
    const startY = doc.y;
    let y = startY;
    const colLeft = PDF_MARGIN;
    const colRight = PDF_MARGIN + 120;
    const maxRightW = doc.page.width - PDF_MARGIN - 120 - PDF_MARGIN;

    rows.forEach(r => {
        const hRight = doc.heightOfString(String(r[1]), { width: maxRightW, fontSize: 9 });
        const hLeft = doc.heightOfString(String(r[0]), { width: 100, fontSize: 9 });
        const rowHeight = Math.max(hRight, hLeft) + 12;
        if (y + rowHeight > doc.page.height - 60) {
            doc.addPage();
            y = doc.y;
        }
        doc.rect(PDF_MARGIN, y, doc.page.width - PDF_MARGIN * 2, rowHeight).fill('#ffffff');
        doc.moveTo(PDF_MARGIN, y + rowHeight).lineTo(doc.page.width - PDF_MARGIN, y + rowHeight).lineWidth(0.6).strokeColor('#f1f5f9').stroke();
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PDF_MUTED)
            .text(String(r[0]).toUpperCase(), colLeft + 8, y + 6, { width: 100, characterSpacing: 0.3 });
        doc.font('Helvetica').fontSize(9).fillColor(PDF_BRAND_DARK)
            .text(String(r[1]), colRight, y + 6, { width: maxRightW });
        y += rowHeight;
    });
    doc.y = y + 15;
    doc.x = PDF_MARGIN;
}

function pdfParagraph(doc, text, opts = {}) {
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc.font('Times-Roman').fontSize(10.5).fillColor(PDF_TEXT)
        .text(text || '—', PDF_MARGIN, doc.y, { width: doc.page.width - PDF_MARGIN * 2, lineGap: 4, align: 'justify', ...opts });
    doc.moveDown(0.6);
}

function pdfPeopleTable(doc, personas, showGrado) {
    if (!personas.length) return pdfParagraph(doc, 'No hay personas vinculadas.');
    const contentWidth = doc.page.width - PDF_MARGIN * 2;
    const colCedula = contentWidth * 0.22;
    const colGrado = showGrado ? contentWidth * 0.28 : 0;
    const colNombre = contentWidth - colCedula - colGrado;
    const rowHeight = 20;

    const drawHeaderRow = (y) => {
        doc.rect(PDF_MARGIN, y, contentWidth, rowHeight).fill(PDF_BRAND_DARK);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
            .text('NOMBRE', PDF_MARGIN + 8, y + 6.5, { width: colNombre - 16, characterSpacing: 0.4 })
            .text('CÉDULA', PDF_MARGIN + colNombre + 8, y + 6.5, { width: colCedula - 16, characterSpacing: 0.4 });
        if (showGrado) doc.text('GRADO DE IMPLICACIÓN', PDF_MARGIN + colNombre + colCedula + 8, y + 6.5, { width: colGrado - 16, characterSpacing: 0.4 });
        return y + rowHeight;
    };

    if (doc.y > doc.page.height - 110) doc.addPage();
    let y = drawHeaderRow(doc.y);

    personas.forEach((p, i) => {
        if (y > doc.page.height - 90) { doc.addPage(); y = drawHeaderRow(50); }
        doc.rect(PDF_MARGIN, y, contentWidth, rowHeight).fill(i % 2 === 0 ? '#f8fafc' : '#ffffff');
        doc.rect(PDF_MARGIN, y, contentWidth, rowHeight).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
        doc.font('Helvetica').fontSize(9).fillColor(PDF_TEXT)
            .text(p.nombre || p.cedula || '—', PDF_MARGIN + 8, y + 5.5, { width: colNombre - 16 })
            .text(p.cedula || '—', PDF_MARGIN + colNombre + 8, y + 5.5, { width: colCedula - 16 });
        if (showGrado) doc.text(p.grado || 'No Definido', PDF_MARGIN + colNombre + colCedula + 8, y + 5.5, { width: colGrado - 16 });
        y += rowHeight;
    });

    doc.y = y + 10;
    doc.x = PDF_MARGIN;
}

function pdfFooter(doc) {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.height - 45;
        doc.moveTo(PDF_MARGIN, bottom).lineTo(doc.page.width - PDF_MARGIN, bottom).lineWidth(0.6).strokeColor('#e2e8f0').stroke();
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PDF_BRAND_BLUE)
            .text('CANTV', PDF_MARGIN, bottom + 8, { width: 100, characterSpacing: 0.6, lineBreak: false });
        doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(PDF_MUTED)
            .text('Sistema de Investigaciones Relacionales — Documento de uso confidencial', PDF_MARGIN, bottom + 8, { width: doc.page.width - PDF_MARGIN * 2, align: 'center', lineBreak: false });
        doc.font('Helvetica').fontSize(7.5).fillColor(PDF_MUTED)
            .text(`Página ${i + 1} de ${pages.count}`, doc.page.width - PDF_MARGIN - 120, bottom + 8, { width: 120, align: 'right', lineBreak: false });
    }
}

async function testPdf() {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
    
    // Simulate valid data
    const s = {
        estado: 'Aprobado',
        criticidad: 'Alta',
        creadoPorNombre: 'Juan',
        creadoEl: new Date().toISOString(),
        casoGenerado: 123,
        asunto: 'Test Asunto',
        personasInvolucradasDetalle: [{ cedula: 'V-123', nombre: 'Juan' }]
    };

    pdfHeader(doc, 'Expediente de Incidencia', `Incidencia ${s.id ?? ''}`, 'Proceso de validación gerencial');
    pdfSectionTitle(doc, 'Información General');
    pdfDataTable(doc, [
        ['Estado', s.estado],
        ['Criticidad', s.criticidad],
        ['Enviado por', s.creadoPorNombre],
        ['Fecha de Creación', s.creadoEl],
        ['Caso Generado', s.casoGenerado ? `Caso ${s.casoGenerado}` : '—']
    ]);
    pdfSectionTitle(doc, 'Asunto');
    pdfParagraph(doc, s.asunto);
    pdfSectionTitle(doc, 'Personas Involucradas');
    pdfPeopleTable(doc, s.personasInvolucradasDetalle, false);
    
    pdfFooter(doc);
    doc.end();
    
    doc.pipe(fs.createWriteStream('test.pdf'));
    console.log("PDF generation finished successfully without crashing.");
}

testPdf().catch(console.error);
