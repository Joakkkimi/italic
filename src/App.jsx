import { useState, useRef, useEffect, useCallback } from 'react'


function App() {
  const [imageSrc, setImageSrc] = useState('')
  const [hasImage, setHasImage] = useState(false)
  const [wordBank, setWordBank] = useState('tree, branch, leaf, bark, root, sky, wind, sun, green, grow, wood, nature, earth, seed, bloom')
  const [simplicity, setSimplicity] = useState(50)
  const [fontMin, setFontMin] = useState(6)
  const [fontMax, setFontMax] = useState(24)
  const [brightnessThreshold, setBrightnessThreshold] = useState(200)
  const [generating, setGenerating] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const outputCanvasRef = useRef(null)
  const fileInputRef = useRef(null)
  
  // Keep image data in a ref so we don't need to depend on state changes for drawing
  const imageInfoRef = useRef({
    data: null,
    width: 0,
    height: 0
  });

  const getBrightness = useCallback((x, y) => {
    const info = imageInfoRef.current;
    if (!info.data) return 255;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= info.width || iy < 0 || iy >= info.height) return 255;
    const idx = (iy * info.width + ix) * 4;
    const r = info.data.data[idx];
    const g = info.data.data[idx + 1];
    const b = info.data.data[idx + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }, []);

  const clearImage = () => {
    imageInfoRef.current = { data: null, width: 0, height: 0 };
    setHasImage(false);
    setImageSrc('');
    if (outputCanvasRef.current) {
      const ctx = outputCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, outputCanvasRef.current.width, outputCanvasRef.current.height);
    }
  };

  const loadImage = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
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
        imageInfoRef.current.data = aCtx.getImageData(0, 0, w, h);
        imageInfoRef.current.width = w;
        imageInfoRef.current.height = h;

        setImageSrc(e.target.result);
        setHasImage(true);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      loadImage(e.dataTransfer.files[0]);
    }
  };

  const isProcessingRef = useRef(false);

  const parseWords = useCallback(() => {
    const raw = wordBank.trim();
    return raw.split(/[,\n]+/).map(w => w.trim().toUpperCase()).filter(w => w.length > 0);
  }, [wordBank]);

  const generateMosaic = useCallback(() => {
    if (!imageInfoRef.current.data || isProcessingRef.current) return;
    
    const words = parseWords();
    if (words.length === 0) return;

    isProcessingRef.current = true;
    setGenerating(true);

    requestAnimationFrame(() => {
      // Small timeout to allow UI to show 'generating' state
      setTimeout(() => {
        try {
          const imgW = imageInfoRef.current.width;
          const imgH = imageInfoRef.current.height;
          const scale = 2;
          const canvasW = imgW * scale;
          const canvasH = imgH * scale;

          const canvas = outputCanvasRef.current;
          if (!canvas) return;

          canvas.width = canvasW;
          canvas.height = canvasH;
          canvas.style.width = imgW + 'px';
          canvas.style.height = imgH + 'px';

          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasW, canvasH);

          const t = simplicity / 100;
          const fontSize = Math.round((fontMax - (fontMax - fontMin) * Math.max(0, Math.min(1, t))) * scale);
          const lineHeight = Math.round(fontSize * 1.35);
          const wordGap = Math.round(fontSize * 0.4);
          const margin = Math.round(8 * scale);

          const fontFamily = "'Special Elite', 'Courier New', Courier, monospace";
          ctx.font = `${fontSize}px ${fontFamily}`;
          ctx.textBaseline = 'top';
          ctx.textAlign = 'left';

          let wordIndex = 0;
          let cursorX = margin;
          let cursorY = margin;

          while (cursorY + fontSize < canvasH) {
            const word = words[wordIndex % words.length];
            wordIndex++;

            const wordWidth = ctx.measureText(word).width;

            if (cursorX + wordWidth > canvasW - margin) {
              cursorX = margin;
              cursorY += lineHeight;
              if (cursorY + fontSize > canvasH) break;
            }

            const imgX = (cursorX + wordWidth / 2) / scale;
            const imgY = (cursorY + fontSize / 2) / scale;

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

            let alpha;
            if (avgBrightness >= brightnessThreshold) {
              alpha = 0.03;
            } else {
              const darkRatio = 1 - (avgBrightness / brightnessThreshold);
              alpha = 0.05 + darkRatio * 0.95;
            }

            ctx.fillStyle = `rgba(26, 26, 26, ${alpha})`;
            ctx.fillText(word, cursorX, cursorY);

            cursorX += wordWidth + wordGap;
          }
        } finally {
          isProcessingRef.current = false;
          setGenerating(false);
        }
      }, 50);
    });
  }, [fontMax, fontMin, simplicity, brightnessThreshold, getBrightness, parseWords]);

  useEffect(() => {
    if (!hasImage) return;

    const timer = setTimeout(() => {
      generateMosaic();
    }, 300);
    
    return () => clearTimeout(timer);
  }, [simplicity, fontMin, fontMax, brightnessThreshold, wordBank, hasImage, generateMosaic]);


  const handleDownload = () => {
    if (!outputCanvasRef.current || !outputCanvasRef.current.width) return;
    const link = document.createElement('a');
    link.download = 'typo-mosaic.png';
    link.href = outputCanvasRef.current.toDataURL('image/png');
    link.click();
  };

  return (
    <div id="app">
      <section id="panel-input" className="panel">
        <div className="panel-header">
          <span className="panel-label">SOURCE PHOTO</span>
          <span className="panel-tag">INPUT</span>
        </div>
        <div 
          id="drop-zone"
          className={`${hasImage ? 'has-image' : ''} ${dragOver ? 'drag-over' : ''}`}
          onClick={(e) => {
            if (e.target.id === 'btn-clear-image') return;
            fileInputRef.current && fileInputRef.current.click()
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div id="drop-zone-content">
            <div id="drop-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="4" y="4" width="40" height="40" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3"/>
                <path d="M24 16v16M16 24h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="drop-text-primary">Drop image here</p>
            <p className="drop-text-secondary">or click to browse</p>
            <p className="drop-text-hint">JPG, PNG, WEBP — max 10 MB</p>
          </div>
          {imageSrc && <img id="source-preview" src={imageSrc} alt="Source photo preview" />}
          {hasImage && <button id="btn-clear-image" title="Remove image" onClick={(e) => { e.stopPropagation(); clearImage(); }}>&times;</button>}
          <input type="file" id="file-input" accept="image/*" ref={fileInputRef} onChange={(e) => { if (e.target.files.length > 0) loadImage(e.target.files[0]) }} />
        </div>

        <div id="word-bank-section">
          <label className="section-label">WORD BANK</label>
          <p className="section-hint">Words used to build the mosaic. Comma-separated.</p>
          <textarea 
            id="word-bank" 
            rows="3" 
            spellCheck="false" 
            value={wordBank} 
            onChange={e => setWordBank(e.target.value)}
          />
        </div>
      </section>

      <section id="panel-controls" className="panel">
        <div className="panel-header">
          <span className="panel-label">CONTROLS</span>
        </div>

        <div id="simplicity-control" className="control-block">
          <label className="section-label">SIMPLICITY &amp; WORD COUNT</label>
          <div id="simplicity-slider-wrap">
            <span className="slider-end-label">SIMPLE<br/><small>FEWER WORDS</small></span>
            <input type="range" id="simplicity-slider" min="1" max="100" step="1" value={simplicity} onChange={e => setSimplicity(parseInt(e.target.value))} />
            <span className="slider-end-label right">DETAILED<br/><small>MORE WORDS</small></span>
          </div>
          <div id="simplicity-value-display">
            <span id="simplicity-val">{simplicity}</span><span className="unit">%</span>
          </div>
        </div>

        <div className="control-block">
          <label className="section-label">FONT SIZE RANGE</label>
          <div className="dual-range">
            <div className="range-control">
              <label>MIN</label>
              <div className="range-row">
                <input type="range" id="font-min" min="4" max="36" step="1" value={fontMin} onChange={e => setFontMin(parseInt(e.target.value))} />
                <span className="range-value" id="font-min-val">{fontMin}</span>
              </div>
            </div>
            <div className="range-control">
              <label>MAX</label>
              <div className="range-row">
                <input type="range" id="font-max" min="4" max="72" step="1" value={fontMax} onChange={e => setFontMax(parseInt(e.target.value))} />
                <span className="range-value" id="font-max-val">{fontMax}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="control-block">
          <label className="section-label">BRIGHTNESS THRESHOLD</label>
          <div className="range-control">
            <div className="range-row">
              <input type="range" id="brightness-threshold" min="0" max="255" step="1" value={brightnessThreshold} onChange={e => setBrightnessThreshold(parseInt(e.target.value))} />
              <span className="range-value" id="brightness-val">{brightnessThreshold}</span>
            </div>
          </div>
          <p className="section-hint">Areas brighter than this are left blank.</p>
        </div>

        <div className="control-block">
          <button id="btn-generate" className="action-btn primary" disabled={!hasImage || generating} onClick={generateMosaic}>
            <span className="btn-text">{generating ? 'Generating...' : 'Generate Mosaic'}</span>
            {generating && <span className="btn-spinner"></span>}
          </button>
          <button id="btn-download" className="action-btn" disabled={!hasImage || generating} onClick={handleDownload}>Download PNG</button>
        </div>
      </section>

      <section id="panel-output" className="panel">
        <div className="panel-header">
          <span className="panel-label">GENERATED TYPOGRAPHY</span>
          <span className="panel-tag">OUTPUT</span>
        </div>
        <div id="output-area">
          <canvas id="output-canvas" ref={outputCanvasRef} style={{ display: hasImage ? 'block' : 'none' }}></canvas>
          {!hasImage && (
            <div id="output-placeholder">
              <p>Upload a photo and press<br/><strong>Generate Mosaic</strong><br/>to see results here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default App
