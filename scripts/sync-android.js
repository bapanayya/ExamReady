import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const webDir = path.join(rootDir, 'web');
const coreDir = path.join(rootDir, 'core');
const androidAssetsDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public');

function copyRecursive(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((child) => {
      copyRecursive(path.join(src, child), path.join(dest, child));
    });
  } else if (exists) {
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

console.log('🔄 Synchronizing Web App & Core Specs into Android Assets...');

// 1. Ensure target directory exists
if (!fs.existsSync(androidAssetsDir)) {
  fs.mkdirSync(androidAssetsDir, { recursive: true });
}

// 2. Copy Web contents
console.log('📦 Copying web files to Android assets/public...');
copyRecursive(webDir, androidAssetsDir);

// 3. Copy Core specs and engines to assets/public/core and assets/public/web/core
console.log('📦 Copying core specifications & engine to Android assets/public/core...');
copyRecursive(coreDir, path.join(androidAssetsDir, 'core'));
copyRecursive(coreDir, path.join(androidAssetsDir, 'web', 'core'));

// 4. Copy YouTube logo if present
const ytLogoSrc = path.join(rootDir, 'The-Competitive-Edge-Logo.jpg');
const ytLogoDest = path.join(androidAssetsDir, 'assets', 'The-Competitive-Edge-Logo.jpg');
if (fs.existsSync(ytLogoSrc)) {
  fs.copyFileSync(ytLogoSrc, ytLogoDest);
}

// 5. Verification
const indexCheck = fs.existsSync(path.join(androidAssetsDir, 'index.html'));
const examsCheck = fs.existsSync(path.join(androidAssetsDir, 'core', 'exams.json'));
const jsCheck = fs.existsSync(path.join(androidAssetsDir, 'js', 'app.js'));

if (indexCheck && examsCheck && jsCheck) {
  console.log('✅ Android Assets Synchronization Completed Successfully!');
  console.log('📁 Destination: ' + androidAssetsDir);
} else {
  console.error('❌ Error verifying synchronized assets!');
  process.exit(1);
}
