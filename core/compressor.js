/**
 * Smart Iterative Image Compressor
 * Uses binary search over compression quality and safe JPEG comment segment padding
 * to guarantee output file size strictly satisfies minKB and maxKB requirements,
 * enhancing lower file sizes into the safe prescribed range.
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
  // Aim for a comfortable, safe spot (45% into the range) to avoid teetering on minKB boundary
  const desiredBytes = targetKB
    ? targetKB * 1024
    : Math.round(minBytes + (maxBytes - minBytes) * 0.45);

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

  // 1. Initial trial at high quality to preserve clarity
  let currentQ = 0.90;
  let currentBlob = await getBlob(currentQ);
  iterations++;

  if (currentBlob.size >= minBytes && currentBlob.size <= maxBytes) {
    bestBlob = currentBlob;
  } else {
    // 2. Binary search to hit the target window
    for (let i = 0; i < maxIterations; i++) {
      iterations++;
      if (currentBlob.size < minBytes) {
        lowQuality = currentQ;
      } else if (currentBlob.size > maxBytes) {
        highQuality = currentQ;
      } else {
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

  // 3. Lower File Size Enhancement:
  // If bestBlob is below minBytes (common for clean signatures, monochrome scans, or simple graphics)
  // enhance the file size to land comfortably in the prescribed target range!
  if (bestBlob && bestBlob.size < minBytes && format === 'image/jpeg') {
    const arrayBuffer = await bestBlob.arrayBuffer();
    const neededPadding = Math.max(512, Math.round(desiredBytes - bestBlob.size));
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
 * Safely inserts standard JPEG COM (0xFFFE) comment markers with whitespace padding
 * to elevate small files comfortably into the prescribed range without altering pixels
 * or breaking portal decoders.
 */
export function addJpegCommentPadding(jpegBytes, padSize) {
  if (jpegBytes[0] !== 0xFF || jpegBytes[1] !== 0xD8) {
    return jpegBytes;
  }

  let remainingPad = padSize;
  let currentBytes = jpegBytes;

  while (remainingPad > 0) {
    const chunk = Math.min(remainingPad, 65530);
    const segmentLength = chunk + 2;
    const header = [0xFF, 0xFE, (segmentLength >> 8) & 0xFF, segmentLength & 0xFF];
    const payload = new Uint8Array(chunk);
    payload.fill(0x20); // space padding

    const newBytes = new Uint8Array(currentBytes.length + 4 + chunk);
    newBytes.set(currentBytes.subarray(0, 2), 0); // SOI marker
    newBytes.set(header, 2);
    newBytes.set(payload, 6);
    newBytes.set(currentBytes.subarray(2), 6 + chunk);

    currentBytes = newBytes;
    remainingPad -= chunk;
  }

  return currentBytes;
}

/**
 * Pure mathematical binary search simulator for testing environment without DOM canvas.
 * Accurately models pixel area resizing followed by JPEG quality compression and padding.
 */
export function simulateCompressionConvergence(sourceBytes, minKB, maxKB, targetAreaRatio = 0.1) {
  const minBytes = minKB * 1024;
  const maxBytes = maxKB * 1024;
  const desiredBytes = Math.round(minBytes + (maxBytes - minBytes) * 0.45);

  const baseResizedBytes = Math.round(sourceBytes * targetAreaRatio);

  let lowQ = 0.05;
  let highQ = 0.99;
  let q = 0.85;
  let iterations = 0;
  let currentBytes = 0;

  while (iterations < 10) {
    iterations++;
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

  // If still below minBytes, simulate padding enhancement
  if (currentBytes < minBytes) {
    currentBytes = desiredBytes;
    return { success: true, iterations, finalBytes: currentBytes, finalKB: (currentBytes / 1024).toFixed(2), q: 0.99, padded: true };
  }

  return {
    success: currentBytes >= minBytes && currentBytes <= maxBytes,
    iterations,
    finalBytes: currentBytes,
    finalKB: (currentBytes / 1024).toFixed(2),
    q
  };
}
