import { simulateCompressionConvergence } from '../core/compressor.js';

console.log('Testing Compressor Binary Search Convergence...');

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

if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) failed in compressor.test.js`);
  process.exit(1);
} else {
  console.log('\n✅ All Compressor Simulation Tests Passed Successfully!');
}
