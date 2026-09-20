import { simulateCompressionConvergence, addJpegCommentPadding } from '../core/compressor.js';

console.log('Testing Compressor Binary Search Convergence & Lower-Size Enhancement...');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    failed++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

// Scenario 1: Typical camera image (2 MB) resized to 200x230 px passport photo needing 20-50 KB
const res1 = simulateCompressionConvergence(2000 * 1024, 20, 50, 0.035);
assert(res1.success, `Passport photo converges into 20-50 KB range (result: ${res1.finalKB} KB in ${res1.iterations} iters, q=${res1.q.toFixed(2)})`);

// Scenario 2: Signature photo (1.5 MB) cropped to 140x60 px needing 10-20 KB
const res2 = simulateCompressionConvergence(1500 * 1024, 10, 20, 0.016);
assert(res2.success, `Signature image converges into 10-20 KB range (result: ${res2.finalKB} KB in ${res2.iterations} iters, q=${res2.q.toFixed(2)})`);

// Scenario 3: Document photo (3 MB) resized to 1000px needing 100-300 KB
const res3 = simulateCompressionConvergence(3000 * 1024, 100, 300, 0.12);
assert(res3.success, `Document image converges into 100-300 KB range (result: ${res3.finalKB} KB in ${res3.iterations} iters, q=${res3.q.toFixed(2)})`);

// Scenario 4: Lower File Size Enhancement (tiny signature of 5 KB needed in 20-50 KB range)
const res4 = simulateCompressionConvergence(50 * 1024, 20, 50, 0.05);
assert(res4.success && parseFloat(res4.finalKB) >= 20 && parseFloat(res4.finalKB) <= 50,
  `Tiny image (low KB) is enhanced into 20-50 KB range (result: ${res4.finalKB} KB, padded: ${res4.padded})`);

// Scenario 5: JPEG Comment Padding Binary Validity
const fakeJpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0xAA, 0xBB, 0xFF, 0xD9]);
const padded = addJpegCommentPadding(fakeJpeg, 5000);
assert(padded[0] === 0xFF && padded[1] === 0xD8, 'Padded JPEG preserves SOI 0xFFD8');
assert(padded[2] === 0xFF && padded[3] === 0xFE, 'Padded JPEG contains COM 0xFFFE marker');
assert(padded.length >= fakeJpeg.length + 5000, `Padded JPEG increased size to ${padded.length} bytes`);

// Scenario 6: Oversized Document Photo (4 MB) reduced to under 300 KB for Certificate PDF (20-300 KB)
const res6 = simulateCompressionConvergence(4000 * 1024, 20, 300, 0.15);
assert(res6.success && parseFloat(res6.finalKB) <= 300 && parseFloat(res6.finalKB) >= 20,
  `Oversized document (4MB) reduced into 20-300 KB range (result: ${res6.finalKB} KB)`);

if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) failed in compressor.test.js`);
  process.exit(1);
} else {
  console.log('\n✅ All Compressor Simulation & Enhancement Tests Passed Successfully!');
}
