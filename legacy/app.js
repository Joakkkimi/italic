/* ================================================
   ITALIC MODULATOR — App Logic
   Canvas-based typography modulation engine
   ================================================ */

(function () {
  'use strict';

  // ===== State =====
  const state = {
    text: 'MOZART',
    baseline: 'bottom',       // 'bottom' | 'top'
    heightPattern: 'linear-up',
    italicPattern: 'uniform',
    minHeight: 0,
    maxHeight: 100,
    minItalic: 0,
    maxItalic: 40,
    letterSpacing: 20,
    // per-letter computed values (0..1 normalized)
    heightValues: [],
    italicValues: [],
  };

  // ===== DOM references =====
  const canvas = document.getElementById('text-canvas');
  const ctx = canvas.getContext('2d');
  const textInput = document.getElementById('text-input');

  // Sliders
  const sliders = {
    minHeight: document.getElementById('min-height'),
    maxHeight: document.getElementById('max-height'),
    minItalic: document.getElementById('min-italic'),
    maxItalic: document.getElementById('max-italic'),
    letterSpacing: document.getElementById('letter-spacing'),
  };

  const sliderLabels = {
    minHeight: document.getElementById('min-height-val'),
    maxHeight: document.getElementById('max-height-val'),
    minItalic: document.getElementById('min-italic-val'),
    maxItalic: document.getElementById('max-italic-val'),
    letterSpacing: document.getElementById('letter-spacing-val'),
  };

  // ===== Pattern generators =====
  // Each returns an array of values from 0..1 for `count` letters

  const heightPatterns = {
    'linear-up': (n) => Array.from({ length: n }, (_, i) => i / Math.max(n - 1, 1)),
    'linear-down': (n) => Array.from({ length: n }, (_, i) => 1 - i / Math.max(n - 1, 1)),
    'arc-up': (n) => Array.from({ length: n }, (_, i) => {
      const t = i / Math.max(n - 1, 1);
      return Math.sin(t * Math.PI);
    }),
    'arc-down': (n) => Array.from({ length: n }, (_, i) => {
      const t = i / Math.max(n - 1, 1);
      return 1 - Math.sin(t * Math.PI);
    }),
    'wave': (n) => Array.from({ length: n }, (_, i) => {
      const t = i / Math.max(n - 1, 1);
      return 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    }),
    'random-height': (n) => Array.from({ length: n }, () => Math.random()),
  };

  const italicPatterns = {
    'uniform': (n) => Array.from({ length: n }, () => 1),
    'increasing': (n) => Array.from({ length: n }, (_, i) => i / Math.max(n - 1, 1)),
    'decreasing': (n) => Array.from({ length: n }, (_, i) => 1 - i / Math.max(n - 1, 1)),
    'alternating': (n) => Array.from({ length: n }, (_, i) => i % 2 === 0 ? 1 : -1).map(v => (v + 1) / 2),
    'wave-italic': (n) => Array.from({ length: n }, (_, i) => {
      const t = i / Math.max(n - 1, 1);
      return 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    }),
    'random-italic': (n) => Array.from({ length: n }, () => Math.random()),
  };

  // ===== Compute per-letter values =====
  function recomputeValues() {
    const n = state.text.length || 1;
    const hFn = heightPatterns[state.heightPattern] || heightPatterns['linear-up'];
    const iFn = italicPatterns[state.italicPattern] || italicPatterns['uniform'];
    state.heightValues = hFn(n);
    state.italicValues = iFn(n);
  }

  // ===== Canvas rendering =====
  let dpr = window.devicePixelRatio || 1;
  let animationId = null;

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function draw() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Clear
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    const text = state.text;
    if (!text.length) return;

    const n = text.length;

    // Available canvas area with padding
    const padding = 60;
    const availW = w - padding * 2;
    const availH = h - padding * 2;

    // Base font size proportional to canvas
    const baseFontSize = Math.min(availW * 0.75 / Math.max(n, 1), availH * 0.5);
    const maxFontSize = baseFontSize * 1.8;

    // Compute letter sizing & italic
    const letters = [];
    let totalWidth = 0;

    for (let i = 0; i < n; i++) {
      const hNorm = state.heightValues[i] !== undefined ? state.heightValues[i] : 0.5;
      const iNorm = state.italicValues[i] !== undefined ? state.italicValues[i] : 0.5;

      // Font size based on height modulation
      const minFS = lerp(baseFontSize * 0.3, baseFontSize, state.minHeight / 100);
      const maxFS = lerp(baseFontSize * 0.3, maxFontSize, state.maxHeight / 100);
      const fontSize = lerp(minFS, maxFS, hNorm);

      // Italic angle
      const italicAngle = lerp(state.minItalic, state.maxItalic, iNorm);

      // Measure letter width at this size
      ctx.font = `900 ${fontSize}px 'Playfair Display', Georgia, serif`;
      const metrics = ctx.measureText(text[i]);
      const letterWidth = metrics.width;

      letters.push({ char: text[i], fontSize, italicAngle, width: letterWidth });
      totalWidth += letterWidth + (i < n - 1 ? state.letterSpacing : 0);
    }

    // Auto-fit: if text overflows available width, scale everything down
    if (totalWidth > availW) {
      const scaleFactor = availW / totalWidth;
      totalWidth = 0;
      for (let i = 0; i < letters.length; i++) {
        letters[i].fontSize *= scaleFactor;
        ctx.font = `900 ${letters[i].fontSize}px 'Playfair Display', Georgia, serif`;
        letters[i].width = ctx.measureText(text[i]).width;
        totalWidth += letters[i].width + (i < n - 1 ? state.letterSpacing * scaleFactor : 0);
      }
    }

    // Position letters — centered in the available area
    let startX = (w - totalWidth) / 2;
    const baselineY = state.baseline === 'bottom'
      ? h * 0.62
      : h * 0.42;

    for (let i = 0; i < n; i++) {
      const lt = letters[i];
      const x = startX + lt.width / 2;

      // Vertical position based on baseline
      let y;
      if (state.baseline === 'bottom') {
        y = baselineY;
      } else {
        // Top baseline: all tops are aligned, so offset by font size
        y = baselineY + lt.fontSize * 0.8;
      }

      ctx.save();
      ctx.translate(x, y);

      // Apply skew for italic (using CSS-like skewX)
      const skewRad = -lt.italicAngle * Math.PI / 180;
      ctx.transform(1, 0, Math.tan(skewRad), 1, 0, 0);

      ctx.font = `900 ${lt.fontSize}px 'Playfair Display', Georgia, serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(lt.char, 0, 0);

      ctx.restore();

      startX += lt.width + state.letterSpacing;
    }
  }

  function render() {
    recomputeValues();
    draw();
  }

  // ===== Event binding =====

  // Text input
  textInput.addEventListener('input', (e) => {
    state.text = e.target.value.toUpperCase();
    render();
  });

  // Baseline
  document.querySelectorAll('[data-baseline]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-baseline]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.baseline = btn.dataset.baseline;
      render();
    });
  });

  // Height patterns
  document.querySelectorAll('#height-patterns .pattern-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#height-patterns .pattern-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.heightPattern = btn.dataset.pattern;
      render();
    });
  });

  // Italic patterns
  document.querySelectorAll('#italic-patterns .pattern-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#italic-patterns .pattern-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.italicPattern = btn.dataset.pattern;
      render();
    });
  });

  // Sliders
  function bindSlider(id, stateKey) {
    const slider = sliders[id];
    const label = sliderLabels[id];
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      state[stateKey] = val;
      label.textContent = val;
      render();
    });
  }

  bindSlider('minHeight', 'minHeight');
  bindSlider('maxHeight', 'maxHeight');
  bindSlider('minItalic', 'minItalic');
  bindSlider('maxItalic', 'maxItalic');
  bindSlider('letterSpacing', 'letterSpacing');

  // Quick actions
  document.getElementById('btn-randomize-all').addEventListener('click', () => {
    // Randomize height pattern
    const hKeys = Object.keys(heightPatterns);
    state.heightPattern = hKeys[Math.floor(Math.random() * hKeys.length)];
    highlightPattern('#height-patterns', state.heightPattern);

    // Randomize italic pattern
    const iKeys = Object.keys(italicPatterns);
    state.italicPattern = iKeys[Math.floor(Math.random() * iKeys.length)];
    highlightPattern('#italic-patterns', state.italicPattern);

    // Randomize slider values
    state.minHeight = Math.floor(Math.random() * 50);
    state.maxHeight = 50 + Math.floor(Math.random() * 50);
    state.minItalic = Math.floor(Math.random() * 20) - 10;
    state.maxItalic = Math.floor(Math.random() * 40) + 5;
    state.letterSpacing = Math.floor(Math.random() * 100);

    syncSliders();
    render();
    pulseButton(document.getElementById('btn-randomize-all'));
  });

  document.getElementById('btn-randomize-height').addEventListener('click', () => {
    state.heightPattern = 'random-height';
    highlightPattern('#height-patterns', 'random-height');
    state.minHeight = Math.floor(Math.random() * 30);
    state.maxHeight = 60 + Math.floor(Math.random() * 40);
    syncSliders();
    render();
    pulseButton(document.getElementById('btn-randomize-height'));
  });

  document.getElementById('btn-randomize-italic').addEventListener('click', () => {
    state.italicPattern = 'random-italic';
    highlightPattern('#italic-patterns', 'random-italic');
    state.minItalic = Math.floor(Math.random() * 20) - 10;
    state.maxItalic = Math.floor(Math.random() * 40) + 5;
    syncSliders();
    render();
    pulseButton(document.getElementById('btn-randomize-italic'));
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    state.baseline = 'bottom';
    state.heightPattern = 'linear-up';
    state.italicPattern = 'uniform';
    state.minHeight = 0;
    state.maxHeight = 100;
    state.minItalic = 0;
    state.maxItalic = 40;
    state.letterSpacing = 20;

    document.querySelectorAll('[data-baseline]').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-baseline="bottom"]').classList.add('active');
    highlightPattern('#height-patterns', 'linear-up');
    highlightPattern('#italic-patterns', 'uniform');
    syncSliders();
    render();
    pulseButton(document.getElementById('btn-reset'));
  });

  // Helpers
  function highlightPattern(containerSel, patternName) {
    document.querySelectorAll(`${containerSel} .pattern-btn`).forEach(b => {
      b.classList.toggle('active', b.dataset.pattern === patternName);
    });
  }

  function syncSliders() {
    sliders.minHeight.value = state.minHeight;
    sliderLabels.minHeight.textContent = state.minHeight;
    sliders.maxHeight.value = state.maxHeight;
    sliderLabels.maxHeight.textContent = state.maxHeight;
    sliders.minItalic.value = state.minItalic;
    sliderLabels.minItalic.textContent = state.minItalic;
    sliders.maxItalic.value = state.maxItalic;
    sliderLabels.maxItalic.textContent = state.maxItalic;
    sliders.letterSpacing.value = state.letterSpacing;
    sliderLabels.letterSpacing.textContent = state.letterSpacing;
  }

  function pulseButton(btn) {
    btn.style.transform = 'scale(0.97)';
    setTimeout(() => { btn.style.transform = ''; }, 150);
  }

  // ===== Resize handling =====
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resizeCanvas();
      render();
    }, 50);
  });

  // ===== Init =====
  function init() {
    resizeCanvas();
    syncSliders();
    render();
  }

  // Wait for fonts to load
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(init);
  } else {
    window.addEventListener('load', init);
  }

})();
