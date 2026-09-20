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
    this.activeSuggestionIndex = -1;
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

  getCategoryName(catId) {
    const cat = this.categories?.find(c => c.id === catId);
    return cat ? cat.name : (catId || 'Exam');
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  highlightMatch(text, query) {
    if (!query || !query.trim()) return this.escapeHtml(text);
    const escapedQ = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQ})`, 'gi');
    return this.escapeHtml(text).replace(regex, '<mark>$1</mark>');
  }

  renderSearchSuggestions(query) {
    const dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;

    if (!query || !query.trim()) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      this.activeSuggestionIndex = -1;
      return;
    }

    const q = query.toLowerCase().trim();
    const matches = this.exams.filter(e => {
      return e.name.toLowerCase().includes(q) ||
        (e.shortName && e.shortName.toLowerCase().includes(q)) ||
        (e.organizer && e.organizer.toLowerCase().includes(q)) ||
        (e.category && e.category.toLowerCase().includes(q));
    });

    if (matches.length === 0) {
      dropdown.innerHTML = `
        <div class="search-no-results">
          <p>No exams matching "<strong>${this.escapeHtml(query)}</strong>"</p>
          <button type="button" class="btn btn-secondary" id="suggestCustomBtn" style="margin-top:0.6rem; font-size:0.8rem; padding:0.4rem 0.85rem;">
            ⚙️ Open Custom / Manual Preset
          </button>
        </div>
      `;
      dropdown.style.display = 'block';
      document.getElementById('suggestCustomBtn')?.addEventListener('click', () => {
        this.selectExam('custom-spec');
        dropdown.style.display = 'none';
      });
      return;
    }

    const displayMatches = matches.slice(0, 15);
    let html = `<div class="search-dropdown-header">Found ${matches.length} matching examination${matches.length > 1 ? 's' : ''}</div>`;

    html += displayMatches.map((exam, idx) => {
      const catName = this.getCategoryName(exam.category);
      const highlightedTitle = this.highlightMatch(exam.name, q);
      const photoSpec = exam.specs?.photo;
      const sigSpec = exam.specs?.signature;
      let specsText = '';
      if (photoSpec) specsText += `Photo: ${photoSpec.minKB}-${photoSpec.maxKB}KB`;
      if (sigSpec) specsText += `${specsText ? ' • ' : ''}Sign: ${sigSpec.minKB}-${sigSpec.maxKB}KB`;

      return `
        <div class="search-suggestion-item" data-id="${exam.id}" data-index="${idx}">
          <div class="suggestion-main">
            <div class="suggestion-title">${highlightedTitle}</div>
            <div class="suggestion-org">${this.escapeHtml(exam.organizer || 'Official Examination')}</div>
          </div>
          <div class="suggestion-meta">
            <span class="suggestion-cat-badge">${this.escapeHtml(catName)}</span>
            <span class="suggestion-specs">${specsText}</span>
          </div>
        </div>
      `;
    }).join('');

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
    this.activeSuggestionIndex = -1;

    dropdown.querySelectorAll('.search-suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const exam = this.exams.find(e => e.id === id);
        if (exam) {
          const searchInput = document.getElementById('examSearchInput');
          if (searchInput) searchInput.value = exam.name;
          const clearBtn = document.getElementById('searchClearBtn');
          if (clearBtn) clearBtn.style.display = 'flex';
        }
        this.selectExam(id);
        dropdown.style.display = 'none';
      });
    });
  }

  highlightActiveSuggestion(items) {
    items.forEach((it, idx) => {
      if (idx === this.activeSuggestionIndex) {
        it.classList.add('highlighted');
        it.scrollIntoView({ block: 'nearest' });
      } else {
        it.classList.remove('highlighted');
      }
    });
  }

  filterAndRenderExams() {
    let filtered = this.exams;

    if (this.selectedCategory && this.selectedCategory !== 'all') {
      filtered = filtered.filter(e => e.category === this.selectedCategory);
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.shortName && e.shortName.toLowerCase().includes(q)) ||
        (e.organizer && e.organizer.toLowerCase().includes(q)) ||
        (e.category && e.category.toLowerCase().includes(q))
      );
    }

    if (filtered.length > 0) {
      if (!this.currentExam || !filtered.some(e => e.id === this.currentExam.id)) {
        this.selectExam(filtered[0].id);
      }
    }
  }

  selectExam(examId) {
    this.currentExam = this.exams.find(e => e.id === examId) || this.exams[0];
    const examSelect = document.getElementById('examSelect');
    if (examSelect && this.currentExam) {
      examSelect.value = this.currentExam.id;
    }

    // Update Prominent Selected Exam Hero Card
    const heroTitle = document.getElementById('heroExamTitle');
    const heroOrg = document.getElementById('heroOrganizer');
    const heroBadge = document.getElementById('heroCategoryBadge');
    const heroSource = document.getElementById('heroSource');

    if (heroTitle && this.currentExam) {
      heroTitle.textContent = this.currentExam.name;
    }
    if (heroOrg && this.currentExam) {
      heroOrg.textContent = this.currentExam.organizer || 'Official Authority';
    }
    if (heroBadge && this.currentExam) {
      heroBadge.textContent = this.getCategoryName(this.currentExam.category);
    }
    if (heroSource && this.currentExam) {
      heroSource.textContent = this.currentExam.officialSource ? this.currentExam.officialSource : 'Official Verified Guidelines';
    }

    // Toggle custom preset panel
    const customPanel = document.getElementById('customPresetPanel');
    if (customPanel) {
      if (this.currentExam.id === 'custom-spec') {
        customPanel.style.display = 'block';
        const wInput = document.getElementById('customWidthInput');
        const hInput = document.getElementById('customHeightInput');
        const minKB = document.getElementById('customMinKBInput');
        const maxKB = document.getElementById('customMaxKBInput');
        const fmt = document.getElementById('customFormatSelect');
        if (wInput) wInput.value = this.settings.customWidth;
        if (hInput) hInput.value = this.settings.customHeight;
        if (minKB) minKB.value = this.settings.customMinKB;
        if (maxKB) maxKB.value = this.settings.customMaxKB;
        if (fmt) fmt.value = this.settings.customFormat;
      } else {
        customPanel.style.display = 'none';
      }
    }

    this.updateDocTypeTabs();
    this.updateSpecBanner();
    this.toggleToolControls();

    if (this.sourceImage) {
      if (this.currentDocType === 'document' || (this.currentExam.id === 'custom-spec' && this.settings.customFormat === 'application/pdf')) {
        this.processPdfDocument(this.getCurrentSpec());
      } else if (this.cropper) {
        const spec = this.getCurrentSpec();
        const targetW = spec.width || 350;
        const targetH = spec.height || 450;
        this.cropper.setAspectRatio(targetW, targetH);
        this.processImage();
      }
    }
  }

  selectDocType(docType) {
    this.currentDocType = docType;
    document.querySelectorAll('.doc-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.type === docType);
    });
    this.updateSpecBanner();
    this.toggleToolControls();

    const viewPdfBtn = document.getElementById('viewPdfBtn');
    if (viewPdfBtn) {
      viewPdfBtn.style.display = docType === 'document' ? 'inline-flex' : 'none';
    }

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

    if (this.sourceImage) {
      if (docType === 'document') {
        this.processPdfDocument(this.getCurrentSpec());
      } else if (this.cropper) {
        const spec = this.getCurrentSpec();
        const targetW = spec.width || 350;
        const targetH = spec.height || 450;
        this.cropper.setAspectRatio(targetW, targetH);
        this.processImage();
      }
    }
  }

  getCurrentSpec() {
    if (!this.currentExam || !this.currentExam.specs) return null;
    const spec = this.currentExam.specs[this.currentDocType];
    if (this.currentExam.id === 'custom-spec') {
      const isPdf = this.settings.customFormat === 'application/pdf' || this.currentDocType === 'document';
      return {
        ...(spec || {}),
        width: isPdf ? null : this.settings.customWidth,
        height: isPdf ? null : this.settings.customHeight,
        minKB: this.settings.customMinKB,
        maxKB: this.settings.customMaxKB,
        format: isPdf ? 'application/pdf' : this.settings.customFormat,
        formatName: isPdf ? 'PDF' : (this.settings.customFormat === 'image/png' ? 'PNG' : 'JPG/JPEG'),
        instructions: isPdf
          ? `Custom PDF Document: ${this.settings.customMinKB} KB to ${this.settings.customMaxKB} KB.`
          : `Custom manual preset: ${this.settings.customWidth} × ${this.settings.customHeight} px, ${this.settings.customMinKB} KB to ${this.settings.customMaxKB} KB.`
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
      : (spec.minWidth ? `${spec.minWidth}-${spec.maxWidth}w × ${spec.minHeight}-${spec.maxHeight}h px` : 'Auto A4 Layout');

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

    const searchClearBtn = document.getElementById('searchClearBtn');
    const searchDropdown = document.getElementById('searchDropdown');

    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      if (searchClearBtn) {
        searchClearBtn.style.display = this.searchQuery.trim().length > 0 ? 'flex' : 'none';
      }
      this.renderSearchSuggestions(this.searchQuery);
      this.filterAndRenderExams();
    });

    searchInput?.addEventListener('focus', () => {
      if (searchInput.value.trim().length > 0) {
        this.renderSearchSuggestions(searchInput.value);
      }
    });

    searchInput?.addEventListener('keydown', (e) => {
      if (!searchDropdown || searchDropdown.style.display === 'none') return;
      const items = searchDropdown.querySelectorAll('.search-suggestion-item');
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeSuggestionIndex = (this.activeSuggestionIndex + 1) % items.length;
        this.highlightActiveSuggestion(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeSuggestionIndex = (this.activeSuggestionIndex - 1 + items.length) % items.length;
        this.highlightActiveSuggestion(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.activeSuggestionIndex >= 0 && items[this.activeSuggestionIndex]) {
          items[this.activeSuggestionIndex].click();
        } else if (items[0]) {
          items[0].click();
        }
      } else if (e.key === 'Escape') {
        searchDropdown.style.display = 'none';
      }
    });

    searchClearBtn?.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      if (searchClearBtn) searchClearBtn.style.display = 'none';
      if (searchDropdown) searchDropdown.style.display = 'none';
      this.searchQuery = '';
      this.filterAndRenderExams();
    });

    // Close search suggestions on clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box-wrapper')) {
        if (searchDropdown) searchDropdown.style.display = 'none';
      }
    });

    examSelect?.addEventListener('change', (e) => {
      this.selectExam(e.target.value);
    });

    document.querySelectorAll('.trending-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.id;
        this.selectExam(id);
      });
    });

    // Custom Preset Controls
    const customWidthInput = document.getElementById('customWidthInput');
    const customHeightInput = document.getElementById('customHeightInput');
    const customRatioSelect = document.getElementById('customRatioSelect');
    const customMinKBInput = document.getElementById('customMinKBInput');
    const customMaxKBInput = document.getElementById('customMaxKBInput');
    const customFormatSelect = document.getElementById('customFormatSelect');

    const updateCustomSpecs = () => {
      this.settings.customWidth = parseInt(customWidthInput?.value, 10) || 350;
      this.settings.customHeight = parseInt(customHeightInput?.value, 10) || 450;
      this.settings.customMinKB = parseInt(customMinKBInput?.value, 10) || 10;
      this.settings.customMaxKB = parseInt(customMaxKBInput?.value, 10) || 50;
      this.settings.customFormat = customFormatSelect?.value || 'image/jpeg';

      this.updateSpecBanner();

      if (this.sourceImage) {
        if (this.currentDocType === 'document' || this.settings.customFormat === 'application/pdf') {
          this.processPdfDocument(this.getCurrentSpec());
        } else if (this.cropper) {
          this.cropper.setAspectRatio(this.settings.customWidth, this.settings.customHeight);
          this.processImage();
        }
      }
    };

    customWidthInput?.addEventListener('input', updateCustomSpecs);
    customHeightInput?.addEventListener('input', updateCustomSpecs);
    customMinKBInput?.addEventListener('input', updateCustomSpecs);
    customMaxKBInput?.addEventListener('input', updateCustomSpecs);
    customFormatSelect?.addEventListener('change', updateCustomSpecs);

    customRatioSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      const w = parseInt(customWidthInput?.value, 10) || 350;
      let h = parseInt(customHeightInput?.value, 10) || 450;

      if (val === '1:1') {
        h = w;
      } else if (val === '3.5:4.5') {
        h = Math.round(w * 4.5 / 3.5);
      } else if (val === '2:1') {
        h = Math.round(w / 2);
      } else if (val === '7:3') {
        h = Math.round(w * 3 / 7);
      } else if (val === '3.5:1') {
        h = Math.round(w / 3.5);
      } else if (val === '4:3') {
        h = Math.round(w * 3 / 4);
      } else if (val === '16:9') {
        h = Math.round(w * 9 / 16);
      }

      if (customHeightInput) customHeightInput.value = h;
      updateCustomSpecs();
    });

    document.querySelectorAll('.quick-dim-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const w = parseInt(chip.dataset.w, 10);
        const h = parseInt(chip.dataset.h, 10);
        if (customWidthInput) customWidthInput.value = w;
        if (customHeightInput) customHeightInput.value = h;
        document.querySelectorAll('.quick-dim-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        updateCustomSpecs();
      });
    });

    document.querySelectorAll('.quick-kb-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const min = parseInt(chip.dataset.min, 10);
        const max = parseInt(chip.dataset.max, 10);
        if (customMinKBInput) customMinKBInput.value = min;
        if (customMaxKBInput) customMaxKBInput.value = max;
        document.querySelectorAll('.quick-kb-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        updateCustomSpecs();
      });
    });

    browseFileBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });

    openCameraBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openCamera();
    });

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

    rotateLeftBtn?.addEventListener('click', () => {
      this.currentRotation = (this.currentRotation - 90 + 360) % 360;
      if (this.currentDocType === 'document') {
        this.processPdfDocument(this.getCurrentSpec());
      } else if (this.cropper) {
        this.cropper.setRotation(this.currentRotation);
        this.processImage();
      }
    });

    rotateRightBtn?.addEventListener('click', () => {
      this.currentRotation = (this.currentRotation + 90) % 360;
      if (this.currentDocType === 'document') {
        this.processPdfDocument(this.getCurrentSpec());
      } else if (this.cropper) {
        this.cropper.setRotation(this.currentRotation);
        this.processImage();
      }
    });

    resetCropBtn?.addEventListener('click', () => {
      if (this.cropper) {
        this.cropper.resetCropToAspectRatio();
        this.cropper.renderCropBox();
        this.processImage();
      }
    });

    applyCropBtn?.addEventListener('click', () => {
      if (this.currentDocType === 'document') {
        this.processPdfDocument(this.getCurrentSpec());
      } else {
        this.processImage();
      }
    });

    autoFixBtn?.addEventListener('click', () => {
      const spec = this.getCurrentSpec();
      if (this.currentDocType === 'document') {
        this.processPdfDocument(spec);
      } else if (this.cropper) {
        const targetW = spec.width || 350;
        const targetH = spec.height || 450;
        this.cropper.setAspectRatio(targetW, targetH);
        this.processImage();
      }
    });

    const brightnessSlider = document.getElementById('brightnessSlider');
    const brightnessVal = document.getElementById('brightnessVal');
    const contrastSlider = document.getElementById('contrastSlider');
    const contrastVal = document.getElementById('contrastVal');

    brightnessSlider?.addEventListener('input', (e) => {
      this.settings.brightness = parseInt(e.target.value, 10);
      if (brightnessVal) brightnessVal.textContent = e.target.value;
      if (this.cropper) {
        this.cropper.setFilters(this.settings.brightness, this.settings.contrast);
      }
      if (this.currentDocType === 'document') {
        this.processPdfDocument(this.getCurrentSpec());
      } else {
        this.processImage();
      }
    });

    contrastSlider?.addEventListener('input', (e) => {
      this.settings.contrast = parseInt(e.target.value, 10);
      if (contrastVal) contrastVal.textContent = e.target.value;
      if (this.cropper) {
        this.cropper.setFilters(this.settings.brightness, this.settings.contrast);
      }
      if (this.currentDocType === 'document') {
        this.processPdfDocument(this.getCurrentSpec());
      } else {
        this.processImage();
      }
    });

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

    const thumbToggle = document.getElementById('thumbCleanToggle');
    thumbToggle?.addEventListener('change', (e) => {
      this.settings.enhanceThumbEnabled = e.target.checked;
      this.processImage();
    });

    faceBtn?.addEventListener('click', () => {
      this.settings.faceGuideVisible = !this.settings.faceGuideVisible;
      if (this.cropper) {
        this.cropper.setFaceGuideVisible(this.settings.faceGuideVisible);
      }
    });

    downloadBtn?.addEventListener('click', () => this.downloadFile());
    viewPdfBtn?.addEventListener('click', () => {
      if (this.processedDataUrl) {
        window.open(this.processedDataUrl, '_blank');
      }
    });
    shareBtn?.addEventListener('click', () => this.shareFile());

    themeBtn?.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    });

    document.getElementById('closeCameraModalBtn')?.addEventListener('click', () => this.closeCameraModal());
    document.getElementById('snapPhotoBtn')?.addEventListener('click', () => this.snapWebcamPhoto());
  }

  openCamera() {
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      document.getElementById('cameraInput')?.click();
    } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
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

    if (file.name.toLowerCase().endsWith('.heic') || file.type.includes('heic')) {
      alert('HEIC file detected. Your browser will convert it to standard JPG for exam portal submission.');
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        this.sourceImage = img;
        this.currentRotation = 0;

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
        this.cropper.setFilters(this.settings.brightness, this.settings.contrast);

        const pdfThumb = document.getElementById('pdfDocThumb');
        if (pdfThumb) pdfThumb.src = img.src;

        document.getElementById('editorCard').style.display = 'block';
        document.getElementById('validationCard').style.display = 'block';
        document.getElementById('actionBar').style.display = 'flex';

        const origKB = (file.size / 1024).toFixed(1);
        const origStats = document.getElementById('origStats');
        if (origStats) {
          origStats.textContent = `${origKB} KB • ${img.naturalWidth} × ${img.naturalHeight} px`;
        }

        if (this.currentDocType === 'document') {
          this.processPdfDocument(spec);
        } else {
          this.processImage();
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  async processImage() {
    if (!this.sourceImage || !this.cropper) return;

    const spec = this.getCurrentSpec();
    if (!spec) return;

    if (spec.format === 'application/pdf' || this.currentDocType === 'document') {
      await this.processPdfDocument(spec);
      return;
    }

    const targetW = spec.width || 350;
    const targetH = spec.height || 450;

    let canvas = this.cropper.getCroppedCanvas(targetW, targetH);

    if (this.settings.brightness !== 0 || this.settings.contrast !== 0) {
      canvas = applyBrightnessContrast(canvas, this.settings.brightness, this.settings.contrast);
    }

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

    const compressRes = await compressCanvasToKB(canvas, {
      minKB: spec.minKB || 10,
      maxKB: spec.maxKB || 50,
      format: spec.format || 'image/jpeg'
    });

    this.processedBlob = compressRes.blob;
    this.processedDataUrl = URL.createObjectURL(this.processedBlob);

    const procThumb = document.getElementById('procOutputThumb');
    if (procThumb && this.processedDataUrl) {
      procThumb.src = this.processedDataUrl;
    }

    const procStats = document.getElementById('procStats');
    if (procStats) {
      procStats.textContent = `${compressRes.sizeKB} KB • ${canvas.width} × ${canvas.height} px • ${spec.formatName || 'JPG'}`;
    }

    const validation = validateFileAgainstSpec({
      width: canvas.width,
      height: canvas.height,
      sizeBytes: compressRes.sizeBytes,
      type: spec.format || 'image/jpeg',
      formatName: spec.formatName || 'JPG'
    }, spec);

    this.renderValidation(validation, compressRes.sizeKB, canvas.width, canvas.height, spec);
  }

  async processPdfDocument(spec) {
    if (!this.sourceImage) return;

    // 1. Draw onto offscreen document canvas
    const maxDim = 1600;
    let w = this.sourceImage.naturalWidth || 1200;
    let h = this.sourceImage.naturalHeight || 1600;

    // Account for rotation
    const isPerp = Math.abs(this.currentRotation % 180) === 90;
    const baseW = isPerp ? h : w;
    const baseH = isPerp ? w : h;

    let targetW = baseW;
    let targetH = baseH;
    if (targetW > maxDim || targetH > maxDim) {
      const scale = maxDim / Math.max(targetW, targetH);
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
    }

    const docCanvas = document.createElement('canvas');
    docCanvas.width = targetW;
    docCanvas.height = targetH;
    const ctx = docCanvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);

    ctx.save();
    ctx.translate(targetW / 2, targetH / 2);
    ctx.rotate((this.currentRotation * Math.PI) / 180);
    ctx.drawImage(
      this.sourceImage,
      -this.sourceImage.naturalWidth / 2,
      -this.sourceImage.naturalHeight / 2,
      this.sourceImage.naturalWidth,
      this.sourceImage.naturalHeight
    );
    ctx.restore();

    // 2. Apply Brightness & Contrast
    let processedCanvas = docCanvas;
    if (this.settings.brightness !== 0 || this.settings.contrast !== 0) {
      processedCanvas = applyBrightnessContrast(docCanvas, this.settings.brightness, this.settings.contrast);
    }

    // 3. Compress document image strictly to target KB range (leaving 2KB margin for PDF envelope)
    const targetMaxKB = Math.max(20, (spec.maxKB || 300) - 2);
    const targetMinKB = Math.max(10, (spec.minKB || 20));
    const targetKB = Math.round(targetMinKB + (targetMaxKB - targetMinKB) * 0.45);

    const compressRes = await compressCanvasToKB(processedCanvas, {
      minKB: targetMinKB,
      maxKB: targetMaxKB,
      format: 'image/jpeg',
      targetKB
    });

    // 4. Build Standards-Compliant PDF 1.4
    const pdfRes = await createPdfFromImages([{
      blob: compressRes.blob,
      width: processedCanvas.width,
      height: processedCanvas.height
    }], { pageSize: 'A4', margin: 20 });

    this.processedBlob = pdfRes.blob;
    this.processedDataUrl = URL.createObjectURL(this.processedBlob);

    const pdfThumb = document.getElementById('pdfDocThumb');
    if (pdfThumb) {
      pdfThumb.src = processedCanvas.toDataURL('image/jpeg', 0.85);
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

    this.renderValidation(validation, pdfRes.sizeKB, 'A4', 'Page', spec);
  }

  renderValidation(validation, actualKB, actualW, actualH, spec = null) {
    const badge = document.getElementById('statusBadge');
    const summary = document.getElementById('validationSummary');
    const checksBody = document.getElementById('checksTableBody');
    const autoFixBox = document.getElementById('autoFixBox');

    if (!badge || !summary || !checksBody) return;

    if (validation.isValid) {
      badge.className = 'badge badge-pass';
      badge.innerHTML = '✓ PASS - Ready to Upload';
      if (autoFixBox) autoFixBox.style.display = 'none';
    } else {
      if (validation.status === 'WARNING') {
        badge.className = 'badge badge-warning';
        badge.innerHTML = '⚠️ Minor Warning';
      } else {
        badge.className = 'badge badge-fail';
        badge.innerHTML = '❌ Needs Adjustment';
      }

      // Configure Auto-Fix Box dynamically based on the actual failure
      if (autoFixBox) {
        autoFixBox.style.display = 'flex';
        const sizeCheck = validation.checks.find(c => c.name === 'File Size');
        const dimCheck = validation.checks.find(c => c.name.includes('Dimensions') || c.name.includes('Aspect'));

        const fixText = autoFixBox.querySelector('span');
        const fixBtn = document.getElementById('autoFixBtn');

        if (sizeCheck && !sizeCheck.passed) {
          const currentSize = parseFloat(actualKB);
          const maxKB = spec ? spec.maxKB : 300;
          const minKB = spec ? spec.minKB : 20;

          if (currentSize > maxKB) {
            if (fixText) fixText.innerHTML = `⚠️ <strong>File size (${actualKB} KB) exceeds the maximum limit of ${maxKB} KB.</strong>`;
            if (fixBtn) fixBtn.innerHTML = `⚡ Auto-Reduce Size to Under ${maxKB} KB`;
          } else {
            if (fixText) fixText.innerHTML = `⚠️ <strong>File size (${actualKB} KB) is below the minimum required ${minKB} KB.</strong>`;
            if (fixBtn) fixBtn.innerHTML = `⚡ Enhance Size to ${minKB} KB - ${maxKB} KB`;
          }
        } else if (dimCheck && !dimCheck.passed) {
          if (fixText) fixText.innerHTML = `⚠️ <strong>Dimensions do not match the required ${dimCheck.expected}.</strong>`;
          if (fixBtn) fixBtn.innerHTML = `✂️ Auto-Crop & Fit to Exam Size`;
        }
      }
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
