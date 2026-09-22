import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const baseDir = path.resolve('assets/playstore/screenshots');

async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 432,
    height: 864,
    deviceScaleFactor: 2.5
  });

  // 1. Home View
  console.log('Capturing Screenshot 1: Home View...');
  await page.goto('http://localhost:3000/?screenshotMode=1', { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(baseDir, 'screenshot1-home-selection.png') });

  // 2. Active Exam Details & Upload Zone
  console.log('Capturing Screenshot 2: Target Exam & Document Selector...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    window.__examToolkitApp.selectExam('upsc-cse-civil-services');
    window.__examToolkitApp.selectDocType('photo');
    const hero = document.getElementById('selectedExamHero');
    if (hero) hero.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(baseDir, 'screenshot2-photo-crop-specs.png') });

  // 3. Custom / Manual Preset Configuration Studio
  console.log('Capturing Screenshot 3: Custom Preset Studio...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    window.__examToolkitApp.selectExam('custom-spec');
    const panel = document.getElementById('customPresetPanel');
    if (panel) panel.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(baseDir, 'screenshot3-compliance-pass.png') });

  // 4. State PSC & Competitive Exam Category Filter
  console.log('Capturing Screenshot 4: Category Filtering & Exams...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    window.__examToolkitApp.selectExam('appsc-group1');
    const hero = document.getElementById('selectedExamHero');
    if (hero) hero.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(baseDir, 'screenshot4-certificate-pdf.png') });

  await browser.close();
  console.log('All 4 real in-app screenshots captured successfully!');
}

run().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});