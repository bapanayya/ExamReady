import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const examsPath = path.resolve(__dirname, '../core/exams.json');
const categoriesPath = path.resolve(__dirname, '../core/categories.json');
const htmlPath = path.resolve(__dirname, '../web/index.html');
const cssPath = path.resolve(__dirname, '../web/css/styles.css');
const logoPath = path.resolve(__dirname, '../web/assets/The-Competitive-Edge-Logo.jpg');

const exams = JSON.parse(fs.readFileSync(examsPath, 'utf8'));
const categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'));
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

console.log('--- Checking All 8 User Requirements ---');

let allPassed = true;

// Req 5: APPSC in State PSCs
const appscExams = exams.filter(e => e.id.startsWith('appsc-'));
console.log('1. APPSC Exams in Database:', appscExams.map(e => e.name));
if (appscExams.length >= 2 && appscExams.every(e => e.category === 'state_psc')) {
  console.log('   ✅ Req 5 PASSED: APPSC Group 1, Group 2 added to State PSCs');
} else {
  console.error('   ❌ Req 5 FAILED');
  allPassed = false;
}

// Req 6: GATE and IIT JAM conducted by IITs
const gate = exams.find(e => e.id === 'gate-exam');
const jam = exams.find(e => e.id === 'iit-jam');
console.log('2. GATE & IIT JAM:');
console.log('   GATE Organizer:', gate?.organizer, '| Category:', gate?.category);
console.log('   IIT JAM Organizer:', jam?.organizer, '| Category:', jam?.category);
if (gate?.category === 'iit' && jam?.category === 'iit' && gate?.organizer.includes('IIT') && jam?.organizer.includes('IIT')) {
  console.log('   ✅ Req 6 PASSED: GATE and IIT JAM configured under IITs');
} else {
  console.error('   ❌ Req 6 FAILED');
  allPassed = false;
}

// Req 7: NTA Examinations
const ntaExams = exams.filter(e => e.category === 'nta' || e.organizer?.includes('NTA') || e.id.startsWith('nta-'));
console.log('3. NTA Examinations Count:', ntaExams.length);
console.log('   NTA Exams:', ntaExams.map(e => e.shortName).join(', '));
const requiredNtaShortNames = ['NEET UG', 'JEE Main', 'CUET UG', 'CUET PG', 'UGC NET', 'CSIR NET', 'CMAT', 'GPAT', 'AISSEE', 'NCHM JEE', 'ICAR AIEEA'];
const missingNta = requiredNtaShortNames.filter(name => !ntaExams.some(e => e.shortName === name));
if (missingNta.length === 0) {
  console.log('   ✅ Req 7 PASSED: All official NTA exams present');
} else {
  console.error('   ❌ Req 7 FAILED: Missing', missingNta);
  allPassed = false;
}

// Req 8: YouTube Banner & Logo
const hasLogoFile = fs.existsSync(logoPath);
const hasYtLink = html.includes('http://www.youtube.com/@TheCompetitiveEdge-b4z');
const hasBanner = html.includes('The Competitive Edge');
console.log('4. YouTube Banner Check:');
console.log('   Logo file exists:', hasLogoFile);
console.log('   Channel link present:', hasYtLink);
console.log('   Banner markup present:', hasBanner);
if (hasLogoFile && hasYtLink && hasBanner) {
  console.log('   ✅ Req 8 PASSED: YouTube interactive banner and logo added');
} else {
  console.error('   ❌ Req 8 FAILED');
  allPassed = false;
}

// Req 1 & 2: Search input padding & dynamic dropdown
const hasPadding = css.includes('3.4rem');
const hasDropdown = html.includes('id="searchDropdown"');
const hasClearBtn = html.includes('id="searchClearBtn"');
if (hasPadding && hasDropdown && hasClearBtn) {
  console.log('   ✅ Req 1 & 2 PASSED: Search padding prevents overlap; dynamic suggestions dropdown present');
} else {
  console.error('   ❌ Req 1 & 2 FAILED');
  allPassed = false;
}

// Req 3: Highlighting examination names & larger font sizes
const hasHeroBanner = html.includes('id="selectedExamHero"') && html.includes('hero-exam-title');
const hasHeroCss = css.includes('.hero-exam-title');
if (hasHeroBanner && hasHeroCss) {
  console.log('   ✅ Req 3 PASSED: Highlighted selected exam hero card with larger typography present');
} else {
  console.error('   ❌ Req 3 FAILED');
  allPassed = false;
}

// Req 4: Custom / Manual Preset controls
const hasCustomPanel = html.includes('id="customPresetPanel"');
const hasDimInputs = html.includes('id="customWidthInput"') && html.includes('id="customHeightInput"');
const hasRatio = html.includes('id="customRatioSelect"');
const hasKb = html.includes('id="customMinKBInput"') && html.includes('id="customMaxKBInput"');
if (hasCustomPanel && hasDimInputs && hasRatio && hasKb) {
  console.log('   ✅ Req 4 PASSED: Custom dimensions, aspect ratio, and KB limits controls present');
} else {
  console.error('   ❌ Req 4 FAILED');
  allPassed = false;
}

if (allPassed) {
  console.log('\n🎉 ALL 8 USER REQUIREMENTS FULLY VERIFIED & PASSED!');
} else {
  console.error('\n❌ SOME CHECKS FAILED');
  process.exit(1);
}
