const PDFDocument = require('pdfkit');
const fs = require('fs');

const originalText = PDFDocument.prototype.text;
PDFDocument.prototype.text = function(text, x, y, options) {
    if (typeof text === 'string') {
        // Strip non-WinAnsi characters
        // WinAnsi (Windows-1252) roughly corresponds to characters 0-255 in standard JS (Latin-1)
        // plus a few special ones. A simple regex to replace anything outside \x00-\xFF with ''
        text = text.replace(/[^\x00-\xFF\u0152\u0153\u0178\u0192\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u20AC\u2122]/g, '');
    }
    return originalText.call(this, text, x, y, options);
};

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('test-sanitize.pdf'));
doc.text('Hello 😊 World ✅ ñáéíóú');
doc.end();
console.log('Done!');
