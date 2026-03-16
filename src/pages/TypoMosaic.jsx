import React, { useState, useEffect, useRef } from 'react';
import { ToolLayout, CollapsibleSection, Slider } from '../App';

export default function TypoMosaic() {
  const canvasRef = useRef(null);
  
  const [imageSrc, setImageSrc] = useState(null);
  const [wordBank, setWordBank] = useState('tree, branch, leaf, bark, root, sky, wind, sun, green, grow, wood, nature, earth, seed, bloom');
  const [simplicity, setSimplicity] = useState(50);
  const [fontMin, setFontMin] = useState(6);
  const [fontMax, setFontMax] = useState(24);
  const [threshold, setThreshold] = useState(200);
  const [isGenerating, setIsGenerating] = useState(false);

  const wordsList = wordBank.split(/[,\n]+/).map(w => w.trim().toUpperCase()).filter(w => w.length > 0);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const fr = new FileReader();
      fr.onload = (ev) => setImageSrc(ev.target.result);
      fr.readAsDataURL(e.target.files[0]);
    }
  };

  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;
    setIsGenerating(true);
    
    const timer = setTimeout(() => {
      generateMosaic();
      setIsGenerating(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [imageSrc, wordBank, simplicity, fontMin, fontMax, threshold]);

  const generateMosaic = () => {
    if (wordsList.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
      const maxDim = 800;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      
      const aCanvas = document.createElement('canvas');
      aCanvas.width = w;
      aCanvas.height = h;
      const aCtx = aCanvas.getContext('2d');
      aCtx.drawImage(img, 0, 0, w, h);
      const imgData = aCtx.getImageData(0, 0, w, h);
      
      const getBrightness = (x, y) => {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        if (ix < 0 || ix >= w || iy < 0 || iy >= h) return 255;
        const idx = (iy * w + ix) * 4;
        const r = imgData.data[idx], g = imgData.data[idx+1], b = imgData.data[idx+2];
        return 0.299*r + 0.587*g + 0.114*b;
      };

      const scale = 2;
      const canvasW = w * scale;
      const canvasH = h * scale;
      canvas.width = canvasW;
      canvas.height = canvasH;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);
      
      const t = simplicity / 100;
      const fontSize = Math.round((fontMax - (fontMax - fontMin) * t) * scale);
      const lineHeight = Math.round(fontSize * 1.35);
      const wordGap = Math.round(fontSize * 0.4);
      const margin = Math.round(8 * scale);
      
      ctx.font = `${fontSize}px 'Special Elite', monospace`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      
      let wordIndex = 0;
      let cursorX = margin;
      let cursorY = margin;
      
      while (cursorY + fontSize < canvasH) {
         const word = wordsList[wordIndex % wordsList.length];
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
         let tb = 0, sc = 0;
         for (let sy = -sampleRadius; sy <= sampleRadius; sy += 2) {
            for (let sx = -sampleRadius; sx <= sampleRadius; sx += 2) {
               tb += getBrightness(imgX + sx, imgY + sy);
               sc++;
            }
         }
         const avgB = tb / Math.max(sc, 1);
         
         let alpha;
         if (avgB >= threshold) {
            alpha = 0.03;
         } else {
            const darkRatio = 1 - (avgB / threshold);
            alpha = 0.05 + darkRatio * 0.95;
         }
         
         ctx.fillStyle = `rgba(26, 26, 26, ${alpha})`;
         ctx.fillText(word, cursorX, cursorY);
         
         cursorX += wordWidth + wordGap;
      }
    };
    img.src = imageSrc;
  };

  return (
    <ToolLayout title="Typo Mosaic"
      inputSidebar={
        <div>
           <div className="dropzone">
             {imageSrc ? <img src={imageSrc} alt="" /> : <p>Drop image or click to browse</p>}
             <input type="file" onChange={handleFileChange} style={{opacity:0, position:'absolute', inset:0, cursor:'pointer'}} />
           </div>
           
           <div className="hint" style={{marginTop: '16px'}}>Word Bank</div>
           <textarea className="textarea" placeholder="Comma-separated strings" value={wordBank} onChange={e => setWordBank(e.target.value)} />
           <p className="hint">Comma-separated.</p>
        </div>
      }
      rightSidebar={
        <div>
          <CollapsibleSection title="Typography" defaultOpen={true}>
            <Slider label="Simplicity" hint="Details vs Simplicty" min={1} max={100} value={simplicity} onChange={v => setSimplicity(v)} />
            <div style={{height:'12px'}}></div>
            <Slider label="Font Size Min" min={4} max={36} value={fontMin} onChange={v => setFontMin(v)} />
            <Slider label="Font Size Max" min={4} max={72} value={fontMax} onChange={v => setFontMax(v)} />
          </CollapsibleSection>

          <CollapsibleSection title="Threshold" defaultOpen={true}>
            <Slider label="Brightness Limit" min={0} max={255} value={threshold} onChange={v => setThreshold(v)} hint="Words mapped above threshold are invisible" />
          </CollapsibleSection>

          <CollapsibleSection title="Export" defaultOpen={true}>
             <button className="btn primary" disabled={!imageSrc || isGenerating} onClick={() => {
                const link = document.createElement('a');
                link.download = 'typo-mosaic.png';
                link.href = canvasRef.current.toDataURL('image/png');
                link.click();
             }}>Download PNG</button>
          </CollapsibleSection>
        </div>
      }
    >
      <div style={{position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', display: imageSrc ? 'block' : 'none', backgroundColor: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
        {!imageSrc && <div className="status-text">UPLOAD IMAGE TO BEGIN</div>}
        {isGenerating && <div className="status-text" style={{background: 'rgba(255,255,255,0.8)', padding: '10px', borderRadius: '4px', zIndex: 100, color: 'var(--text-dark)'}}>Generating...</div>}
      </div>
    </ToolLayout>
  );
}
