import { useState, useRef, useEffect, useCallback } from 'react'
import { Analytics } from '@vercel/analytics/react'

import { WORD_DATABASE } from './data/words'
import {
  Dices,
  Plus,
  Minus,
  Maximize,
  RefreshCcw,
  Upload,
  Search,
  ZoomIn,
  ZoomOut
} from 'lucide-react'

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
  const [zoomLevel, setZoomLevel] = useState(100)
  const [selectedFont, setSelectedFont] = useState("'Special Elite', cursive")
  const [rotation, setRotation] = useState(0)

  const fonts = [
    { name: 'Special Elite', value: "'Special Elite', cursive" },
    { name: 'Cutive Mono', value: "'Cutive Mono', monospace" },
    { name: 'Courier Prime', value: "'Courier Prime', monospace" },
    { name: 'Space Mono', value: "'Space Mono', monospace" }
  ]

  const outputCanvasRef = useRef(null)
  const fileInputRef = useRef(null)

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

  const zoomTimerRef = useRef(null);

  const startContinuousZoom = (direction) => {
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    
    let delay = 150;
    const step = () => {
      setZoomLevel(prev => {
        const next = prev + (direction * 4);
        return Math.min(Math.max(next, 10), 400);
      });
      delay = Math.max(delay * 0.9, 20);
      zoomTimerRef.current = setTimeout(step, delay);
    };
    step();
  };

  const stopContinuousZoom = () => {
    if (zoomTimerRef.current) {
      clearTimeout(zoomTimerRef.current);
      zoomTimerRef.current = null;
    }
  };

  const downloadPNG = () => {
    const canvas = outputCanvasRef.current;
    if (!canvas || !hasImage) return;
    const link = document.createElement('a');
    link.download = 'typo-mosaic.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
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

  const generateRandomWords = () => {
    const count = 12 + Math.floor(Math.random() * 8);
    const shuffled = [...WORD_DATABASE].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);
    setWordBank(selected.join(', ').toLowerCase());
  };

  const generateMosaic = useCallback(() => {
    if (!imageInfoRef.current.data || isProcessingRef.current) return;

    const words = parseWords();
    if (words.length === 0) return;

    isProcessingRef.current = true;
    setGenerating(true);

    requestAnimationFrame(() => {
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

          const fontFamily = selectedFont;
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

            ctx.save();
            ctx.translate(cursorX + wordWidth / 2, cursorY + fontSize / 2);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.fillStyle = `rgba(26, 26, 26, ${alpha})`;
            ctx.fillText(word, -wordWidth / 2, -fontSize / 2);
            ctx.restore();

            cursorX += wordWidth + wordGap;
          }
        } finally {
          isProcessingRef.current = false;
          setGenerating(false);
        }
      }, 10);
    });
  }, [fontMax, fontMin, simplicity, brightnessThreshold, getBrightness, parseWords, rotation, selectedFont]);

  useEffect(() => {
    if (!hasImage) return;

    const timer = setTimeout(() => {
      generateMosaic();
    }, 100);

    return () => clearTimeout(timer);
  }, [simplicity, fontMin, fontMax, brightnessThreshold, wordBank, hasImage, generateMosaic, selectedFont, rotation]);




  return (
    <>
    <div id="app" style={{ 
      fontFamily: selectedFont,
      '--font-mono': selectedFont,
      '--font-ui': selectedFont
    }}>
      <section id="panel-input" className="panel">

        <div className="panel-content">
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
                <Plus size={48} strokeWidth={1} />
              </div>
              <p className="drop-text-primary">Drop image here</p>
              <p className="drop-text-secondary">or click to browse</p>
              <p className="drop-text-hint">JPG, PNG, WEBP — max 10 MB</p>
            </div>
            {imageSrc && <img id="source-preview" src={imageSrc} alt="Source photo preview" />}
            {hasImage && <button id="btn-clear-image" title="Remove image" onClick={(e) => { e.stopPropagation(); clearImage(); }}>&times;</button>}
            <input type="file" id="file-input" accept="image/*" ref={fileInputRef} onChange={(e) => { if (e.target.files.length > 0) loadImage(e.target.files[0]) }} />
          </div>

          <div className="control-block" id="word-bank-section">
            <div className="section-header-row">
              <label className="section-label">WORD BANK</label>
            </div>
            <p className="section-hint">Words used to build the mosaic. Comma-separated.</p>
            <div className="word-bank-container">
              <textarea
                id="word-bank"
                rows="6"
                spellCheck="false"
                value={wordBank}
                onChange={e => setWordBank(e.target.value)}
                style={{ fontFamily: selectedFont }}
              />
              <button type="button" className="inline-randomize-btn" onClick={generateRandomWords} title="Randomize words">
                <Dices size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="panel-output" className="panel">

        <div id="output-area">
          <div className="canvas-container" style={{ transform: `scale(${zoomLevel / 100})` }}>
            <canvas id="output-canvas" ref={outputCanvasRef} style={{ display: hasImage ? 'block' : 'none' }}></canvas>
          </div>
          {!hasImage && (
            <div id="output-placeholder">
              <p>Upload a photo to see results here.</p>
            </div>
          )}
          <div className="zoom-controls">
            <button 
              className="zoom-btn" 
              onMouseDown={() => startContinuousZoom(-1)} 
              onMouseUp={stopContinuousZoom} 
              onMouseLeave={stopContinuousZoom}
              title="Zoom Out"
            >
              <ZoomOut size={18} />
            </button>
            <button 
              className="zoom-btn" 
              onMouseDown={() => startContinuousZoom(1)} 
              onMouseUp={stopContinuousZoom} 
              onMouseLeave={stopContinuousZoom}
              title="Zoom In"
            >
              <ZoomIn size={18} />
            </button>
            <button className="zoom-btn" onClick={() => setZoomLevel(100)} title="Reset to Default"><Maximize size={18} /></button>
          </div>
        </div>
      </section>

      <section id="panel-controls" className="panel">
        <div className="panel-content">
          <div className="control-block">
            <label className="section-label">MOSAIC FONT</label>
            <div className="font-selector">
              {fonts.map(font => (
                <button 
                  key={font.name}
                  className={`font-option ${selectedFont === font.value ? 'active' : ''}`}
                  style={{ fontFamily: font.value }}
                  onClick={() => setSelectedFont(font.value)}
                >
                  {font.name}
                </button>
              ))}
            </div>
          </div>

          <div className="control-block">
            <label className="section-label">SIMPLICITY &amp; WORD COUNT</label>
            <div className="range-control">
              <div className="range-row">
                <div className="knob-preview">
                  <div className="scaling-ball" style={{ transform: `scale(${0.4 + (simplicity / 100) * 0.6})` }}></div>
                </div>
                <input type="range" id="simplicity-slider" min="1" max="100" step="1" value={simplicity} onChange={e => setSimplicity(parseInt(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="control-block">
            <label className="section-label">FONT SIZE RANGE</label>
            <div className="dual-range">
              <div className="range-control">
                <label>MIN</label>
                <div className="range-row">
                  <div className="knob-preview smaller">
                    <div className="scaling-ball" style={{ transform: `scale(${0.5 + ((fontMin - 4) / (36 - 4)) * 0.5})` }}></div>
                  </div>
                  <input type="range" id="font-min" min="4" max="36" step="1" value={fontMin} onChange={e => setFontMin(parseInt(e.target.value))} />
                </div>
              </div>
              <div className="range-control">
                <label>MAX</label>
                <div className="range-row">
                  <div className="knob-preview smaller">
                    <div className="scaling-ball" style={{ transform: `scale(${0.5 + ((fontMax - 4) / (72 - 4)) * 0.5})` }}></div>
                  </div>
                  <input type="range" id="font-max" min="4" max="72" step="1" value={fontMax} onChange={e => setFontMax(parseInt(e.target.value))} />
                </div>
              </div>
            </div>
          </div>

          <div className="control-block">
            <label className="section-label">BRIGHTNESS THRESHOLD</label>
            <div className="range-control">
              <div className="range-row">
                <div className="knob-preview">
                  <div className="scaling-ball" style={{ opacity: 0.1 + (brightnessThreshold / 255) * 0.9 }}></div>
                </div>
                <input type="range" id="brightness-threshold" min="0" max="255" step="1" value={brightnessThreshold} onChange={e => setBrightnessThreshold(parseInt(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="control-block">
            <label className="section-label">TEXT ROTATION</label>
            <div className="range-control">
              <div className="range-row">
                <div className="knob-preview">
                  <div className="knob-outer">
                    <div className="knob-inner" style={{ transform: `rotate(${rotation}deg)` }}>
                      <div className="knob-dot"></div>
                    </div>
                  </div>
                </div>
                <input 
                  type="range" 
                  id="rotation-slider" 
                  min="0" 
                  max="360" 
                  step="1" 
                  value={rotation} 
                  onChange={e => setRotation(parseInt(e.target.value))} 
                />
              </div>
            </div>
          </div>
        </div>

        <div className="download-section">
          <button 
            className="download-btn-refined" 
            onClick={downloadPNG}
            disabled={!hasImage}
            style={{ fontFamily: selectedFont }}
          >
            DOWNLOAD PNG
          </button>
        </div>

      </section>
    </div>
    <Analytics />
    </>
  )
}

export default App
