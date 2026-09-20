import { cropAndScale, applyDopStamp, cleanSignature, enhanceThumbImpression, rotateCanvas } from '../../core/image-processor.js';
import { compressCanvasToKB } from '../../core/compressor.js';
import { validateFileAgainstSpec } from '../../core/validator.js';
import { createPdfFromImages } from '../../core/pdf-builder.js';

class ExamToolkitApp {
  constructor() {
    this.exams = [];
    this.categories = [];
    this.currentExam = null;
    this.currentDocType = 'photo';
    this.sourceImage = null;
    this.sourceFile = null;
    this.processedBlob = null;
    this.processedDataUrl = null;
    this.currentRotation = 0;

    // Multi-page document support
    this.documentPages = [];

    // Edit settings
    this.settings = {
      dopEnabled: false,
      applicantName: '',
      photoDate: new Date().toISOString().split('T')[0],
      cleanSigEnabled: true,
      sigThreshold: 175,
      sigInkMode: 'keep_ink',
      enhanceThumbEnabled: true,
      customWidth: 300,
      customHeight: 400,
      customMinKB: 20,
      customMaxKB: 100,
      customFormat: 'image/jpeg'
    };
  }

  async init() {
    await this.loadData();
    this.registerServiceWorker();
    this.bindEvents();
    this.renderExamSelect();
    this.selectExam(this.exams[0]?.id || 'ssc-cgl-chsl');
  }

  async loadData() {
    try {
      const [examsRes, catRes] = await Promise.all([
        fetch('../core/exams.json'),
        fetch('../core/categories.json')
      ]);
      this.exams = await examsRes.json();
      this.categories = await catRes.json();
    } catch (e) {
      console.error('Failed to load specifications:', e);
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
          console.log('SW registration skipped or failed:', err);
        });
      });
    }
  }

  renderExamSelect() {
    const catSelect = document.getElementById('categorySelect');
    const examSelect = document.getElementById('examSelect');
    if (!catSelect || !examSelect) return;

    catSelect.innerHTML = this.categories
      .map(c => `<option value="${c.id}">${c.name}</option>`)
      .join('');

    this.updateExamDropdown();

    catSelect.addEventListener('change', () => {
      this.updateExamDropdown();
      this.selectExam(examSelect.value);
    });

    examSelect.addEventListener('change', () => {
      this.selectExam(examSelect.value);
    });
  }

  updateExamDropdown() {
    const catSelect = document.getElementById('categorySelect');
    const examSelect = document.getElementById('examSelect');
    const selectedCat = catSelect.value;

    const filtered = this.exams.filter(e => e.category === selectedCat);
    examSelect.innerHTML = filtered
      .map(e => `<option value="${e.id}">${e.name} (${e.year})</option>`)
      .join('');
  }

  selectExam(examId) {
    this.currentExam = this.exams.find(e => e.id === examId) || this.exams[0];
    this.updateDocTypeTabs();
    this.updateSpecBanner();
    if (this.sourceImage) {
      this.processImage();
    }
  }

  selectDocType(docType) {
    this.currentDocType = docType;
    document.querySelectorAll('.doc-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.type === docType);
    });
    this.updateSpecBanner();
    this.toggleToolControls();
    if (this.sourceImage) {
      this.processImage();
    }
  }

  getCurrentSpec() {
    if (!this.currentExam || !this.currentExam.specs) return null;
    const spec = this.currentExam.specs[this.currentDocType];
    if (this.currentExam.id === 'custom-spec' && spec) {
      return {
        ...spec,
        width: this.settings.customWidth,
        height: this.settings.customHeight,
        minKB: this.settings.customMinKB,
        maxKB: this.settings.customMaxKB,
        format: this.settings.customFormat
      };
    }
    return spec;
  }

  updateDocTypeTabs() {
    const tabsContainer = document.getElementById('docTypeTabs');
    if (!tabsContainer || !this.currentExam) return;

    const availableTypes = Object.keys(this.currentExam.specs);
    const typeIcons = {
      photo: '📸 Passport Photo',
      signature: '✍️ Signature',
      thumb: '👆 Thumb Impression',
      declaration: '📝 Handwritten Declaration',
      document: '📄 Certificate to PDF'
    };

    tabsContainer.innerHTML = availableTypes
      .map(type => `
        <button class="doc-tab ${type === this.currentDocType ? 'active' : ''}" data-type="${type}">
          ${typeIcons[type] || type}
        </button>
      `).join('');

    tabsContainer.querySelectorAll('.doc-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectDocType(btn.dataset.type);
      });
    });

    if (!availableTypes.includes(this.currentDocType)) {
      this.currentDocType = availableTypes[0];
    }
  }

  updateSpecBanner() {
    const banner = document.getElementById('specBanner');
    const spec = this.getCurrentSpec();
    if (!banner || !spec) return;

    const dimStr = spec.width && spec.height
      ? `${spec.width} × ${spec.height} px`
      : (spec.minWidth ? `${spec.minWidth}-${spec.maxWidth}w × ${spec.minHeight}-${spec.maxHeight}h px` : 'Auto A4');

    banner.innerHTML = `
      <div class="spec-grid">
        <div class="spec-item">
          <span class="label">Required Size</span>
          <span class="val">${spec.minKB} KB - ${spec.maxKB} KB</span>
        </div>
        <div class="spec-item">
          <span class="label">Dimensions</span>
          <span class="val">${dimStr}</span>
        </div>
        <div class="spec-item">
          <span class="label">Format</span>
          <span class="val">${spec.formatName || 'JPG'}</span>
        </div>
        <div class="spec-item">
          <span class="label">Background / Ink</span>
          <span class="val" style="font-size:0.8rem">${spec.background || spec.inkColor || 'Standard'}</span>
        </div>
      </div>
      <div class="spec-instructions">
        <span>ℹ️</span>
        <span><strong>Official Rule:</strong> ${spec.instructions || ''} (${this.currentExam.officialSource || ''})</span>
      </div>
      ${spec.sampleText ? `
        <div class="declaration-preview-box">
          <strong>Official Declaration Text Template:</strong><br/>
          "${spec.sampleText}"
        </div>
      ` : ''}
    `;

    // Automatically enable DOP if exam strictly mandates it
    if (spec.dopRequired) {
      this.settings.dopEnabled = true;
      const dopToggle = document.getElementById('dopToggle');
      if (dopToggle) dopToggle.checked = true;
    }
  }

  toggleToolControls() {
    const dopGroup = document.getElementById('dopToolGroup');
    const sigGroup = document.getElementById('sigToolGroup');
    const thumbGroup = document.getElementById('thumbToolGroup');
    const customGroup = document.getElementById('customToolGroup');
    const pdfGroup = document.getElementById('pdfToolGroup');

    if (dopGroup) dopGroup.style.display = this.currentDocType === 'photo' ? 'block' : 'none';
    if (sigGroup) sigGroup.style.display = this.currentDocType === 'signature' ? 'block' : 'none';
    if (thumbGroup) thumbGroup.style.display = this.currentDocType === 'thumb' ? 'block' : 'none';
    if (customGroup) customGroup.style.display = this.currentExam?.id === 'custom-spec' ? 'block' : 'none';
    if (pdfGroup) pdfGroup.style.display = this.currentDocType === 'document' ? 'block' : 'none';
  }

  bindEvents() {
    const fileInput = document.getElementById('fileInput');
    const cameraInput = document.getElementById('cameraInput');
    const dropzone = document.getElementById('dropzone');
    const downloadBtn = document.getElementById('downloadBtn');
    const shareBtn = document.getElementById('shareBtn');
    const rotateBtn = document.getElementById('rotateRightBtn');
    const themeBtn = document.getElementById('themeToggleBtn');

    // Drag and drop
    if (dropzone) {
      dropzone.addEventListener('click', () => fileInput?.click());
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });
    }

    fileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleFileUpload(e.target.files[0]);
      }
    });

    cameraInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleFileUpload(e.target.files[0]);
      }
    });

    // DOP controls
    const dopToggle = document.getElementById('dopToggle');
    const applicantNameInput = document.getElementById('applicantName');
    const photoDateInput = document.getElementById('photoDate');

    dopToggle?.addEventListener('change', (e) => {
      this.settings.dopEnabled = e.target.checked;
      this.processImage();
    });

    applicantNameInput?.addEventListener('input', (e) => {
      this.settings.applicantName = e.target.value;
      this.processImage();
    });

    photoDateInput?.addEventListener('change', (e) => {
      this.settings.photoDate = e.target.value;
      this.processImage();
    });

    // Signature Clean controls
    const sigCleanToggle = document.getElementById('sigCleanToggle');
    const sigThresholdSlider = document.getElementById('sigThreshold');
    const sigThresholdVal = document.getElementById('sigThresholdVal');

    sigCleanToggle?.addEventListener('change', (e) => {
      this.settings.cleanSigEnabled = e.target.checked;
      this.processImage();
    });

    sigThresholdSlider?.addEventListener('input', (e) => {
      this.settings.sigThreshold = parseInt(e.target.value, 10);
      if (sigThresholdVal) sigThresholdVal.textContent = e.target.value;
      this.processImage();
    });

    // Thumb Impression control
    const thumbToggle = document.getElementById('thumbCleanToggle');
    thumbToggle?.addEventListener('change', (e) => {
      this.settings.enhanceThumbEnabled = e.target.checked;
      this.processImage();
    });

    // Rotation
    rotateBtn?.addEventListener('click', () => {
      this.currentRotation = (this.currentRotation + 90) % 360;
      this.processImage();
    });

    // Download & Share
    downloadBtn?.addEventListener('click', () => this.downloadFile());
    shareBtn?.addEventListener('click', () => this.shareFile());

    // Theme toggle
    themeBtn?.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    });
  }

  handleFileUpload(file) {
    this.sourceFile = file;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        this.sourceImage = img;
        this.currentRotation = 0;
        document.getElementById('editorCard').style.display = 'block';
        document.getElementById('validationCard').style.display = 'block';
        document.getElementById('actionBar').style.display = 'flex';
        this.processImage();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  async processImage() {
    if (!this.sourceImage) return;

    const spec = this.getCurrentSpec();
    if (!spec) return;

    // Handle PDF document mode
    if (spec.format === 'application/pdf' || this.currentDocType === 'document') {
      await this.processPdfDocument(spec);
      return;
    }

    // Determine target canvas dimensions
    const targetW = spec.width || 350;
    const targetH = spec.height || 450;

    // 1. Crop and Scale into target aspect
    let canvas = cropAndScale(
      this.sourceImage,
      { x: 0, y: 0, width: this.sourceImage.width, height: this.sourceImage.height },
      targetW,
      targetH
    );

    // 2. Rotate if requested
    if (this.currentRotation !== 0) {
      canvas = rotateCanvas(canvas, this.currentRotation);
    }

    // 3. Document-type specific filters
    if (this.currentDocType === 'signature' && this.settings.cleanSigEnabled) {
      canvas = cleanSignature(canvas, {
        threshold: this.settings.sigThreshold,
        inkMode: this.settings.sigInkMode
      });
    } else if (this.currentDocType === 'thumb' && this.settings.enhanceThumbEnabled) {
      canvas = enhanceThumbImpression(canvas);
    } else if (this.currentDocType === 'photo' && this.settings.dopEnabled) {
      canvas = applyDopStamp(canvas, this.settings.applicantName, this.settings.photoDate);
    }

    // 4. Smart Iterative Compression to hit [minKB, maxKB]
    const compressRes = await compressCanvasToKB(canvas, {
      minKB: spec.minKB || 10,
      maxKB: spec.maxKB || 50,
      format: spec.format || 'image/jpeg'
    });

    this.processedBlob = compressRes.blob;
    this.processedDataUrl = URL.createObjectURL(this.processedBlob);

    // Update preview canvas in DOM
    const previewImg = document.getElementById('previewImg');
    if (previewImg) {
      previewImg.src = this.processedDataUrl;
    }

    // 5. Validation Check
    const validation = validateFileAgainstSpec({
      width: canvas.width,
      height: canvas.height,
      sizeBytes: compressRes.sizeBytes,
      type: spec.format || 'image/jpeg',
      formatName: spec.formatName || 'JPG'
    }, spec);

    this.renderValidation(validation, compressRes.sizeKB, canvas.width, canvas.height);
  }

  async processPdfDocument(spec) {
    // Generate PDF from uploaded image
    const pdfRes = await createPdfFromImages([{
      blob: this.sourceFile,
      width: this.sourceImage.width,
      height: this.sourceImage.height
    }], { pageSize: 'A4', margin: 20 });

    this.processedBlob = pdfRes.blob;
    this.processedDataUrl = URL.createObjectURL(this.processedBlob);

    const previewImg = document.getElementById('previewImg');
    if (previewImg) {
      previewImg.src = './assets/icons/icon-512.svg'; // PDF preview placeholder
    }

    const validation = validateFileAgainstSpec({
      sizeBytes: pdfRes.sizeBytes,
      type: 'application/pdf',
      formatName: 'PDF'
    }, spec);

    this.renderValidation(validation, pdfRes.sizeKB, 'A4', 'Page');
  }

  renderValidation(validation, actualKB, actualW, actualH) {
    const badge = document.getElementById('statusBadge');
    const summary = document.getElementById('validationSummary');
    const checksBody = document.getElementById('checksTableBody');

    if (!badge || !summary || !checksBody) return;

    if (validation.isValid) {
      badge.className = 'badge badge-pass';
      badge.innerHTML = '✓ PASS - Ready to Upload';
    } else if (validation.status === 'WARNING') {
      badge.className = 'badge badge-warning';
      badge.innerHTML = '⚠️ Minor Warning';
    } else {
      badge.className = 'badge badge-fail';
      badge.innerHTML = '❌ Needs Adjustment';
    }

    summary.textContent = validation.summary;

    checksBody.innerHTML = validation.checks.map(c => `
      <tr>
        <td>${c.name}</td>
        <td>${c.expected}</td>
        <td><strong>${c.actual}</strong></td>
        <td class="${c.passed ? 'check-pass' : 'check-fail'}">
          ${c.passed ? '✓ PASS' : '✗ FAIL'}
        </td>
      </tr>
    `).join('');
  }

  downloadFile() {
    if (!this.processedBlob) return;
    const spec = this.getCurrentSpec();
    const ext = (spec?.format === 'application/pdf' || this.currentDocType === 'document') ? 'pdf' : 'jpg';
    const examSlug = (this.currentExam?.shortName || 'Exam').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${examSlug}_${this.currentDocType}_prepared.${ext}`;

    const a = document.createElement('a');
    a.href = this.processedDataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async shareFile() {
    if (!this.processedBlob || !navigator.share) {
      alert('Direct sharing is not supported on this browser. Please use the Download button.');
      return;
    }
    try {
      const spec = this.getCurrentSpec();
      const ext = spec?.format === 'application/pdf' ? 'pdf' : 'jpg';
      const file = new File([this.processedBlob], `exam_${this.currentDocType}.${ext}`, { type: this.processedBlob.type });
      await navigator.share({
        title: `${this.currentExam?.name} ${this.currentDocType}`,
        text: `Prepared ${this.currentDocType} according to ${this.currentExam?.name} rules.`,
        files: [file]
      });
    } catch (e) {
      console.log('Share dismissed or failed:', e);
    }
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  const app = new ExamToolkitApp();
  app.init();
  window.__examToolkitApp = app;
});
