import { validateFileAgainstSpec } from '../core/validator.js';

console.log('Testing Core Validator Rules...');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    failed++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

// 1. IBPS PO Photo Spec
const ibpsPhotoSpec = {
  width: 200,
  height: 230,
  minKB: 20,
  maxKB: 50,
  format: 'image/jpeg',
  formatName: 'JPG/JPEG'
};

// Case A: Perfect Match
const perfectPhoto = {
  width: 200,
  height: 230,
  sizeBytes: 35 * 1024,
  type: 'image/jpeg',
  formatName: 'JPG/JPEG'
};
const resA = validateFileAgainstSpec(perfectPhoto, ibpsPhotoSpec);
assert(resA.status === 'PASS' && resA.isValid === true, 'IBPS Photo perfect match returns PASS');

// Case B: Size too small (15 KB)
const smallPhoto = {
  width: 200,
  height: 230,
  sizeBytes: 15 * 1024,
  type: 'image/jpeg'
};
const resB = validateFileAgainstSpec(smallPhoto, ibpsPhotoSpec);
assert(resB.status === 'FAIL' && resB.isValid === false, 'Undersized photo (15KB < 20KB) returns FAIL');

// Case C: Size too large (65 KB)
const largePhoto = {
  width: 200,
  height: 230,
  sizeBytes: 65 * 1024,
  type: 'image/jpeg'
};
const resC = validateFileAgainstSpec(largePhoto, ibpsPhotoSpec);
assert(resC.status === 'FAIL' && resC.isValid === false, 'Oversized photo (65KB > 50KB) returns FAIL');

// Case D: Wrong Format (PNG instead of JPG)
const pngPhoto = {
  width: 200,
  height: 230,
  sizeBytes: 30 * 1024,
  type: 'image/png'
};
const resD = validateFileAgainstSpec(pngPhoto, ibpsPhotoSpec);
assert(resD.status === 'FAIL' && resD.isValid === false, 'Wrong format (PNG) returns FAIL');

// Case E: UPSC Civil Services bounded range
const upscPhotoSpec = {
  minWidth: 350,
  maxWidth: 1000,
  minHeight: 350,
  maxHeight: 1000,
  minKB: 20,
  maxKB: 300,
  format: 'image/jpeg'
};
const validUpscPhoto = {
  width: 500,
  height: 500,
  sizeBytes: 150 * 1024,
  type: 'image/jpeg'
};
const resE = validateFileAgainstSpec(validUpscPhoto, upscPhotoSpec);
assert(resE.status === 'PASS' && resE.isValid === true, 'UPSC bounded photo (500x500 px, 150KB) returns PASS');

// Case F: PDF Document
const docSpec = {
  minKB: 100,
  maxKB: 500,
  format: 'application/pdf',
  formatName: 'PDF'
};
const validPdf = {
  sizeBytes: 250 * 1024,
  type: 'application/pdf',
  formatName: 'PDF'
};
const resF = validateFileAgainstSpec(validPdf, docSpec);
assert(resF.status === 'PASS' && resF.isValid === true, 'Valid PDF document (250KB) returns PASS');

if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) failed in validator.test.js`);
  process.exit(1);
} else {
  console.log('\n✅ All Core Validator Tests Passed Successfully!');
}
