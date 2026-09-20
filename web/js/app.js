import { InteractiveCropper } from './cropper.js';
import { applyBrightnessContrast, applyDopStamp, cleanSignature, createStackedSignatures, enhanceThumbImpression } from '../../core/image-processor.js';
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
    this.cropper = null;
    this.processedBlob = null;
    this.processedDataUrl = null;
    this.currentRotation = 0;
    this.selectedCategory = 'all';
    this.searchQuery = '';
    this.webcamStream = null;

    // Crop mode: 'fit' (fit entire image & pad white) or 'crop' (frame subregion from page)
    this.cropMode = 'crop';

    // Adjustments & Filters
    this.settings = {
      brightness: 0,
      contrast: 0,
      dopEnabled: false,
      applicantName: '',
      photoDate: new Date().toISOString().split('T')[0],
      cleanSigEnabled: true,
      sigThreshold: 175,
      sigInkMode: 'keep_ink',
      stackSigEnabled: false,
      enhanceThumbEnabled: true,
      faceGuideVisible: false,
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
    this.renderCategoryPills();
    this.bindEvents();
    this.filterAndRenderExams();
    this.selectExam('ssc-cgl');
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

  renderCategoryPills() {
    const container = document.getElementById('categoryPills');
    if (!container) return;

    container.innerHTML = this.categories
      .map(cat => `
        <button class="category-pill ${cat.id === this.selectedCategory ? 'active' : ''}" data-cat="${cat.id}">
          ${cat.name}
        </button>
      `).join('');

    container.querySelectorAll('.category-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCategory = btn.dataset.cat;
        this.filterAndRenderExams();
      });
    });
  }

  filterAndRenderExams() {
    const examSelect = document.getElementById('examSelect');
    if (!examSelect) return;

    let filtered = this.exams;

    // Filter by Category
    if (this.selectedCategory && this.selectedCategory !== 'all') {
      filtered = filtered.filter(e => e.category === this.selectedCategory);
    }

    // Filter by Search Query
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.shortName && e.shortName.toLowerCase().includes(q)) ||
        (e.organizer && e.organizer.toLowerCase().includes(q)) ||
        (e.category && e.category.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      examSelect.innerHTML = '<option value="">No matching exams found</option>';
      return;
    }

    examSelect.innerHTML = filtered
      .map(e => `<option value="${e.id}">${e.name} (${e.year})</option>`)
      .join('');

    if (this.currentExam && filtered.some(e => e.id === this.currentExam.id)) {
      examSelect.value = this.currentExam.id;
    } else {
      this.selectExam(filtered[0].id);
    }
  }

  selectExam(examId) {
    this.currentExam = this.exams.find(e => e.id === examId) || this.exams[0];
    const examSelect = document.getElementById('examSelect');
    if (examSelect && this.currentExam) {
      examSelect.value = this.currentExam.id;
    }

    this.updateDocTypeTabs();
    this.updateSpecBanner();
    this.toggleToolControls();

    if (this.cropper && this.sourceImage) {
      const spec = this.getCurrentSpec();
      const targetW = spec.width || 350;
      const targetH = spec.height || 450;
      this.cropper.setAspectRatio(targetW, targetH);
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

    // Toggle PDF view button
    const viewPdfBtn = document.getElementById('viewPdfBtn');
    if (viewPdfBtn) {
      viewPdfBtn.style.display = docType === 'document' ? 'inline-flex' : 'none';
    }

    // Toggle PDF preview vs Canvas preview
    const pdfPreview = document.getElementById('pdfDocumentPreview');
    const cropperMount = document.getElementById('cropperMount');
    const cropModeBar = document.getElementById('cropModeBar');

    if (docType === 'document') {
      if (pdfPreview) pdfPreview.style.display = 'block';
      if (cropperMount) cropperMount.style.display = 'none';
      if (cropModeBar) cropModeBar.style.display = 'none';
    } else {
      if (pdfPreview) pdfPreview.style.display = 'none';
      if (cropperMount) cropperMount.style.display = 'flex';
      if (cropModeBar) cropModeBar.style.display = 'flex';
    }

    if (this.cropper && this.sourceImage) {
      const spec = this.getCurrentSpec();
      const targetW = spec.width || 350;
      const targetH = spec.height || 450;
      this.cropper.setAspectRatio(targetW, targetH);
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
      declaration: '📝 Declaration',
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

    // Auto-enable DOP if exam strictly mandates it
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
    const pdfGroup = document.getElementById('pdfToolGroup');
    const faceBtn = document.getElementById('faceGuideToggleBtn');

    if (dopGroup) dopGroup.style.display = this.currentDocType === 'photo' ? 'block' : 'none';
    if (faceBtn) faceBtn.style.display = this.currentDocType === 'photo' ? 'inline-flex' : 'none';
    if (sigGroup) sigGroup.style.display = this.currentDocType === 'signature' ? 'block' : 'none';
    if (thumbGroup) thumbGroup.style.display = this.currentDocType === 'thumb' ? 'block' : 'none';
    if (pdfGroup) pdfGroup.style.display = this.currentDocType === 'document' ? 'block' : 'none';
  }

  bindEvents() {
    const fileInput = document.getElementById('fileInput');
    const cameraInput = document.getElementById('cameraInput');
    const dropzone = document.getElementById('dropzone');
    const browseFileBtn = document.getElementById('browseFileBtn');
    const openCameraBtn = document.getElementById('openCameraBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const viewPdfBtn = document.getElementById('viewPdfBtn');
    const shareBtn = document.getElementById('shareBtn');
    const rotateLeftBtn = document.getElementById('rotateLeftBtn');
    const rotateRightBtn = document.getElementById('rotateRightBtn');
    const faceBtn = document.getElementById('faceGuideToggleBtn');
    const resetCropBtn = document.getElementById('resetCropBtn');
    const applyCropBtn = document.getElementById('applyCropBtn');
    const autoFixBtn = document.getElementById('autoFixBtn');
    const themeBtn = document.getElementById('themeToggleBtn');
    const searchInput = document.getElementById('examSearchInput');
    const examSelect = document.getElementById('examSelect');

    // Mode Buttons (Fit Entire Image vs Crop Region)
    const modeFitBtn = document.getElementById('modeFitBtn');
    const modeCropBtn = document.getElementById('modeCropBtn');

    modeFitBtn?.addEventListener('click', () => {
      this.cropMode = 'fit';
      modeFitBtn.className = 'btn btn-primary';
      modeCropBtn.className = 'btn btn-secondary';
      if (this.cropper) {
        this.cropper.setMode('fit');
        this.processImage();
      }
    });

    modeCropBtn?.addEventListener('click', () => {
      this.cropMode = 'crop';
      modeCropBtn.className = 'btn btn-primary';
      modeFitBtn.className = 'btn btn-secondary';
      if (this.cropper) {
        this.cropper.setMode('crop');
        this.processImage();
      }
    });

    // Search & Selection
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim();
      this.filterAndRenderExams();
    });

    examSelect?.addEventListener('change', (e) => {
      this.selectExam(e.target.value);
    });

    // Trending chips
    document.querySelectorAll('.trending-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.id;
        this.selectExam(id);
      });
    });

    // Clean Button triggers (prevent event bubbling to dropzone)
    browseFileBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });

    openCameraBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openCamera();
    });

    // Drag and drop zone (clicking outside buttons also triggers fileInput)
    if (dropzone) {
      dropzone.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        fileInput?.click();
      });
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

    // Rotation
    rotateLeftBtn?.addEventListener('click', () => {
      this.currentRotation = (this.currentRotation - 90 + 360) % 360;
      if (this.cropper) {
        this.cropper.setRotation(this.currentRotation);
        this.processImage();
      }
    });

    rotateRightBtn?.addEventListener('click', () => {
      this.currentRotation = (this.currentRotation + 90) % 360;
      if (this.cropper) {
        this.cropper.setRotation(this.currentRotation);
        this.processImage();
      }
    });

    // Crop Actions
    resetCropBtn?.addEventListener('click', () => {
      if (this.cropper) {
        this.cropper.resetCropToAspectRatio();
        this.cropper.renderCropBox();
        this.processImage();
      }
    });

    applyCropBtn?.addEventListener('click', () => {
      this.processImage();
    });

    autoFixBtn?.addEventListener('click', () => {
      if (this.cropper) {
        const spec = this.getCurrentSpec();
        const targetW = spec.width || 350;
        const targetH = spec.height || 450;
        this.cropper.setAspectRatio(targetW, targetH);
        this.processImage();
      }
    });

    // Brightness & Contrast
    const brightnessSlider = document.getElementById('brightnessSlider');
    const brightnessVal = document.getElementById('brightnessVal');
    const contrastSlider = document.getElementById('contrastSlider');
    const contrastVal = document.getElementById('contrastVal');

    brightnessSlider?.addEventListener('input', (e) => {
      this.settings.brightness = parseInt(e.target.value, 10);
      if (brightnessVal) brightnessVal.textContent = e.target.value;
      this.processImage();
    });

    contrastSlider?.addEventListener('input', (e) => {
      this.settings.contrast = parseInt(e.target.value, 10);
      if (contrastVal) contrastVal.textContent = e.target.value;
      this.processImage();
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

    // Signature Clean & Stack controls
    const sigCleanToggle = document.getElementById('sigCleanToggle');
    const sigThresholdSlider = document.getElementById('sigThreshold');
    const sigThresholdVal = document.getElementById('sigThresholdVal');
    const stackSigToggle = document.getElementById('stackSigToggle');

    sigCleanToggle?.addEventListener('change', (e) => {
      this.settings.cleanSigEnabled = e.target.checked;
      this.processImage();
    });

    sigThresholdSlider?.addEventListener('input', (e) => {
      this.settings.sigThreshold = parseInt(e.target.value, 10);
      if (sigThresholdVal) sigThresholdVal.textContent = e.target.value;
      this.processImage();
    });

    stackSigToggle?.addEventListener('change', (e) => {
      this.settings.stackSigEnabled = e.target.checked;
      this.processImage();
    });

    // Thumb Impression control
    const thumbToggle = document.getElementById('thumbCleanToggle');
    thumbToggle?.addEventListener('change', (e) => {
      this.settings.enhanceThumbEnabled = e.target.checked;
      this.processImage();
    });

    // Face Guide Toggle
    faceBtn?.addEventListener('click', () => {
      this.settings.faceGuideVisible = !this.settings.faceGuideVisible;
      if (this.cropper) {
        this.cropper.setFaceGuideVisible(this.settings.faceGuideVisible);
      }
    });

    // Download & Share
    downloadBtn?.addEventListener('click', () => this.downloadFile());
    viewPdfBtn?.addEventListener('click', () => {
      if (this.processedDataUrl) {
        window.open(this.processedDataUrl, '_blank');
      }
    });
    shareBtn?.addEventListener('click', () => this.shareFile());

    // Theme toggle
    themeBtn?.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    });

    // Webcam Modal buttons
    document.getElementById('closeCameraModalBtn')?.addEventListener('click', () => this.closeCameraModal());
    document.getElementById('snapPhotoBtn')?.addEventListener('click', () => this.snapWebcamPhoto());
  }

  openCamera() {
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // On mobile devices, native camera input is the most reliable
      const cameraInput = document.getElementById('cameraInput');
      cameraInput?.click();
    } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      // On desktop/laptop, open live webcam modal
      const modal = document.getElementById('cameraModal');
      const video = document.getElementById('webcamVideo');

      navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } })
        .then((stream) => {
          this.webcamStream = stream;
          if (video) video.srcObject = stream;
          if (modal) modal.style.display = 'flex';
        })
        .catch((err) => {
          console.log('Webcam access error, falling back to file dialog:', err);
          document.getElementById('cameraInput')?.click();
        });
    } else {
      document.getElementById('cameraInput')?.click();
    }
  }

  closeCameraModal() {
    const modal = document.getElementById('cameraModal');
    if (modal) modal.style.display = 'none';

    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => track.stop());
      this.webcamStream = null;
    }
  }

  snapWebcamPhoto() {
    const video = document.getElementById('webcamVideo');
    if (!video || !video.videoWidth) return;

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = video.videoWidth;
    snapCanvas.height = video.videoHeight;
    const ctx = snapCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    snapCanvas.toBlob((blob) => {
      this.closeCameraModal();
      const file = new File([blob], 'camera_capture.jpg', { type: 'image/jpeg' });
      this.handleFileUpload(file);
    }, 'image/jpeg', 0.95);
  }

  handleFileUpload(file) {
    this.sourceFile = file;

    // Check for HEIC
    if (file.name.toLowerCase().endsWith('.heic') || file.type.includes('heic')) {
      alert('HEIC file detected. Your browser will convert it to standard JPG for exam portal submission.');
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        this.sourceImage = img;
        this.currentRotation = 0;

        // Mount Interactive Cropper
        const mount = document.getElementById('cropperMount');
        const spec = this.getCurrentSpec();
        const targetW = spec.width || 350;
        const targetH = spec.height || 450;

        if (!this.cropper) {
          this.cropper = new InteractiveCropper(mount, {
            aspectRatio: targetW / targetH,
            onCropChange: () => {
              clearTimeout(this._cropDebounce);
              this._cropDebounce = setTimeout(() => this.processImage(), 120);
            }
          });
        }

        this.cropper.setImage(img, targetW, targetH, 0);
        this.cropper.setMode(this.cropMode);

        // Update PDF thumbnail if in document mode
        const pdfThumb = document.getElementById('pdfDocThumb');
        if (pdfThumb) pdfThumb.src = img.src;

        // Show editor, comparison stats, and validation
        document.getElementById('editorCard').style.display = 'block';
        document.getElementById('validationCard').style.display = 'block';
        document.getElementById('actionBar').style.display = 'flex';

        // Update original stats
        const origKB = (file.size / 1024).toFixed(1);
        const origStats = document.getElementById('origStats');
        if (origStats) {
          origStats.textContent = `${origKB} KB • ${img.naturalWidth} × ${img.naturalHeight} px`;
        }

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

    // Handle Certificate to PDF mode
    if (spec.format === 'application/pdf' || this.currentDocType === 'document') {
      await this.processPdfDocument(spec);
      return;
    }

    if (!this.cropper) return;

    // Determine target canvas dimensions prescribed by the exam
    const targetW = spec.width || 350;
    const targetH = spec.height || 450;

    // 1. Extract canvas: handles both Fit Entire Image (Pad White) and Crop Selection!
    let canvas = this.cropper.getCroppedCanvas(targetW, targetH);

    // 2. Apply Brightness and Contrast
    if (this.settings.brightness !== 0 || this.settings.contrast !== 0) {
      canvas = applyBrightnessContrast(canvas, this.settings.brightness, this.settings.contrast);
    }

    // 3. Document-type specific filters
    if (this.currentDocType === 'signature') {
      if (this.settings.cleanSigEnabled) {
        canvas = cleanSignature(canvas, {
          threshold: this.settings.sigThreshold,
          inkMode: this.settings.sigInkMode
        });
      }
      if (this.settings.stackSigEnabled) {
        canvas = createStackedSignatures(canvas, 3);
      }
    } else if (this.currentDocType === 'thumb' && this.settings.enhanceThumbEnabled) {
      canvas = enhanceThumbImpression(canvas);
    } else if (this.currentDocType === 'photo' && this.settings.dopEnabled) {
      canvas = applyDopStamp(canvas, this.settings.applicantName, this.settings.photoDate);
    }

    // 4. Smart Iterative Compression to hit [minKB, maxKB] (enhances lower sizes into prescribed range)
    const compressRes = await compressCanvasToKB(canvas, {
      minKB: spec.minKB || 10,
      maxKB: spec.maxKB || 50,
      format: spec.format || 'image/jpeg'
    });

    this.processedBlob = compressRes.blob;
    this.processedDataUrl = URL.createObjectURL(this.processedBlob);

    // Update Processed stats
    const procStats = document.getElementById('procStats');
    if (procStats) {
      procStats.textContent = `${compressRes.sizeKB} KB • ${canvas.width} × ${canvas.height} px • ${spec.formatName || 'JPG'}`;
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
    // Generate 100% valid PDF from uploaded certificate image
    const pdfRes = await createPdfFromImages([{
      blob: this.sourceFile,
      width: this.sourceImage.naturalWidth || 800,
      height: this.sourceImage.naturalHeight || 1000
    }], { pageSize: 'A4', margin: 20 });

    this.processedBlob = pdfRes.blob;
    this.processedDataUrl = URL.createObjectURL(this.processedBlob);

    const pdfThumb = document.getElementById('pdfDocThumb');
    if (pdfThumb) {
      pdfThumb.src = this.sourceImage.src;
    }

    const procStats = document.getElementById('procStats');
    if (procStats) {
      procStats.textContent = `${pdfRes.sizeKB} KB • A4 PDF (${pdfRes.pageCount} Page)`;
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
    const autoFixBox = document.getElementById('autoFixBox');

    if (!badge || !summary || !checksBody) return;

    if (validation.isValid) {
      badge.className = 'badge badge-pass';
      badge.innerHTML = '✓ PASS - Ready to Upload';
      if (autoFixBox) autoFixBox.style.display = 'none';
    } else if (validation.status === 'WARNING') {
      badge.className = 'badge badge-warning';
      badge.innerHTML = '⚠️ Minor Warning';
      if (autoFixBox) autoFixBox.style.display = 'flex';
    } else {
      badge.className = 'badge badge-fail';
      badge.innerHTML = '❌ Needs Adjustment';
      if (autoFixBox) autoFixBox.style.display = 'flex';
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
