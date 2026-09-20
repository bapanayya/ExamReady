/**
 * Image Processor Engine
 * Canvas operations: Cropping, Resizing, Brightness/Contrast, DOP Stamping,
 * Face Coverage Visual Guides, Signature Shadow/Ink Cleanup,
 * Stacked Signatures, and Thumb Impression Enhancement.
 */

/**
 * Crops and scales an image or canvas into target dimensions
 */
export function cropAndScale(source, cropBox, targetWidth, targetHeight, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  // Fill default background
  ctx.fillStyle = options.backgroundColor || '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Enable high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const sx = cropBox.x || 0;
  const sy = cropBox.y || 0;
  const sw = cropBox.width || source.naturalWidth || source.width;
  const sh = cropBox.height || source.naturalHeight || source.height;

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
  return canvas;
}

/**
 * Adjusts brightness (-100 to 100) and contrast (-100 to 100)
 */
export function applyBrightnessContrast(sourceCanvas, brightness = 0, contrast = 0) {
  if (brightness === 0 && contrast === 0) {
    return sourceCanvas;
  }

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const ctx = outputCanvas.getContext('2d');

  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Factor calculations
  const b = brightness * 1.28; // -128 to 128
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let bVal = data[i + 2];

    // Apply contrast
    r = factor * (r - 128) + 128;
    g = factor * (g - 128) + 128;
    bVal = factor * (bVal - 128) + 128;

    // Apply brightness
    r += b;
    g += b;
    bVal += b;

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, bVal));
  }

  ctx.putImageData(imgData, 0, 0);
  return outputCanvas;
}

/**
 * Stamps Candidate Name and Date of Photograph (DOP) at the bottom
 * as mandated by SSC, UPSC, State PSCs, and NTA guidelines.
 */
export function applyDopStamp(sourceCanvas, applicantName, photoDate, options = {}) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const ctx = outputCanvas.getContext('2d');

  // Draw original image first
  ctx.drawImage(sourceCanvas, 0, 0);

  if (!applicantName && !photoDate) {
    return outputCanvas;
  }

  // Calculate banner height (typically 16% to 20% of photo height)
  const bannerHeight = Math.max(36, Math.round(height * 0.18));
  const bannerY = height - bannerHeight;

  // Draw solid white banner
  ctx.fillStyle = options.bannerColor || '#FFFFFF';
  ctx.fillRect(0, bannerY, width, bannerHeight);

  // Draw subtle top divider line
  ctx.strokeStyle = '#D1D5DB';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, bannerY);
  ctx.lineTo(width, bannerY);
  ctx.stroke();

  // Font setup
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fontSize = Math.max(10, Math.round(bannerHeight * 0.32));
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

  const cleanName = (applicantName || '').trim().toUpperCase();
  const cleanDate = (photoDate || '').trim();
  const dateStr = cleanDate.startsWith('DOP') ? cleanDate : (cleanDate ? `DOP: ${cleanDate}` : '');

  if (cleanName && dateStr) {
    ctx.fillText(cleanName, width / 2, bannerY + bannerHeight * 0.32);
    ctx.font = `500 ${Math.max(9, Math.round(bannerHeight * 0.28))}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(dateStr, width / 2, bannerY + bannerHeight * 0.72);
  } else if (cleanName || dateStr) {
    ctx.fillText(cleanName || dateStr, width / 2, bannerY + bannerHeight * 0.5);
  }

  return outputCanvas;
}

/**
 * Signature Cleaner:
 * Removes mobile shadows, creases, and yellowish paper backgrounds.
 * Converts background to pure white while preserving crisp pen ink lines.
 */
export function cleanSignature(sourceCanvas, options = {}) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const ctx = outputCanvas.getContext('2d');

  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const threshold = options.threshold || 170; // Pixel brightness threshold
  const inkMode = options.inkMode || 'keep_ink'; // 'keep_ink' or 'pure_black'

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Perceived luminance
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    if (luminance > threshold) {
      // Paper background -> turn into pure clean white
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    } else {
      // Signature ink
      if (inkMode === 'pure_black') {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else {
        // Boost contrast and deepen the ink
        const factor = 1.35;
        data[i] = Math.max(0, Math.min(255, (r - 128) * factor + 128 - 25));
        data[i + 1] = Math.max(0, Math.min(255, (g - 128) * factor + 128 - 25));
        data[i + 2] = Math.max(0, Math.min(255, (b - 128) * factor + 128 - 25));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return outputCanvas;
}

/**
 * Creates 3 vertically stacked identical signatures as required by
 * certain Judiciary and High Court notifications.
 */
export function createStackedSignatures(sourceCanvas, count = 3) {
  const width = sourceCanvas.width;
  const slotHeight = Math.floor(sourceCanvas.height / count);

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = sourceCanvas.height;
  const ctx = outputCanvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, sourceCanvas.height);

  for (let i = 0; i < count; i++) {
    const y = i * slotHeight;
    ctx.drawImage(sourceCanvas, 0, y, width, slotHeight);
    if (i > 0) {
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(width - 10, y);
      ctx.stroke();
    }
  }

  return outputCanvas;
}

/**
 * Thumb Impression Enhancer:
 * Enhances ridge lines and removes ink smudges or dull lighting.
 */
export function enhanceThumbImpression(sourceCanvas, options = {}) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const ctx = outputCanvas.getContext('2d');

  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const contrast = options.contrast || 1.4;
  const brightness = options.brightness || 10;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Contrast adjustment
    r = ((r / 255 - 0.5) * contrast + 0.5) * 255 + brightness;
    g = ((g / 255 - 0.5) * contrast + 0.5) * 255 + brightness;
    b = ((b / 255 - 0.5) * contrast + 0.5) * 255 + brightness;

    // Whitewash bright background areas
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance > 215) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    } else {
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return outputCanvas;
}

/**
 * Rotates a canvas by specified degrees (90, 180, 270)
 */
export function rotateCanvas(sourceCanvas, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const isPerpendicular = Math.abs(degrees % 180) === 90;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = isPerpendicular ? sourceCanvas.height : sourceCanvas.width;
  outputCanvas.height = isPerpendicular ? sourceCanvas.width : sourceCanvas.height;

  const ctx = outputCanvas.getContext('2d');
  ctx.translate(outputCanvas.width / 2, outputCanvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

  return outputCanvas;
}
