/**
 * Core Validator for Competitive Exam Specifications
 * Validates file dimensions, format, file size (KB), and aspect ratio.
 * Works seamlessly in both Node.js and Browser environments.
 */

export function validateFileAgainstSpec(fileInfo, spec) {
  if (!spec) {
    return {
      isValid: false,
      status: 'FAIL',
      summary: 'Missing examination specification.',
      checks: []
    };
  }

  const checks = [];

  // 1. Format Check
  const expectedFormat = (spec.format || 'image/jpeg').toLowerCase();
  const actualFormat = (fileInfo.type || fileInfo.format || '').toLowerCase();
  const formatMatches = actualFormat.includes('jpeg') || actualFormat.includes('jpg')
    ? (expectedFormat.includes('jpeg') || expectedFormat.includes('jpg'))
    : actualFormat === expectedFormat;

  checks.push({
    name: 'File Format',
    passed: formatMatches,
    expected: spec.formatName || 'JPG/JPEG',
    actual: fileInfo.formatName || actualFormat || 'Unknown',
    message: formatMatches
      ? `Format is compliant (${spec.formatName || expectedFormat})`
      : `Expected ${spec.formatName || expectedFormat}, got ${fileInfo.formatName || actualFormat}`
  });

  // 2. File Size (KB) Check
  const sizeKB = Number((fileInfo.sizeBytes / 1024).toFixed(2));
  const minKB = spec.minKB !== undefined ? spec.minKB : 0;
  const maxKB = spec.maxKB !== undefined ? spec.maxKB : Infinity;
  const sizePassed = sizeKB >= minKB && sizeKB <= maxKB;

  let sizeMsg = `Size is ${sizeKB} KB (Required: ${minKB} KB - ${maxKB} KB)`;
  if (sizeKB < minKB) {
    sizeMsg = `File size (${sizeKB} KB) is below minimum of ${minKB} KB`;
  } else if (sizeKB > maxKB) {
    sizeMsg = `File size (${sizeKB} KB) exceeds maximum of ${maxKB} KB`;
  }

  checks.push({
    name: 'File Size',
    passed: sizePassed,
    expected: `${minKB} KB - ${maxKB} KB`,
    actual: `${sizeKB} KB`,
    message: sizeMsg
  });

  // 3. Pixel Dimensions Check (for images)
  if (spec.format !== 'application/pdf' && fileInfo.width && fileInfo.height) {
    const actualW = fileInfo.width;
    const actualH = fileInfo.height;

    const minW = spec.minWidth || spec.width;
    const maxW = spec.maxWidth || spec.width;
    const minH = spec.minHeight || spec.height;
    const maxH = spec.maxHeight || spec.height;

    const widthPassed = (minW === undefined || actualW >= minW) && (maxW === undefined || actualW <= maxW);
    const heightPassed = (minH === undefined || actualH >= minH) && (maxH === undefined || actualH <= maxH);

    const dimPassed = widthPassed && heightPassed;
    const expectedDimStr = (spec.width && spec.height && !spec.minWidth)
      ? `${spec.width} × ${spec.height} px`
      : `${minW}-${maxW}w × ${minH}-${maxH}h px`;

    checks.push({
      name: 'Dimensions (Width × Height)',
      passed: dimPassed,
      expected: expectedDimStr,
      actual: `${actualW} × ${actualH} px`,
      message: dimPassed
        ? `Dimensions match requirements (${actualW} × ${actualH} px)`
        : `Dimensions ${actualW} × ${actualH} px do not match requirement (${expectedDimStr})`
    });

    // 4. Aspect Ratio Check
    if (spec.width && spec.height) {
      const targetRatio = spec.width / spec.height;
      const actualRatio = actualW / actualH;
      const ratioDiff = Math.abs(actualRatio - targetRatio);
      const ratioPassed = ratioDiff < 0.05; // 5% tolerance

      checks.push({
        name: 'Aspect Ratio',
        passed: ratioPassed,
        expected: `${(spec.width / spec.height).toFixed(2)}:1`,
        actual: `${(actualRatio).toFixed(2)}:1`,
        message: ratioPassed
          ? 'Aspect ratio is correct'
          : `Aspect ratio differs slightly (${actualRatio.toFixed(2)} vs target ${targetRatio.toFixed(2)})`
      });
    }
  }

  const allPassed = checks.every(c => c.passed);
  const anyCriticalFailed = checks.some(c => !c.passed && c.name !== 'Aspect Ratio');

  return {
    isValid: allPassed,
    status: allPassed ? 'PASS' : (anyCriticalFailed ? 'FAIL' : 'WARNING'),
    summary: allPassed
      ? 'All upload criteria are satisfied. File is ready to upload!'
      : 'File does not meet one or more upload requirements.',
    checks
  };
}
