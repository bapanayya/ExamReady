/**
 * Interactive Image Cropper
 * Mobile-touch and mouse enabled cropper with:
 * 1. "Fit Entire Image (Pad White)" for already cropped photos/signatures
 * 2. "Crop Selection" for extracting photos/signatures from full pages
 * 3. Aspect-ratio locking, corner drag handles, rule-of-thirds grid, and face guide overlay.
 */

export class InteractiveCropper {
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.aspectRatio = options.aspectRatio || 1; // targetWidth / targetHeight
    this.onCropChange = options.onCropChange || null;

    this.sourceImage = null;
    this.rotation = 0; // 0, 90, 180, 270
    this.mode = 'crop'; // 'crop' or 'fit'

    // Source image dimensions (accounting for rotation)
    this.imgWidth = 0;
    this.imgHeight = 0;

    // Display scale factor (display px / natural px)
    this.scale = 1;

    // Crop box in natural image pixel coordinates: { x, y, width, height }
    this.crop = { x: 0, y: 0, width: 0, height: 0 };

    // Interaction state
    this.isDragging = false;
    this.dragMode = null; // 'move', 'nw', 'ne', 'sw', 'se'
    this.dragStart = { x: 0, y: 0 };
    this.initialCrop = { x: 0, y: 0, width: 0, height: 0 };

    this.showFaceGuide = false;
    this.lockRatio = true;
    this.brightness = 0;
    this.contrast = 0;

    this.initDOM();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="cropper-stage" style="position:relative; overflow:hidden; user-select:none; display:inline-block; max-width:100%; border-radius:8px;">
        <canvas class="cropper-base-canvas" style="display:block; max-width:100%; height:auto;"></canvas>
        <div class="cropper-mask" style="position:absolute; inset:0; pointer-events:none;"></div>
        <div class="cropper-box" style="position:absolute; box-sizing:border-box; border:2px solid #2563eb; cursor:move; touch-action:none; display:none;">
          <div class="crop-grid-h1" style="position:absolute; top:33.33%; left:0; right:0; height:1px; border-top:1px dashed rgba(255,255,255,0.4); pointer-events:none;"></div>
          <div class="crop-grid-h2" style="position:absolute; top:66.66%; left:0; right:0; height:1px; border-top:1px dashed rgba(255,255,255,0.4); pointer-events:none;"></div>
          <div class="crop-grid-v1" style="position:absolute; left:33.33%; top:0; bottom:0; width:1px; border-left:1px dashed rgba(255,255,255,0.4); pointer-events:none;"></div>
          <div class="crop-grid-v2" style="position:absolute; left:66.66%; top:0; bottom:0; width:1px; border-left:1px dashed rgba(255,255,255,0.4); pointer-events:none;"></div>
          <div class="cropper-face-guide" style="position:absolute; inset:8%; border:2px dashed rgba(59,130,246,0.85); border-radius:50% 50% 50% 50% / 60% 60% 40% 40%; pointer-events:none; display:none;"></div>
          <!-- Handles -->
          <div class="crop-handle handle-nw" data-handle="nw" style="position:absolute; top:-7px; left:-7px; width:14px; height:14px; background:#2563eb; border:2px solid #fff; border-radius:50%; cursor:nwse-resize;"></div>
          <div class="crop-handle handle-ne" data-handle="ne" style="position:absolute; top:-7px; right:-7px; width:14px; height:14px; background:#2563eb; border:2px solid #fff; border-radius:50%; cursor:nesw-resize;"></div>
          <div class="crop-handle handle-sw" data-handle="sw" style="position:absolute; bottom:-7px; left:-7px; width:14px; height:14px; background:#2563eb; border:2px solid #fff; border-radius:50%; cursor:nesw-resize;"></div>
          <div class="crop-handle handle-se" data-handle="se" style="position:absolute; bottom:-7px; right:-7px; width:14px; height:14px; background:#2563eb; border:2px solid #fff; border-radius:50%; cursor:nwse-resize;"></div>
        </div>
      </div>
    `;

    this.stage = this.container.querySelector('.cropper-stage');
    this.canvas = this.container.querySelector('.cropper-base-canvas');
    this.mask = this.container.querySelector('.cropper-mask');
    this.box = this.container.querySelector('.cropper-box');
    this.faceGuide = this.container.querySelector('.cropper-face-guide');

    this.bindEvents();
  }

  setImage(image, targetW, targetH, rotation = 0) {
    this.sourceImage = image;
    this.rotation = rotation;
    this.aspectRatio = targetW / targetH;

    const isPerp = Math.abs(this.rotation % 180) === 90;
    this.imgWidth = isPerp ? image.naturalHeight : image.naturalWidth;
    this.imgHeight = isPerp ? image.naturalWidth : image.naturalHeight;

    this.renderBaseCanvas();
    this.setFilters(this.brightness, this.contrast);
    this.resetCropToAspectRatio();
    this.renderCropBox();
  }

  setFilters(brightness = 0, contrast = 0) {
    this.brightness = brightness;
    this.contrast = contrast;
    if (this.canvas) {
      const b = 100 + brightness;
      const c = 100 + contrast;
      this.canvas.style.filter = `brightness(${b}%) contrast(${c}%)`;
    }
  }

  setMode(mode) {
    this.mode = mode; // 'crop' or 'fit'
    if (this.mode === 'fit') {
      // In fit mode, the selection represents the whole image
      this.crop = { x: 0, y: 0, width: this.imgWidth, height: this.imgHeight };
      if (this.box) {
        this.box.style.display = 'none'; // hide crop box handles
      }
    } else {
      this.resetCropToAspectRatio();
      this.renderCropBox();
    }
    this.notifyCropChange();
  }

  setAspectRatio(targetW, targetH) {
    this.aspectRatio = targetW / targetH;
    if (this.mode === 'crop') {
      this.resetCropToAspectRatio();
      this.renderCropBox();
    }
    this.notifyCropChange();
  }

  setRotation(deg) {
    this.rotation = deg;
    const isPerp = Math.abs(this.rotation % 180) === 90;
    this.imgWidth = isPerp ? this.sourceImage.naturalHeight : this.sourceImage.naturalWidth;
    this.imgHeight = isPerp ? this.sourceImage.naturalWidth : this.sourceImage.naturalHeight;

    this.renderBaseCanvas();
    this.setFilters(this.brightness, this.contrast);
    if (this.mode === 'fit') {
      this.crop = { x: 0, y: 0, width: this.imgWidth, height: this.imgHeight };
    } else {
      this.resetCropToAspectRatio();
      this.renderCropBox();
    }
  }

  setFaceGuideVisible(visible) {
    this.showFaceGuide = visible;
    if (this.faceGuide) {
      this.faceGuide.style.display = (visible && this.mode === 'crop') ? 'block' : 'none';
    }
  }

  renderBaseCanvas() {
    if (!this.sourceImage) return;

    this.canvas.width = this.imgWidth;
    this.canvas.height = this.imgHeight;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.imgWidth, this.imgHeight);

    ctx.save();
    ctx.translate(this.imgWidth / 2, this.imgHeight / 2);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.drawImage(
      this.sourceImage,
      -this.sourceImage.naturalWidth / 2,
      -this.sourceImage.naturalHeight / 2
    );
    ctx.restore();

    this.updateScale();
  }

  updateScale() {
    const rect = this.canvas.getBoundingClientRect();
    this.scale = rect.width / this.imgWidth;
  }

  resetCropToAspectRatio() {
    if (!this.imgWidth || !this.imgHeight) return;

    let cropW = this.imgWidth;
    let cropH = cropW / this.aspectRatio;

    if (cropH > this.imgHeight) {
      cropH = this.imgHeight;
      cropW = cropH * this.aspectRatio;
    }

    // Shrink slightly for comfortable margin
    cropW = Math.round(cropW * 0.96);
    cropH = Math.round(cropH * 0.96);

    const cropX = Math.round((this.imgWidth - cropW) / 2);
    const cropY = Math.round((this.imgHeight - cropH) / 2);

    this.crop = { x: cropX, y: cropY, width: cropW, height: cropH };
    this.notifyCropChange();
  }

  renderCropBox() {
    if (!this.box || !this.crop.width || this.mode === 'fit') {
      if (this.box && this.mode === 'fit') this.box.style.display = 'none';
      return;
    }
    this.updateScale();

    const dispX = Math.round(this.crop.x * this.scale);
    const dispY = Math.round(this.crop.y * this.scale);
    const dispW = Math.round(this.crop.width * this.scale);
    const dispH = Math.round(this.crop.height * this.scale);

    this.box.style.display = 'block';
    this.box.style.left = `${dispX}px`;
    this.box.style.top = `${dispY}px`;
    this.box.style.width = `${dispW}px`;
    this.box.style.height = `${dispH}px`;

    // Render dark translucent backdrop outside crop box
    this.box.style.boxShadow = `0 0 0 9999px rgba(0, 0, 0, 0.55)`;
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.renderCropBox();
    });

    // Pointer events on the crop box and handles
    this.box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.isDragging = true;
      this.updateScale();

      const targetHandle = e.target.dataset.handle;
      this.dragMode = targetHandle || 'move';

      this.dragStart = { x: e.clientX, y: e.clientY };
      this.initialCrop = { ...this.crop };

      document.body.style.userSelect = 'none';
      e.target.setPointerCapture(e.pointerId);
    });

    const handlePointerMove = (e) => {
      if (!this.isDragging || this.mode === 'fit') return;
      e.preventDefault();

      const dx = (e.clientX - this.dragStart.x) / this.scale;
      const dy = (e.clientY - this.dragStart.y) / this.scale;

      if (this.dragMode === 'move') {
        let newX = this.initialCrop.x + dx;
        let newY = this.initialCrop.y + dy;

        // Keep inside bounds
        newX = Math.max(0, Math.min(this.imgWidth - this.crop.width, newX));
        newY = Math.max(0, Math.min(this.imgHeight - this.crop.height, newY));

        this.crop.x = Math.round(newX);
        this.crop.y = Math.round(newY);
      } else {
        this.handleResize(dx, dy, this.dragMode);
      }

      this.renderCropBox();
      this.notifyCropChange();
    };

    const handlePointerUp = () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.dragMode = null;
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }

  handleResize(dx, dy, handle) {
    const init = this.initialCrop;
    let newW = init.width;
    let newH = init.height;
    let newX = init.x;
    let newY = init.y;

    if (handle === 'se') {
      newW = Math.max(40, init.width + dx);
      if (this.lockRatio) {
        newH = newW / this.aspectRatio;
      } else {
        newH = Math.max(40, init.height + dy);
      }
      if (newX + newW > this.imgWidth) {
        newW = this.imgWidth - newX;
        if (this.lockRatio) newH = newW / this.aspectRatio;
      }
      if (newY + newH > this.imgHeight) {
        newH = this.imgHeight - newY;
        if (this.lockRatio) newW = newH * this.aspectRatio;
      }
    } else if (handle === 'sw') {
      newW = Math.max(40, init.width - dx);
      if (this.lockRatio) {
        newH = newW / this.aspectRatio;
      } else {
        newH = Math.max(40, init.height + dy);
      }
      newX = init.x + (init.width - newW);
      if (newX < 0) {
        newX = 0;
        newW = init.x + init.width;
        if (this.lockRatio) newH = newW / this.aspectRatio;
      }
      if (newY + newH > this.imgHeight) {
        newH = this.imgHeight - newY;
        if (this.lockRatio) {
          newW = newH * this.aspectRatio;
          newX = init.x + (init.width - newW);
        }
      }
    } else if (handle === 'ne') {
      newW = Math.max(40, init.width + dx);
      if (this.lockRatio) {
        newH = newW / this.aspectRatio;
      } else {
        newH = Math.max(40, init.height - dy);
      }
      newY = init.y + (init.height - newH);
      if (newX + newW > this.imgWidth) {
        newW = this.imgWidth - newX;
        if (this.lockRatio) {
          newH = newW / this.aspectRatio;
          newY = init.y + (init.height - newH);
        }
      }
      if (newY < 0) {
        newY = 0;
        newH = init.y + init.height;
        if (this.lockRatio) newW = newH * this.aspectRatio;
      }
    } else if (handle === 'nw') {
      newW = Math.max(40, init.width - dx);
      if (this.lockRatio) {
        newH = newW / this.aspectRatio;
      } else {
        newH = Math.max(40, init.height - dy);
      }
      newX = init.x + (init.width - newW);
      newY = init.y + (init.height - newH);
      if (newX < 0) {
        newX = 0;
        newW = init.x + init.width;
        if (this.lockRatio) newH = newW / this.aspectRatio;
      }
      if (newY < 0) {
        newY = 0;
        newH = init.y + init.height;
        if (this.lockRatio) {
          newW = newH * this.aspectRatio;
          newX = init.x + (init.width - newW);
        }
      }
    }

    this.crop = {
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(newW),
      height: Math.round(newH)
    };
  }

  notifyCropChange() {
    if (this.onCropChange) {
      this.onCropChange(this.getCropBox());
    }
  }

  getCropBox() {
    return { ...this.crop };
  }

  /**
   * Generates a rendered canvas cropped or fitted to targetWidth and targetHeight.
   * In 'fit' mode: fits whole image into target canvas with clean white margins (zero cut-off).
   * In 'crop' mode: extracts selected region and scales to target canvas.
   */
  getCroppedCanvas(targetWidth, targetHeight, options = {}) {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetWidth;
    outCanvas.height = targetHeight;
    const ctx = outCanvas.getContext('2d');

    // Fill clean white background
    ctx.fillStyle = options.backgroundColor || '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (this.mode === 'fit') {
      // Case A: Fit entire image inside target dimensions with white margins (letterbox / pillarbox)
      const scale = Math.min(targetWidth / this.imgWidth, targetHeight / this.imgHeight);
      const drawW = Math.round(this.imgWidth * scale);
      const drawH = Math.round(this.imgHeight * scale);
      const drawX = Math.round((targetWidth - drawW) / 2);
      const drawY = Math.round((targetHeight - drawH) / 2);

      ctx.drawImage(this.canvas, 0, 0, this.imgWidth, this.imgHeight, drawX, drawY, drawW, drawH);
    } else {
      // Case B: Extract specific crop region from page/image
      ctx.drawImage(
        this.canvas,
        this.crop.x,
        this.crop.y,
        this.crop.width,
        this.crop.height,
        0,
        0,
        targetWidth,
        targetHeight
      );
    }

    return outCanvas;
  }
}
