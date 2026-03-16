/* ================================================
   TYPO MOSAIC — App Logic
   Photo-to-Typography mosaic engine
   ================================================ */

(function () {
  'use strict';

  // ===== State =====
  const state = {
    imageData: null,        // original image as ImageData
    imageWidth: 0,
    imageHeight: 0,
    simplicity: 50,         // 1 (simple) to 100 (detailed)
    fontMin: 6,
    fontMax: 24,
    brightnessThreshold: 200,
    words: [],
    generating: false,
  };

  // ===== DOM References =====
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const sourcePreview = document.getElementById('source-preview');
  const btnClear = document.getElementById('btn-clear-image');
  const wordBankEl = document.getElementById('word-bank');
  const simplicitySlider = document.getElementById('simplicity-slider');
  const simplicityVal = document.getElementById('simplicity-val');
  const fontMinSlider = document.getElementById('font-min');
  const fontMaxSlider = document.getElementById('font-max');
  const fontMinVal = document.getElementById('font-min-val');
  const fontMaxVal = document.getElementById('font-max-val');
  const brightnessSlider = document.getElementById('brightness-threshold');
  const brightnessVal = document.getElementById('brightness-val');
  const btnGenerate = document.getElementById('btn-generate');
  const btnDownload = document.getElementById('btn-download');
  const outputCanvas = document.getElementById('output-canvas');
  const outputPlaceholder = document.getElementById('output-placeholder');
  const ctx = outputCanvas.getContext('2d');

  // ===== Word bank parsing =====
  function parseWords() {
    const raw = wordBankEl.value.trim();
    state.words = raw
      .split(/[,\n]+/)
      .map(w => w.trim().toUpperCase())
      .filter(w => w.length > 0);
  }

  // ===== Image Loading =====
  function loadImage(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Analyze image brightness data
        const analysisCanvas = document.createElement('canvas');
        const maxDim = 800;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          const scale = maxDim / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        analysisCanvas.width = w;
        analysisCanvas.height = h;
        const aCtx = analysisCanvas.getContext('2d');
        aCtx.drawImage(img, 0, 0, w, h);
        state.imageData = aCtx.getImageData(0, 0, w, h);
        state.imageWidth = w;
        state.imageHeight = h;

        // Show preview
        sourcePreview.src = e.target.result;
        dropZone.classList.add('has-image');
        btnGenerate.disabled = false;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    state.imageData = null;
    state.imageWidth = 0;
    state.imageHeight = 0;
    sourcePreview.src = '';
    dropZone.classList.remove('has-image');
    btnGenerate.disabled = true;
    btnDownload.disabled = true;
    outputCanvas.style.display = 'none';
    outputPlaceholder.style.display = '';
  }

  // ===== Drag & Drop =====
  dropZone.addEventListener('click', (e) => {
    if (e.target === btnClear) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) loadImage(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) loadImage(e.dataTransfer.files[0]);
  });

  btnClear.addEventListener('click', (e) => {
    e.stopPropagation();
    clearImage();
  });

  // ===== Slider bindings =====
  // Debounced auto-regeneration
  let autoGenTimer = null;
  function scheduleAutoGen() {
    if (!state.imageData) return;
    clearTimeout(autoGenTimer);
    autoGenTimer = setTimeout(() => generateMosaic(), 250);
  }

  simplicitySlider.addEventListener('input', () => {
    state.simplicity = parseInt(simplicitySlider.value, 10);
    simplicityVal.textContent = state.simplicity;
    scheduleAutoGen();
  });

  fontMinSlider.addEventListener('input', () => {
    state.fontMin = parseInt(fontMinSlider.value, 10);
    fontMinVal.textContent = state.fontMin;
    scheduleAutoGen();
  });

  fontMaxSlider.addEventListener('input', () => {
    state.fontMax = parseInt(fontMaxSlider.value, 10);
    fontMaxVal.textContent = state.fontMax;
    scheduleAutoGen();
  });

  brightnessSlider.addEventListener('input', () => {
    state.brightnessThreshold = parseInt(brightnessSlider.value, 10);
    brightnessVal.textContent = state.brightnessThreshold;
    scheduleAutoGen();
  });

  // Auto-regen when word bank changes
  wordBankEl.addEventListener('input', () => {
    scheduleAutoGen();
  });

  // ===== Brightness Sampling =====
  function getBrightness(x, y) {
    if (!state.imageData) return 255;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= state.imageWidth || iy < 0 || iy >= state.imageHeight) return 255;
    const idx = (iy * state.imageWidth + ix) * 4;
    const r = state.imageData.data[idx];
    const g = state.imageData.data[idx + 1];
    const b = state.imageData.data[idx + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // ===== Core mosaic generation =====
  function generateMosaic() {
    if (!state.imageData || state.generating) return;
    parseWords();
    if (state.words.length === 0) return;

    state.generating = true;
    btnGenerate.querySelector('.btn-text').textContent = 'Generating...';
    btnGenerate.querySelector('.btn-spinner').style.display = 'inline-block';
    btnGenerate.disabled = true;

    // Defer to next frame so UI updates
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          renderMosaic();
        } finally {
          state.generating = false;
          btnGenerate.querySelector('.btn-text').textContent = 'Generate Mosaic';
          btnGenerate.querySelector('.btn-spinner').style.display = 'none';
          btnGenerate.disabled = false;
          btnDownload.disabled = false;
        }
      }, 50);
    });
  }

  function renderMosaic() {
    const imgW = state.imageWidth;
    const imgH = state.imageHeight;

    // Output canvas size — scale up for quality
    const scale = 2;
    const canvasW = imgW * scale;
    const canvasH = imgH * scale;

    outputCanvas.width = canvasW;
    outputCanvas.height = canvasH;
    outputCanvas.style.display = 'block';
    outputCanvas.style.width = imgW + 'px';
    outputCanvas.style.height = imgH + 'px';
    outputPlaceholder.style.display = 'none';

    // Background — always white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Font size based on simplicity: low simplicity = large font (few words), high = small font (many)
    const t = state.simplicity / 100;
    const fontSize = Math.round(lerp(state.fontMax, state.fontMin, t) * scale);
    const lineHeight = Math.round(fontSize * 1.35);
    const wordGap = Math.round(fontSize * 0.4);  // space between words
    const margin = Math.round(8 * scale);

    const fontFamily = "'Special Elite', 'Courier New', Courier, monospace";
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let wordIndex = 0;
    let cursorX = margin;
    let cursorY = margin;

    // Flow words like a book page, row by row
    while (cursorY + fontSize < canvasH) {
      // Pick the next word
      const word = state.words[wordIndex % state.words.length];
      wordIndex++;

      // Measure the word width
      const wordWidth = ctx.measureText(word).width;

      // Line wrap: if word doesn't fit on current line, move to next line
      if (cursorX + wordWidth > canvasW - margin) {
        cursorX = margin;
        cursorY += lineHeight;
        if (cursorY + fontSize > canvasH) break;
      }

      // Sample brightness from the source image at this word's position
      // Map canvas coords back to image coords
      const imgX = (cursorX + wordWidth / 2) / scale;
      const imgY = (cursorY + fontSize / 2) / scale;

      // Sample a small area around the word center for smoother results
      const sampleRadius = Math.max(Math.round(fontSize / scale * 0.4), 2);
      let totalBrightness = 0;
      let sampleCount = 0;
      for (let sy = -sampleRadius; sy <= sampleRadius; sy += 2) {
        for (let sx = -sampleRadius; sx <= sampleRadius; sx += 2) {
          totalBrightness += getBrightness(imgX + sx, imgY + sy);
          sampleCount++;
        }
      }
      const avgBrightness = totalBrightness / Math.max(sampleCount, 1);

      // Compute opacity: darker image areas → more opaque text
      // Bright areas above threshold → nearly invisible
      let alpha;
      if (avgBrightness >= state.brightnessThreshold) {
        alpha = 0.03; // very faint in bright areas (keeps the book-page texture)
      } else {
        const darkRatio = 1 - (avgBrightness / state.brightnessThreshold);
        alpha = 0.05 + darkRatio * 0.95;
      }

      ctx.fillStyle = `rgba(26, 26, 26, ${alpha})`;
      ctx.fillText(word, cursorX, cursorY);

      // Advance cursor past this word + gap
      cursorX += wordWidth + wordGap;
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  // ===== Generate & Download =====
  btnGenerate.addEventListener('click', generateMosaic);

  btnDownload.addEventListener('click', () => {
    if (!outputCanvas.width) return;
    const link = document.createElement('a');
    link.download = 'typo-mosaic.png';
    link.href = outputCanvas.toDataURL('image/png');
    link.click();
  });

  // ===== Init =====
  parseWords();

})();
