/* ================================================
   CMYK HALFTONE EMULATOR — Engine
   ================================================ */
(() => {
  'use strict';

  // ===== State =====
  const state = {
    sourceImage: null,
    sourceData: null, // ImageData from pre-processed source
    zoom: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    dragStart: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    renderTimer: null,
    channels: {
      c: { visible: true },
      m: { visible: true },
      y: { visible: true },
      k: { visible: true },
      paper: { visible: true }
    }
  };

  // ===== DOM refs =====
  const $ = id => document.getElementById(id);
  const canvas = $('halftone-canvas');
  const ctx = canvas.getContext('2d');
  const placeholder = $('canvas-placeholder');
  const canvasArea = $('canvas-area');

  // ===== Collapsible sections =====
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });

  // ===== Image Upload =====
  const dropZone = $('image-drop');
  const fileInput = $('file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) loadImage(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) loadImage(fileInput.files[0]);
  });

  function loadImage(file) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        state.sourceImage = img;
        $('source-thumb').src = e.target.result;
        dropZone.classList.add('has-image');
        placeholder.style.display = 'none';
        canvas.style.display = 'block';
        fitToView();
        scheduleRender();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ===== Helpers =====
  function getVal(id) { return parseFloat($(id).value); }
  function getColor(id) { return $(id).value; }
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16)
    ];
  }

  // ===== Pre-process source image =====
  function preprocessSource() {
    if (!state.sourceImage) return null;
    const img = state.sourceImage;
    // Limit processing size for performance
    const maxDim = 1200;
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const off = new OffscreenCanvas(w, h);
    const octx = off.getContext('2d');

    // Apply blur
    const blur = getVal('blur');
    if (blur > 0) octx.filter = `blur(${blur}px)`;
    octx.drawImage(img, 0, 0, w, h);
    octx.filter = 'none';

    // Get pixel data
    const imageData = octx.getImageData(0, 0, w, h);
    const d = imageData.data;

    // Apply contrast & lightness
    const contrast = getVal('contrast');
    const lightness = getVal('lightness');
    const factor = (259 * (contrast * 128 + 255)) / (255 * (259 - contrast * 128));

    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = d[i + c];
        // contrast
        v = factor * (v - 128) + 128;
        // lightness
        v += lightness * 255;
        d[i + c] = Math.max(0, Math.min(255, v));
      }
    }

    return imageData;
  }

  // ===== RGB to CMYK =====
  function rgbToCmyk(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const k = 1 - Math.max(rn, gn, bn);
    if (k >= 1) return [0, 0, 0, 1];
    const c = (1 - rn - k) / (1 - k);
    const m = (1 - gn - k) / (1 - k);
    const y = (1 - bn - k) / (1 - k);
    return [c, m, y, k];
  }

  // ===== Seeded random for consistent roughness =====
  function seededRandom(x, y, ch) {
    let seed = (x * 374761393 + y * 668265263 + ch * 1013904223) | 0;
    seed = (seed ^ (seed >> 13)) * 1274126177;
    seed = seed ^ (seed >> 16);
    return (seed & 0x7fffffff) / 0x7fffffff;
  }

  // ===== Main Render =====
  function render() {
    if (!state.sourceImage) return;

    const overlay = $('render-overlay');
    overlay.classList.add('active');

    // Use requestAnimationFrame so the spinner shows
    requestAnimationFrame(() => {
      const imgData = preprocessSource();
      if (!imgData) { overlay.classList.remove('active'); return; }

      const w = imgData.width, h = imgData.height;
      canvas.width = w;
      canvas.height = h;

      const freq = getVal('frequency');
      const dotSize = getVal('dot-size');
      const roughness = getVal('dot-roughness');
      const fuzz = getVal('edge-fuzz');
      const randomness = getVal('dot-randomness');
      const threshold = getVal('threshold');
      const paperNoise = getVal('paper-noise');
      const inkNoise = getVal('ink-noise');
      const blendMode = $('blend-mode').value;

      // Ink colors & opacity
      const inks = {};
      ['c', 'm', 'y', 'k'].forEach(ch => {
        inks[ch] = {
          color: hexToRgb(getColor('ink-' + ch + '-color')),
          opacity: getVal('ink-' + ch + '-opacity') / 100,
          visible: state.channels[ch].visible
        };
      });
      const paperColor = hexToRgb(getColor('ink-paper-color'));
      const paperOpacity = getVal('ink-paper-opacity') / 100;
      const paperVisible = state.channels.paper.visible;

      // Angles
      const angles = {};
      ['c', 'm', 'y', 'k'].forEach(ch => {
        angles[ch] = parseFloat($('dial-' + ch).dataset.angle) * Math.PI / 180;
      });

      // Cell size in pixels
      const cellSize = Math.max(2, w / freq);

      // Fill paper
      if (paperVisible) {
        ctx.fillStyle = `rgba(${paperColor[0]},${paperColor[1]},${paperColor[2]},${paperOpacity})`;
      } else {
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillRect(0, 0, w, h);

      // Paper noise
      if (paperNoise > 0 && paperVisible) {
        const noiseData = ctx.getImageData(0, 0, w, h);
        const nd = noiseData.data;
        for (let i = 0; i < nd.length; i += 4) {
          const n = (Math.random() - 0.5) * paperNoise * 60;
          nd[i] = Math.max(0, Math.min(255, nd[i] + n));
          nd[i + 1] = Math.max(0, Math.min(255, nd[i + 1] + n));
          nd[i + 2] = Math.max(0, Math.min(255, nd[i + 2] + n));
        }
        ctx.putImageData(noiseData, 0, 0);
      }

      const d = imgData.data;

      // Draw each channel
      const channelOrder = ['y', 'c', 'm', 'k']; // Print order: Y first, K last

      channelOrder.forEach((ch, chIdx) => {
        if (!inks[ch].visible) return;

        const angle = angles[ch];
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const ink = inks[ch];

        // Set compositing
        if (blendMode === 'multiply') {
          ctx.globalCompositeOperation = 'multiply';
        } else if (blendMode === 'subtractive') {
          ctx.globalCompositeOperation = 'multiply';
        } else {
          ctx.globalCompositeOperation = 'darken';
        }

        // Determine grid extent (rotated coords covering image)
        const diagonal = Math.sqrt(w * w + h * h);
        const gridCount = Math.ceil(diagonal / cellSize) + 2;

        for (let gi = -gridCount; gi <= gridCount; gi++) {
          for (let gj = -gridCount; gj <= gridCount; gj++) {
            // Grid position in rotated space
            let gx = gi * cellSize;
            let gy = gj * cellSize;

            // Add randomness
            if (randomness > 0) {
              const rx = seededRandom(gi, gj, chIdx * 2) - 0.5;
              const ry = seededRandom(gi, gj, chIdx * 2 + 1) - 0.5;
              gx += rx * randomness * cellSize;
              gy += ry * randomness * cellSize;
            }

            // Rotate to image space
            const cx = w / 2;
            const cy = h / 2;
            const px = cx + gx * cosA - gy * sinA;
            const py = cy + gx * sinA + gy * cosA;

            // Skip if outside image
            if (px < -cellSize || px > w + cellSize || py < -cellSize || py > h + cellSize) continue;

            // Sample image at this position
            const sx = Math.max(0, Math.min(w - 1, Math.round(px)));
            const sy = Math.max(0, Math.min(h - 1, Math.round(py)));
            const idx = (sy * w + sx) * 4;
            const r = d[idx], g = d[idx + 1], b = d[idx + 2];

            const cmyk = rgbToCmyk(r, g, b);
            let density = cmyk[chIdx]; // c=0, m=1, y=2, k=3 — but channelOrder is y,c,m,k

            // Map channel correctly
            const cmykMap = { y: 2, c: 0, m: 1, k: 3 };
            density = cmyk[cmykMap[ch]];

            // Apply threshold
            if (density < threshold) continue;

            // Ink noise
            let noiseMultiplier = 1;
            if (inkNoise > 0) {
              noiseMultiplier = 1 - (seededRandom(gi + 1000, gj + 2000, chIdx + 3) - 0.5) * inkNoise * 0.5;
            }

            // Dot radius
            let radius = (cellSize / 2) * dotSize * Math.sqrt(density) * noiseMultiplier;
            if (radius < 0.3) continue;

            // Roughness — make radius irregular
            if (roughness > 0) {
              const roughFactor = 1 + (seededRandom(gi + 500, gj + 700, chIdx + 5) - 0.5) * roughness * 0.4;
              radius *= roughFactor;
            }

            // Draw dot
            ctx.beginPath();

            if (roughness > 1.0) {
              // Draw irregular polygon for rough dots
              const points = 8 + Math.floor(roughness * 3);
              for (let p = 0; p < points; p++) {
                const a = (p / points) * Math.PI * 2;
                const rVar = radius * (1 + (seededRandom(gi * 7 + p, gj * 13, chIdx + p) - 0.5) * roughness * 0.25);
                const dx = px + Math.cos(a) * rVar;
                const dy = py + Math.sin(a) * rVar;
                if (p === 0) ctx.moveTo(dx, dy);
                else ctx.lineTo(dx, dy);
              }
              ctx.closePath();
            } else {
              ctx.arc(px, py, radius, 0, Math.PI * 2);
            }

            const alpha = ink.opacity * (fuzz > 0 ? (1 - fuzz * 0.4) : 1);
            ctx.fillStyle = `rgba(${ink.color[0]},${ink.color[1]},${ink.color[2]},${alpha})`;
            ctx.fill();

            // Edge fuzz — draw larger semi-transparent ring
            if (fuzz > 0 && radius > 1) {
              ctx.beginPath();
              ctx.arc(px, py, radius * (1 + fuzz * 0.5), 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${ink.color[0]},${ink.color[1]},${ink.color[2]},${alpha * fuzz * 0.3})`;
              ctx.fill();
            }
          }
        }
      });

      // Reset compositing
      ctx.globalCompositeOperation = 'source-over';

      // Apply zoom/pan transform
      applyTransform();
      overlay.classList.remove('active');
    });
  }

  // ===== Schedule render with debounce =====
  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(render, 80);
  }

  // ===== Zoom & Pan =====
  function applyTransform() {
    canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    canvas.style.transformOrigin = 'center center';
    $('zoom-level').textContent = Math.round(state.zoom * 100) + '%';
  }

  function fitToView() {
    if (!state.sourceImage) return;
    const areaW = canvasArea.clientWidth;
    const areaH = canvasArea.clientHeight;
    const imgW = state.sourceImage.naturalWidth;
    const imgH = state.sourceImage.naturalHeight;
    // Limit to processing size
    const maxDim = 1200;
    let w = imgW, h = imgH;
    if (w > maxDim || h > maxDim) {
      const s = maxDim / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    state.zoom = Math.min(areaW / w, areaH / h) * 0.9;
    state.panX = 0;
    state.panY = 0;
    applyTransform();
  }

  $('zoom-in').addEventListener('click', () => {
    state.zoom = Math.min(state.zoom * 1.25, 10);
    applyTransform();
  });
  $('zoom-out').addEventListener('click', () => {
    state.zoom = Math.max(state.zoom / 1.25, 0.1);
    applyTransform();
  });
  $('zoom-fit').addEventListener('click', () => {
    fitToView();
  });

  // Mouse wheel zoom
  canvasArea.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    state.zoom = Math.max(0.05, Math.min(10, state.zoom * factor));
    applyTransform();
  }, { passive: false });

  // Pan
  canvasArea.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    state.dragging = true;
    state.dragStart = { x: e.clientX, y: e.clientY };
    state.panStart = { x: state.panX, y: state.panY };
  });
  window.addEventListener('mousemove', e => {
    if (!state.dragging) return;
    state.panX = state.panStart.x + (e.clientX - state.dragStart.x);
    state.panY = state.panStart.y + (e.clientY - state.dragStart.y);
    applyTransform();
  });
  window.addEventListener('mouseup', () => { state.dragging = false; });

  // ===== Bind all sliders to re-render =====
  const sliderIds = [
    'frequency', 'dot-size', 'dot-roughness', 'edge-fuzz', 'dot-randomness', 'threshold',
    'contrast', 'lightness', 'blur',
    'paper-noise', 'ink-noise',
    'ink-c-opacity', 'ink-m-opacity', 'ink-y-opacity', 'ink-k-opacity', 'ink-paper-opacity'
  ];

  const valDisplayMap = {
    'frequency': 'freq-val',
    'dot-size': 'dotsize-val',
    'dot-roughness': 'roughness-val',
    'edge-fuzz': 'fuzz-val',
    'dot-randomness': 'random-val',
    'threshold': 'threshold-val',
    'contrast': 'contrast-val',
    'lightness': 'lightness-val',
    'blur': 'blur-val',
    'paper-noise': 'paper-noise-val',
    'ink-noise': 'ink-noise-val'
  };

  sliderIds.forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      // Update display value
      if (valDisplayMap[id]) {
        $(valDisplayMap[id]).textContent = el.value;
      }
      // Opacity labels
      if (id.startsWith('ink-') && id.endsWith('-opacity')) {
        const ch = id.replace('ink-', '').replace('-opacity', '');
        $('ink-' + ch + '-opac-label').textContent = el.value + '%';
      }
      scheduleRender();
    });
  });

  // Blend mode
  $('blend-mode').addEventListener('change', scheduleRender);

  // ===== Ink color pickers =====
  ['c', 'm', 'y', 'k', 'paper'].forEach(ch => {
    const colorInput = $('ink-' + ch + '-color');
    const swatch = colorInput.parentElement;
    const hexLabel = $('ink-' + ch + '-hex');

    colorInput.addEventListener('input', () => {
      swatch.style.background = colorInput.value;
      hexLabel.textContent = colorInput.value.replace('#', '').toUpperCase();
      scheduleRender();
    });
  });

  // ===== Ink visibility toggles =====
  ['c', 'm', 'y', 'k', 'paper'].forEach(ch => {
    const btn = $('ink-' + ch + '-vis');
    btn.addEventListener('click', () => {
      state.channels[ch].visible = !state.channels[ch].visible;
      btn.classList.toggle('hidden', !state.channels[ch].visible);
      scheduleRender();
    });
  });

  // ===== Screen Angle Dials =====
  document.querySelectorAll('.angle-dial').forEach(dial => {
    let dragging = false;

    function updateDial(e) {
      const rect = dial.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let angle = Math.atan2(e.clientX - cx, -(e.clientY - cy)) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      angle = Math.round(angle);
      dial.dataset.angle = angle;

      // Rotate dial dot
      const dot = dial.querySelector('.dial-dot');
      dot.style.transform = `translateX(-50%) rotate(${angle}deg)`;
      dot.style.transformOrigin = '50% ' + (rect.height / 2 - 8) + 'px';

      // Rotate the entire inner position
      const rad = angle * Math.PI / 180;
      const r = rect.width / 2 - 12;
      dot.style.left = (rect.width / 2 + Math.sin(rad) * r) + 'px';
      dot.style.top = (rect.height / 2 - Math.cos(rad) * r) + 'px';
      dot.style.transform = 'translate(-50%, -50%)';

      // Update value display
      const channel = dial.closest('.angle-item').dataset.channel;
      $('angle-' + channel + '-val').textContent = angle + '°';

      scheduleRender();
    }

    dial.addEventListener('mousedown', e => {
      e.preventDefault();
      dragging = true;
      updateDial(e);
    });
    window.addEventListener('mousemove', e => {
      if (dragging) updateDial(e);
    });
    window.addEventListener('mouseup', () => { dragging = false; });

    // Initialize dial dot position
    const angle = parseFloat(dial.dataset.angle);
    const rad = angle * Math.PI / 180;
    const dot = dial.querySelector('.dial-dot');
    const r = 20; // approximate
    const initTimeout = setTimeout(() => {
      const rect = dial.getBoundingClientRect();
      if (rect.width === 0) return;
      const rr = rect.width / 2 - 12;
      dot.style.left = (rect.width / 2 + Math.sin(rad) * rr) + 'px';
      dot.style.top = (rect.height / 2 - Math.cos(rad) * rr) + 'px';
      dot.style.transform = 'translate(-50%, -50%)';
    }, 100);
  });

  // ===== Reset =====
  $('btn-reset').addEventListener('click', () => {
    $('frequency').value = 89; $('freq-val').textContent = '89';
    $('dot-size').value = 0.80; $('dotsize-val').textContent = '0.80';
    $('dot-roughness').value = 1.70; $('roughness-val').textContent = '1.70';
    $('edge-fuzz').value = 0.29; $('fuzz-val').textContent = '0.29';
    $('dot-randomness').value = 0.25; $('random-val').textContent = '0.25';
    $('threshold').value = 0.25; $('threshold-val').textContent = '0.25';
    $('contrast').value = 1.03; $('contrast-val').textContent = '1.03';
    $('lightness').value = 0.00; $('lightness-val').textContent = '0.00';
    $('blur').value = 1.0; $('blur-val').textContent = '1.0';
    $('paper-noise').value = 0.00; $('paper-noise-val').textContent = '0.00';
    $('ink-noise').value = 0.95; $('ink-noise-val').textContent = '0.95';
    $('blend-mode').value = 'subtractive';

    // Reset ink colors
    $('ink-c-color').value = '#00FFFF'; $('ink-c-hex').textContent = '00FFFF';
    $('ink-m-color').value = '#FF00FF'; $('ink-m-hex').textContent = 'FF00FF';
    $('ink-y-color').value = '#FFFF00'; $('ink-y-hex').textContent = 'FFFF00';
    $('ink-k-color').value = '#000000'; $('ink-k-hex').textContent = '000000';
    $('ink-paper-color').value = '#F8F4E8'; $('ink-paper-hex').textContent = 'F8F4E8';

    // Reset swatches
    ['c','m','y','k','paper'].forEach(ch => {
      const colorInput = $('ink-' + ch + '-color');
      colorInput.parentElement.style.background = colorInput.value;
    });

    // Reset opacities
    ['c','m','y','k'].forEach(ch => {
      $('ink-' + ch + '-opacity').value = 95;
      $('ink-' + ch + '-opac-label').textContent = '95%';
    });
    $('ink-paper-opacity').value = 100;
    $('ink-paper-opac-label').textContent = '100%';

    // Reset visibility
    ['c','m','y','k','paper'].forEach(ch => {
      state.channels[ch].visible = true;
      $('ink-' + ch + '-vis').classList.remove('hidden');
    });

    scheduleRender();
  });

  // ===== Show Original =====
  let showingOriginal = false;
  $('btn-original').addEventListener('click', () => {
    if (!state.sourceImage) return;
    showingOriginal = !showingOriginal;
    if (showingOriginal) {
      const img = state.sourceImage;
      const maxDim = 1200;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      $('btn-original').style.background = 'var(--text-dark)';
      $('btn-original').style.color = '#fff';
    } else {
      $('btn-original').style.background = '';
      $('btn-original').style.color = '';
      render();
    }
  });

  // ===== Download =====
  $('btn-download').addEventListener('click', () => {
    if (!state.sourceImage) return;
    const link = document.createElement('a');
    link.download = 'halftone-print.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // ===== Presets =====
  const PRESET_KEY = 'halftone_presets';

  function getSettings() {
    return {
      frequency: getVal('frequency'),
      dotSize: getVal('dot-size'),
      roughness: getVal('dot-roughness'),
      fuzz: getVal('edge-fuzz'),
      randomness: getVal('dot-randomness'),
      threshold: getVal('threshold'),
      contrast: getVal('contrast'),
      lightness: getVal('lightness'),
      blur: getVal('blur'),
      paperNoise: getVal('paper-noise'),
      inkNoise: getVal('ink-noise'),
      blendMode: $('blend-mode').value,
      inkC: getColor('ink-c-color'),
      inkM: getColor('ink-m-color'),
      inkY: getColor('ink-y-color'),
      inkK: getColor('ink-k-color'),
      inkPaper: getColor('ink-paper-color'),
      opacC: getVal('ink-c-opacity'),
      opacM: getVal('ink-m-opacity'),
      opacY: getVal('ink-y-opacity'),
      opacK: getVal('ink-k-opacity'),
      opacPaper: getVal('ink-paper-opacity'),
      angleC: parseFloat($('dial-c').dataset.angle),
      angleM: parseFloat($('dial-m').dataset.angle),
      angleY: parseFloat($('dial-y').dataset.angle),
      angleK: parseFloat($('dial-k').dataset.angle)
    };
  }

  function applySettings(s) {
    $('frequency').value = s.frequency; $('freq-val').textContent = s.frequency;
    $('dot-size').value = s.dotSize; $('dotsize-val').textContent = s.dotSize;
    $('dot-roughness').value = s.roughness; $('roughness-val').textContent = s.roughness;
    $('edge-fuzz').value = s.fuzz; $('fuzz-val').textContent = s.fuzz;
    $('dot-randomness').value = s.randomness; $('random-val').textContent = s.randomness;
    $('threshold').value = s.threshold; $('threshold-val').textContent = s.threshold;
    $('contrast').value = s.contrast; $('contrast-val').textContent = s.contrast;
    $('lightness').value = s.lightness; $('lightness-val').textContent = s.lightness;
    $('blur').value = s.blur; $('blur-val').textContent = s.blur;
    $('paper-noise').value = s.paperNoise; $('paper-noise-val').textContent = s.paperNoise;
    $('ink-noise').value = s.inkNoise; $('ink-noise-val').textContent = s.inkNoise;
    $('blend-mode').value = s.blendMode;

    const colorMap = { c: s.inkC, m: s.inkM, y: s.inkY, k: s.inkK, paper: s.inkPaper };
    const opacMap = { c: s.opacC, m: s.opacM, y: s.opacY, k: s.opacK, paper: s.opacPaper };

    ['c','m','y','k','paper'].forEach(ch => {
      $('ink-' + ch + '-color').value = colorMap[ch];
      $('ink-' + ch + '-color').parentElement.style.background = colorMap[ch];
      $('ink-' + ch + '-hex').textContent = colorMap[ch].replace('#', '').toUpperCase();
      $('ink-' + ch + '-opacity').value = opacMap[ch];
      $('ink-' + ch + '-opac-label').textContent = Math.round(opacMap[ch]) + '%';
    });

    // Angles
    const angleMap = { c: s.angleC, m: s.angleM, y: s.angleY, k: s.angleK };
    ['c','m','y','k'].forEach(ch => {
      const dial = $('dial-' + ch);
      dial.dataset.angle = angleMap[ch];
      $('angle-' + ch + '-val').textContent = angleMap[ch] + '°';
      // Update dot position
      const rad = angleMap[ch] * Math.PI / 180;
      const dot = dial.querySelector('.dial-dot');
      const rect = dial.getBoundingClientRect();
      if (rect.width > 0) {
        const rr = rect.width / 2 - 12;
        dot.style.left = (rect.width / 2 + Math.sin(rad) * rr) + 'px';
        dot.style.top = (rect.height / 2 - Math.cos(rad) * rr) + 'px';
        dot.style.transform = 'translate(-50%, -50%)';
      }
    });

    scheduleRender();
  }

  function loadPresets() {
    try {
      return JSON.parse(localStorage.getItem(PRESET_KEY)) || {};
    } catch { return {}; }
  }

  function savePresets(presets) {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  }

  function refreshPresetSelect() {
    const select = $('preset-select');
    const presets = loadPresets();
    select.innerHTML = '<option value="default">Default</option>';
    Object.keys(presets).sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
  }

  $('preset-select').addEventListener('change', () => {
    const name = $('preset-select').value;
    if (name === 'default') {
      $('btn-reset').click();
      return;
    }
    const presets = loadPresets();
    if (presets[name]) applySettings(presets[name]);
  });

  $('btn-save-preset').addEventListener('click', () => {
    const name = prompt('Preset name:');
    if (!name || !name.trim()) return;
    const presets = loadPresets();
    presets[name.trim()] = getSettings();
    savePresets(presets);
    refreshPresetSelect();
    $('preset-select').value = name.trim();
  });

  $('btn-delete-preset').addEventListener('click', () => {
    const name = $('preset-select').value;
    if (name === 'default') return;
    if (!confirm('Delete preset "' + name + '"?')) return;
    const presets = loadPresets();
    delete presets[name];
    savePresets(presets);
    refreshPresetSelect();
  });

  refreshPresetSelect();

  // ===== Window resize — fit =====
  window.addEventListener('resize', () => {
    if (state.sourceImage) fitToView();
  });

})();
