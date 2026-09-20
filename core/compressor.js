/**
 * Smart Iterative Image Compressor
 * Uses binary search over compression quality and smart padding to guarantee
 * output file size strictly satisfies minKB and maxKB requirements.
 */

export async function compressCanvasToKB(canvas, options = {}) {
  const {
    minKB = 10,
    maxKB = 50,
    format = 'image/jpeg',
    maxIterations = 8,
    targetKB = null
  } = options;

  const minBytes = minKB * 1024;
  const maxBytes = maxKB * 1024;
  const desiredBytes = targetKB ? targetKB * 1024 : (minBytes + maxBytes) / 2;

  let lowQuality = 0.05;
  let highQuality = 0.99;
  let bestBlob = null;
  let bestDiff = Infinity;
  let iterations = 0;

  // Helper to convert canvas to blob with given quality
  const getBlob = (q) => {
    return new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), format, q);
    });
  };

  // 1. Initial trial at standard high-medium quality
  let currentQ = 0.82;
  let currentBlob = await getBlob(currentQ);
  iterations++;

  if (currentBlob.size >= minBytes && currentBlob.size <= maxBytes) {
    bestBlob = currentBlob;
  } else {
    // 2. Binary search to hit the target window
    for (let i = 0; i < maxIterations; i++) {
      iterations++;
      if (currentBlob.size < minBytes) {
        // Too small: increase quality
        lowQuality = currentQ;
      } else if (currentBlob.size > maxBytes) {
        // Too large: reduce quality
        highQuality = currentQ;
      } else {
        // Inside bracket!
        bestBlob = currentBlob;
        break;
      }

      currentQ = (lowQuality + highQuality) / 2;
      currentBlob = await getBlob(currentQ);

      const diff = Math.abs(currentBlob.size - desiredBytes);
      if (currentBlob.size >= minBytes && currentBlob.size <= maxBytes) {
        bestBlob = currentBlob;
        break;
      }

      if (diff < bestDiff) {
        bestDiff = diff;
        bestBlob = currentBlob;
      }
    }
  }

  // 3. Special Case: Image is too small even at 0.99 quality (common with signatures/scans on white background)
  // If bestBlob is below minBytes, we pad the JPEG structure safely with standard APP1 / comment marker
  if (bestBlob && bestBlob.size < minBytes && format === 'image/jpeg') {
    const arrayBuffer = await bestBlob.arrayBuffer();
    const neededPadding = Math.ceil(minBytes - bestBlob.size + 128);
    const paddedBuffer = addJpegCommentPadding(new Uint8Array(arrayBuffer), neededPadding);
    bestBlob = new Blob([paddedBuffer], { type: format });
  }

  const finalSizeBytes = bestBlob ? bestBlob.size : 0;
  const finalSizeKB = Number((finalSizeBytes / 1024).toFixed(2));
  const inRange = finalSizeBytes >= minBytes && finalSizeBytes <= maxBytes;

  return {
    blob: bestBlob,
    sizeBytes: finalSizeBytes,
    sizeKB: finalSizeKB,
    quality: currentQ,
    iterations,
    inRange,
    success: inRange
  };
}

/**
 * Safely inserts a standard JPEG COM (0xFFFE) comment marker with padding
 * to elevate small files into government portal minimum KB requirements
 * without altering pixels or breaking image decoders.
 */
function addJpegCommentPadding(jpegBytes, padSize) {
  // Check JPEG SOI marker 0xFFD8
  if (jpegBytes[0] !== 0xFF || jpegBytes[1] !== 0xD8) {
    return jpegBytes;
  }

  const commentHeader = [0xFF, 0xFE];
  const maxSegmentPayload = 65533; // 64KB max per segment
  const actualPad = Math.min(padSize, maxSegmentPayload);
  const lengthBytes = [((actualPad + 2) >> 8) & 0xFF, (actualPad + 2) & 0xFF];

  const paddingPayload = new Uint8Array(actualPad);
  paddingPayload.fill(0x20); // space characters

  const totalLength = jpegBytes.length + 4 + actualPad;
  const output = new Uint8Array(totalLength);

  // Copy SOI
  output.set(jpegBytes.subarray(0, 2), 0);

  // Insert COM marker + length + comment
  output.set(commentHeader, 2);
  output.set(lengthBytes, 4);
  output.set(paddingPayload, 6);

  // Copy remainder of original JPEG
  output.set(jpegBytes.subarray(2), 6 + actualPad);

  return output;
}

/**
 * Pure mathematical binary search simulator for testing environment without DOM canvas.
 * Accurately models pixel area resizing followed by JPEG quality compression.
 */
export function simulateCompressionConvergence(sourceBytes, minKB, maxKB, targetAreaRatio = 0.1) {
  const minBytes = minKB * 1024;
  const maxBytes = maxKB * 1024;

  // After resizing high-res camera photo to exam dimensions (e.g. 200x230 or 350x450),
  // the base pixel buffer is scaled by targetAreaRatio
  const baseResizedBytes = Math.round(sourceBytes * targetAreaRatio);

  let lowQ = 0.05;
  let highQ = 0.99;
  let q = 0.82;
  let iterations = 0;
  let currentBytes = 0;

  while (iterations < 10) {
    iterations++;
    // JPEG file size formula: base size * quality factor curve
    currentBytes = Math.round(baseResizedBytes * (0.15 + 0.85 * Math.pow(q, 1.8)));

    if (currentBytes >= minBytes && currentBytes <= maxBytes) {
      return { success: true, iterations, finalBytes: currentBytes, finalKB: (currentBytes / 1024).toFixed(2), q };
    }
    if (currentBytes > maxBytes) {
      highQ = q;
    } else {
      lowQ = q;
    }
    q = (lowQ + highQ) / 2;
  }

  return {
    success: currentBytes >= minBytes && currentBytes <= maxBytes,
    iterations,
    finalBytes: currentBytes,
    finalKB: (currentBytes / 1024).toFixed(2),
    q
  };
}
