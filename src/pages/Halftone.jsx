import React, { useState, useEffect, useRef } from 'react';
import { ToolLayout, CollapsibleSection, Slider } from '../App';

export default function Halftone() {
  const canvasRef = useRef(null);
  
  const [imageSrc, setImageSrc] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [settings, setSettings] = useState({
    freq: 89,
    dotSize: 0.8,
    roughness: 1.7,
    fuzz: 0.29,
    random: 0.25,
    threshold: 0.25,
    contrast: 1.03,
    lightness: 0,
    blur: 1.0,
    paperNoise: 0,
    inkNoise: 0.95,
  });

  const [inks, setInks] = useState({
    c: { color: '#00FFFF', opacity: 95, angle: 15, visible: true },
    m: { color: '#FF00FF', opacity: 95, angle: 75, visible: true },
    y: { color: '#FFFF00', opacity: 95, angle: 0, visible: true },
    k: { color: '#000000', opacity: 95, angle: 45, visible: true },
    paper: { color: '#F8F4E8', opacity: 100, visible: true },
  });

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const fr = new FileReader();
      fr.onload = (ev) => setImageSrc(ev.target.result);
      fr.readAsDataURL(e.target.files[0]);
    }
  };

  const updateSetting = (key, val) => setSettings(p => ({...p, [key]: val}));
  const updateInk = (ch, key, val) => setInks(p => ({...p, [ch]: {...p[ch], [key]: val}}));

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16)
    ];
  }

  function rgbToCmyk(r, g, b) {
    const rn = r/255, gn = g/255, bn = b/255;
    const k = 1 - Math.max(rn, gn, bn);
    if (k >= 1) return [0, 0, 0, 1];
    const c = (1 - rn - k) / (1 - k);
    const m = (1 - gn - k) / (1 - k);
    const y = (1 - bn - k) / (1 - k);
    return [c, m, y, k];
  }

  function seededRandom(x, y, ch) {
    let seed = (x * 374761393 + y * 668265263 + ch * 1013904223) | 0;
    seed = (seed ^ (seed >> 13)) * 1274126177;
    seed = seed ^ (seed >> 16);
    return (seed & 0x7fffffff) / 0x7fffffff;
  }

  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;
    setIsGenerating(true);
    const timer = setTimeout(() => {
      renderHalftone();
      setIsGenerating(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [imageSrc, settings, inks]);

  const renderHalftone = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
      const maxDim = 800;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
         const scale = maxDim / Math.max(w, h);
         w = Math.round(w * scale);
         h = Math.round(h * scale);
      }
      
      const offCanvas = document.createElement('canvas');
      offCanvas.width = w; offCanvas.height = h;
      const octx = offCanvas.getContext('2d');
      if (settings.blur > 0) octx.filter = `blur(${settings.blur}px)`;
      octx.drawImage(img, 0, 0, w, h);
      octx.filter = 'none';
      
      const imgData = octx.getImageData(0,0,w,h);
      const d = imgData.data;
      
      const pColor = hexToRgb(inks.paper.color);
      canvas.width = w;
      canvas.height = h;
      
      if (inks.paper.visible) {
        ctx.fillStyle = `rgba(${pColor[0]},${pColor[1]},${pColor[2]},${inks.paper.opacity/100})`;
      } else {
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillRect(0,0,w,h);
      
      const factor = (259 * (settings.contrast * 128 + 255)) / (255 * (259 - settings.contrast * 128));
      for (let i = 0; i < d.length; i += 4) {
         for (let c=0; c<3; c++) {
            let v = d[i+c];
            v = factor * (v - 128) + 128 + (settings.lightness * 255);
            d[i+c] = Math.max(0, Math.min(255, v));
         }
      }
      
      const freq = settings.freq, cellSize = Math.max(2, w / freq);
      ctx.globalCompositeOperation = 'multiply';
      
      const channelOrder = ['y', 'c', 'm', 'k'];
      channelOrder.forEach((ch, chIdx) => {
         const ink = inks[ch];
         if (!ink.visible) return;
         
         const angle = ink.angle * Math.PI / 180;
         const cosA = Math.cos(angle), sinA = Math.sin(angle);
         const cColor = hexToRgb(ink.color);
         
         const diagonal = Math.sqrt(w*w + h*h);
         const gridCount = Math.ceil(diagonal / cellSize) + 2;
         const mapCh = {y:2, c:0, m:1, k:3}[ch];
         
         for (let gi = -gridCount; gi <= gridCount; gi++) {
            for (let gj = -gridCount; gj <= gridCount; gj++) {
               let gx = gi * cellSize, gy = gj * cellSize;
               if (settings.random > 0) {
                  gx += (seededRandom(gi,gj,chIdx*2) - 0.5) * settings.random * cellSize;
                  gy += (seededRandom(gi,gj,chIdx*2+1) - 0.5) * settings.random * cellSize;
               }
               const px = w/2 + gx*cosA - gy*sinA;
               const py = h/2 + gx*sinA + gy*cosA;
               
               if (px < -cellSize || px > w+cellSize || py < -cellSize || py > h+cellSize) continue;
               
               const sx = Math.max(0, Math.min(w-1, Math.round(px)));
               const sy = Math.max(0, Math.min(h-1, Math.round(py)));
               const idx = (sy*w + sx)*4;
               
               const cmyk = rgbToCmyk(d[idx], d[idx+1], d[idx+2]);
               const density = cmyk[mapCh];
               if (density < settings.threshold) continue;
               
               let noiseMult = 1;
               if (settings.inkNoise > 0) {
                  noiseMult = 1 - (seededRandom(gi+1000,gj+2000,chIdx+3) - 0.5) * settings.inkNoise * 0.5;
               }
               
               let radius = (cellSize/2) * settings.dotSize * Math.sqrt(density) * noiseMult;
               if (radius < 0.3) continue;
               
               if (settings.roughness > 0) {
                  radius *= 1 + (seededRandom(gi+500,gj+700,chIdx+5) - 0.5) * settings.roughness * 0.4;
               }
               
               const alpha = (ink.opacity/100) * (settings.fuzz > 0 ? (1 - settings.fuzz*0.4) : 1);
               ctx.fillStyle = `rgba(${cColor[0]},${cColor[1]},${cColor[2]},${alpha})`;
               
               ctx.beginPath();
               if (settings.roughness > 1.0) {
                  const points = 8 + Math.floor(settings.roughness*3);
                  for (let p=0; p<points; p++) {
                     const a = (p/points) * Math.PI*2;
                     const rVar = radius * (1 + (seededRandom(gi*7+p, gj*13, chIdx+p) - 0.5) * settings.roughness * 0.25);
                     ctx[p===0?'moveTo':'lineTo'](px + Math.cos(a)*rVar, py + Math.sin(a)*rVar);
                  }
                  ctx.closePath();
               } else {
                  ctx.arc(px, py, radius, 0, Math.PI*2);
               }
               ctx.fill();
            }
         }
      });
      ctx.globalCompositeOperation = 'source-over';
    };
    img.src = imageSrc;
  };

  const cList = ['c', 'm', 'y', 'k', 'paper'];

  return (
    <ToolLayout title="CMYK Halftone Emulator"
      inputSidebar={
        <div>
           <div className="dropzone">
             {imageSrc ? <img src={imageSrc} alt="" /> : <p>Drop image or click to browse</p>}
             <input type="file" onChange={handleFileChange} style={{opacity:0, position:'absolute', inset:0, cursor:'pointer'}} />
           </div>
        </div>
      }
      rightSidebar={
        <div>
          <CollapsibleSection title="Ink Separations & Angles" defaultOpen={true}>
            {cList.map(ch => (
              <div key={ch} style={{ display:'flex', alignItems:'center', marginBottom:'8px' }}>
                <input type="color" value={inks[ch].color} onChange={e => updateInk(ch, 'color', e.target.value)} style={{width:24, height:24, padding:0, border:'1px solid var(--border)', marginRight:'8px', cursor:'pointer'}} />
                <span style={{ fontFamily:'var(--font-mono)', fontSize:'10px', width:'40px' }}>{ch.toUpperCase()}</span>
                {ch !== 'paper' && (
                   <input type="number" value={inks[ch].angle} onChange={e => updateInk(ch, 'angle', Number(e.target.value))} style={{ width:'40px', padding:'2px', border:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:'10px', marginLeft:'auto'}} />
                )}
                <span style={{ marginLeft: ch === 'paper' ? 'auto' : '8px', fontSize:'10px' }}>{ch!=='paper' ? '°' : ''}</span>
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Raster Settings" defaultOpen={true}>
            <Slider label="Frequency" min={10} max={200} value={settings.freq} onChange={v => updateSetting('freq', v)} />
            <Slider label="Dot Size" min={0.1} max={2} step={0.05} value={settings.dotSize} onChange={v => updateSetting('dotSize', v)} />
            <Slider label="Randomness" min={0} max={1} step={0.05} value={settings.random} onChange={v => updateSetting('random', v)} />
            <Slider label="Roughness" min={0} max={3} step={0.1} value={settings.roughness} onChange={v => updateSetting('roughness', v)} />
          </CollapsibleSection>
          
          <CollapsibleSection title="Image Pre-Processing" defaultOpen={false}>
            <Slider label="Contrast" min={0} max={3} step={0.05} value={settings.contrast} onChange={v => updateSetting('contrast', v)} />
            <Slider label="Lightness" min={-1} max={1} step={0.05} value={settings.lightness} onChange={v => updateSetting('lightness', v)} />
            <Slider label="Blur" min={0} max={10} step={0.5} value={settings.blur} onChange={v => updateSetting('blur', v)} />
            <Slider label="Threshold" min={0} max={1} step={0.05} value={settings.threshold} onChange={v => updateSetting('threshold', v)} />
          </CollapsibleSection>

          <CollapsibleSection title="Export" defaultOpen={true}>
             <button className="btn primary" disabled={!imageSrc || isGenerating} onClick={() => {
                const link = document.createElement('a');
                link.download = 'halftone.png';
                link.href = canvasRef.current.toDataURL('image/png');
                link.click();
             }}>Download High-Res PNG</button>
          </CollapsibleSection>
        </div>
      }
    >
      <div style={{position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', display: imageSrc ? 'block' : 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
        {!imageSrc && <div className="status-text">UPLOAD IMAGE TO BEGIN</div>}
        {isGenerating && <div className="status-text" style={{background: 'rgba(255,255,255,0.8)', padding: '10px', borderRadius: '4px', zIndex: 100, color: 'var(--text-dark)'}}>Calculating CMYK...</div>}
      </div>
    </ToolLayout>
  );
}
