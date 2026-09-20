import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing Exam Specifications Schema Integrity...');

const examsPath = path.resolve(__dirname, '../core/exams.json');
const categoriesPath = path.resolve(__dirname, '../core/categories.json');

const exams = JSON.parse(fs.readFileSync(examsPath, 'utf-8'));
const categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8'));

const categoryIds = new Set(categories.map(c => c.id));
let errors = [];

if (!Array.isArray(exams) || exams.length === 0) {
  errors.push('exams.json must be a non-empty array');
}

exams.forEach((exam, idx) => {
  const prefix = `Exam #${idx + 1} (${exam.id || 'unknown'}):`;

  if (!exam.id) errors.push(`${prefix} missing 'id'`);
  if (!exam.name) errors.push(`${prefix} missing 'name'`);
  if (!exam.category || !categoryIds.has(exam.category)) {
    errors.push(`${prefix} invalid or missing category '${exam.category}'`);
  }
  if (!exam.specs || typeof exam.specs !== 'object') {
    errors.push(`${prefix} missing 'specs' object`);
    return;
  }

  // Check specs
  for (const [docType, spec] of Object.entries(exam.specs)) {
    if (spec.minKB !== undefined && spec.maxKB !== undefined) {
      if (spec.minKB > spec.maxKB) {
        errors.push(`${prefix} ${docType} minKB (${spec.minKB}) > maxKB (${spec.maxKB})`);
      }
    }
    if (spec.width && spec.height) {
      if (spec.width <= 0 || spec.height <= 0) {
        errors.push(`${prefix} ${docType} has invalid dimensions (${spec.width}x${spec.height})`);
      }
    }
    if (!spec.format) {
      errors.push(`${prefix} ${docType} missing 'format'`);
    }
  }
});

if (errors.length > 0) {
  console.error('❌ Schema tests failed with errors:');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
} else {
  console.log(`✅ Exam Schema Test Passed: ${exams.length} exams verified across ${categories.length} categories.`);
}
