/**
 * Client-side PDF Builder for Document Uploads
 * Creates standard compliant PDF 1.4 documents directly from image buffers/blobs
 * with zero server calls. Directly embeds JPEG images via /DCTDecode for exact
 * file-size predictability and maximum rendering quality.
 */

export async function createPdfFromImages(images, options = {}) {
  const {
    pageSize = 'A4', // 'A4' or 'FIT_IMAGE'
    margin = 20,     // points
    title = 'Document'
  } = options;

  // A4 dimensions in PostScript points (72 points = 1 inch)
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  const pages = [];

  for (const img of images) {
    let jpegBytes;
    let width = img.width || 800;
    let height = img.height || 1000;

    if (img.blob) {
      jpegBytes = new Uint8Array(await img.blob.arrayBuffer());
    } else if (img.bytes) {
      jpegBytes = img.bytes;
    } else if (img.canvas) {
      const blob = await new Promise((resolve) => img.canvas.toBlob(resolve, 'image/jpeg', 0.85));
      jpegBytes = new Uint8Array(await blob.arrayBuffer());
      width = img.canvas.width;
      height = img.canvas.height;
    }

    pages.push({
      bytes: jpegBytes,
      width,
      height
    });
  }

  // Generate PDF document structure
  const pdfBytes = assemblePdf(pages, { A4_WIDTH, A4_HEIGHT, pageSize, margin, title });
  const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

  return {
    blob: pdfBlob,
    sizeBytes: pdfBlob.size,
    sizeKB: Number((pdfBlob.size / 1024).toFixed(2)),
    pageCount: pages.length
  };
}

/**
 * Low-level PDF 1.4 byte assembler
 */
function assemblePdf(pages, config) {
  const objects = [];
  let currentObjId = 1;

  const catalogId = currentObjId++;
  const pagesRootId = currentObjId++;

  const pageObjIds = [];
  const imageObjIds = [];

  for (let i = 0; i < pages.length; i++) {
    pageObjIds.push(currentObjId++);
    imageObjIds.push(currentObjId++);
  }

  const parts = [];
  const offsets = {};

  const append = (str) => {
    parts.push(typeof str === 'string' ? new TextEncoder().encode(str) : str);
  };

  // Header
  append('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // Helper to record object offset
  const startObj = (id) => {
    let currentLength = 0;
    for (const p of parts) currentLength += p.length;
    offsets[id] = currentLength;
    append(`${id} 0 obj\n`);
  };

  // 1. Catalog
  startObj(catalogId);
  append(`<< /Type /Catalog /Pages ${pagesRootId} 0 R >>\nendobj\n`);

  // 2. Pages Root
  startObj(pagesRootId);
  append(`<< /Type /Pages /Kids [ ${pageObjIds.map((id) => `${id} 0 R`).join(' ')} ] /Count ${pages.length} >>\nendobj\n`);

  // 3. Pages & Embedded Images
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageId = pageObjIds[i];
    const imgId = imageObjIds[i];

    // Calculate dimensions
    const pageWidth = config.pageSize === 'A4' ? config.A4_WIDTH : page.width;
    const pageHeight = config.pageSize === 'A4' ? config.A4_HEIGHT : page.height;

    // Fit image inside margins
    const availW = pageWidth - (config.margin * 2);
    const availH = pageHeight - (config.margin * 2);
    const scale = Math.min(availW / page.width, availH / page.height, 1.0);
    const drawW = page.width * scale;
    const drawH = page.height * scale;
    const drawX = (pageWidth - drawW) / 2;
    const drawY = (pageHeight - drawH) / 2;

    const contentStream = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    const contentStreamBytes = new TextEncoder().encode(contentStream);

    // Page Object
    startObj(pageId);
    append(`<< /Type /Page /Parent ${pagesRootId} 0 R\n` +
      `   /MediaBox [ 0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)} ]\n` +
      `   /Resources << /XObject << /Im0 ${imgId} 0 R >> >>\n` +
      `   /Contents << /Length ${contentStreamBytes.length} >>\n` +
      `>>\nstream\n`);
    append(contentStreamBytes);
    append('\nendstream\nendobj\n');

    // Image XObject (JPEG DCTDecode)
    startObj(imgId);
    append(`<< /Type /XObject /Subtype /Image\n` +
      `   /Width ${page.width} /Height ${page.height}\n` +
      `   /ColorSpace /DeviceRGB /BitsPerComponent 8\n` +
      `   /Filter /DCTDecode /Length ${page.bytes.length}\n` +
      `>>\nstream\n`);
    append(page.bytes);
    append('\nendstream\nendobj\n');
  }

  // Cross-reference table (xref)
  let xrefOffset = 0;
  for (const p of parts) xrefOffset += p.length;

  let xrefStr = `xref\n0 ${currentObjId}\n0000000000 65535 f \n`;
  for (let id = 1; id < currentObjId; id++) {
    const off = String(offsets[id]).padStart(10, '0');
    xrefStr += `${off} 00000 n \n`;
  }

  xrefStr += `trailer\n<< /Size ${currentObjId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  append(xrefStr);

  // Merge all byte parts into one Uint8Array
  let totalLength = 0;
  for (const p of parts) totalLength += p.length;

  const finalPdf = new Uint8Array(totalLength);
  let pos = 0;
  for (const p of parts) {
    finalPdf.set(p, pos);
    pos += p.length;
  }

  return finalPdf;
}
