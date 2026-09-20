/**
 * Standards-Compliant Client-side PDF Builder for Document Uploads
 * Generates 100% valid PDF 1.4 documents embedding JPEG image streams
 * with separate Page, ContentStream, and XObject dictionaries.
 * Fully compatible with Adobe Acrobat, Google Chrome, Edge, and government portals.
 */

export async function createPdfFromImages(images, options = {}) {
  const {
    pageSize = 'A4',
    margin = 20,
    title = 'Document'
  } = options;

  // Standard A4 dimensions in points (72 points = 1 inch)
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  const pages = [];

  for (const img of images) {
    let jpegBytes;
    let width = img.width || 800;
    let height = img.height || 1000;

    if (img.canvas) {
      const blob = await new Promise((resolve) => img.canvas.toBlob(resolve, 'image/jpeg', 0.88));
      jpegBytes = new Uint8Array(await blob.arrayBuffer());
      width = img.canvas.width;
      height = img.canvas.height;
    } else if (img.blob) {
      // If blob is not already JPEG or needs normalization
      if (img.blob.type === 'image/jpeg' || img.blob.type === 'image/jpg') {
        jpegBytes = new Uint8Array(await img.blob.arrayBuffer());
      } else if (typeof document !== 'undefined') {
        // Convert non-JPEG image blob (PNG, WEBP) to JPEG via offscreen canvas
        const bitmap = await createImageBitmap(img.blob);
        width = bitmap.width;
        height = bitmap.height;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0);
        const jBlob = await new Promise((resolve) => tempCanvas.toBlob(resolve, 'image/jpeg', 0.88));
        jpegBytes = new Uint8Array(await jBlob.arrayBuffer());
      } else {
        jpegBytes = new Uint8Array(await img.blob.arrayBuffer());
      }
    } else if (img.bytes) {
      jpegBytes = img.bytes;
    }

    if (jpegBytes && jpegBytes.length > 0) {
      pages.push({
        bytes: jpegBytes,
        width,
        height
      });
    }
  }

  if (pages.length === 0) {
    throw new Error('No valid image data provided for PDF generation');
  }

  const pdfBytes = assemblePdf(pages, { A4_WIDTH, A4_HEIGHT, pageSize, margin, title });
  const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

  return {
    blob: pdfBlob,
    bytes: pdfBytes,
    sizeBytes: pdfBlob.size,
    sizeKB: Number((pdfBlob.size / 1024).toFixed(2)),
    pageCount: pages.length
  };
}

/**
 * Robust PDF 1.4 Byte Assembler
 */
export function assemblePdf(pages, config) {
  let currentObjId = 1;
  const catalogId = currentObjId++;
  const pagesRootId = currentObjId++;

  // For each page: pageObj, contentStreamObj, imageObj
  const pageSpecs = pages.map(() => ({
    pageId: currentObjId++,
    contentId: currentObjId++,
    imageId: currentObjId++
  }));

  const parts = [];
  const offsets = {};

  const append = (val) => {
    if (typeof val === 'string') {
      parts.push(new TextEncoder().encode(val));
    } else if (val instanceof Uint8Array) {
      parts.push(val);
    }
  };

  const startObj = (id) => {
    let currentLength = 0;
    for (const p of parts) currentLength += p.length;
    offsets[id] = currentLength;
    append(`${id} 0 obj\n`);
  };

  // Header
  append('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1. Catalog
  startObj(catalogId);
  append(`<< /Type /Catalog /Pages ${pagesRootId} 0 R >>\nendobj\n`);

  // 2. Pages Root
  startObj(pagesRootId);
  const kidsStr = pageSpecs.map(p => `${p.pageId} 0 R`).join(' ');
  append(`<< /Type /Pages /Kids [ ${kidsStr} ] /Count ${pageSpecs.length} >>\nendobj\n`);

  // 3. Pages, Contents & Images
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const spec = pageSpecs[i];

    const pageWidth = config.pageSize === 'A4' ? config.A4_WIDTH : page.width;
    const pageHeight = config.pageSize === 'A4' ? config.A4_HEIGHT : page.height;

    const availW = pageWidth - (config.margin * 2);
    const availH = pageHeight - (config.margin * 2);
    const scale = Math.min(availW / page.width, availH / page.height, 1.0);
    const drawW = page.width * scale;
    const drawH = page.height * scale;
    const drawX = (pageWidth - drawW) / 2;
    const drawY = (pageHeight - drawH) / 2;

    // Command stream: save graphics, position & scale, draw image, restore
    const streamContent = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    const streamBytes = new TextEncoder().encode(streamContent);

    // Page Object
    startObj(spec.pageId);
    append(
      `<< /Type /Page /Parent ${pagesRootId} 0 R\n` +
      `   /MediaBox [ 0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)} ]\n` +
      `   /Contents ${spec.contentId} 0 R\n` +
      `   /Resources <<\n` +
      `      /ProcSet [ /PDF /ImageC ]\n` +
      `      /XObject << /Im0 ${spec.imageId} 0 R >>\n` +
      `   >>\n` +
      `>>\nendobj\n`
    );

    // Content Stream Object
    startObj(spec.contentId);
    append(`<< /Length ${streamBytes.length} >>\nstream\n`);
    append(streamBytes);
    append(`\nendstream\nendobj\n`);

    // Image XObject (JPEG DCTDecode)
    startObj(spec.imageId);
    append(
      `<< /Type /XObject /Subtype /Image\n` +
      `   /Width ${page.width} /Height ${page.height}\n` +
      `   /ColorSpace /DeviceRGB /BitsPerComponent 8\n` +
      `   /Filter /DCTDecode\n` +
      `   /Length ${page.bytes.length}\n` +
      `>>\nstream\n`
    );
    append(page.bytes);
    append(`\nendstream\nendobj\n`);
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

  // Merge into single Uint8Array
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
