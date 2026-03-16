import React, { useState, useEffect, useRef } from 'react';
import { ToolLayout, CollapsibleSection, Slider } from '../App';

export default function ItalicModulator() {
  const canvasRef = useRef(null);
  
  const [state, setState] = useState({
    text: 'MOZART',
    baseline: 'bottom',
    heightPattern: 'linear-up',
    italicPattern: 'uniform',
    minHeight: 0,
    maxHeight: 100,
    minItalic: 0,
    maxItalic: 40,
    letterSpacing: 20
  });

  const heightPatterns = {
    'linear-up': (n) => Array.from({ length: n }, (_, i) => i / Math.max(n - 1, 1)),
    'linear-down': (n) => Array.from({ length: n }, (_, i) => 1 - i / Math.max(n - 1, 1)),
    'arc-up': (n) => Array.from({ length: n }, (_, i) => Math.sin((i / Math.max(n - 1, 1)) * Math.PI)),
    'arc-down': (n) => Array.from({ length: n }, (_, i) => 1 - Math.sin((i / Math.max(n - 1, 1)) * Math.PI)),
    'wave': (n) => Array.from({ length: n }, (_, i) => 0.5 + 0.5 * Math.sin((i / Math.max(n - 1, 1)) * Math.PI * 2)),
    'random-height': (n) => Array.from({ length: n }, () => Math.random()),
  };

  const italicPatterns = {
    'uniform': (n) => Array.from({ length: n }, () => 1),
    'increasing': (n) => Array.from({ length: n }, (_, i) => i / Math.max(n - 1, 1)),
    'decreasing': (n) => Array.from({ length: n }, (_, i) => 1 - i / Math.max(n - 1, 1)),
    'alternating': (n) => Array.from({ length: n }, (_, i) => i % 2 === 0 ? 1 : -1).map(v => (v + 1) / 2),
    'wave-italic': (n) => Array.from({ length: n }, (_, i) => 0.5 + 0.5 * Math.sin((i / Math.max(n - 1, 1)) * Math.PI * 2)),
    'random-italic': (n) => Array.from({ length: n }, () => Math.random()),
  };
  
  const lerp = (a, b, t) => a + (b - a) * t;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    
    const w = 1200;
    const h = 800;
    
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'var(--bg-canvas)'; // using variables for aesthetic
    ctx.fillRect(0, 0, w, h);
    
    const text = state.text;
    if (!text.length) return;
    
    const n = text.length;
    const hFn = heightPatterns[state.heightPattern] || heightPatterns['linear-up'];
    const iFn = italicPatterns[state.italicPattern] || italicPatterns['uniform'];
    const heightValues = hFn(n);
    const italicValues = iFn(n);
    
    const padding = 60;
    const availW = w - padding * 2;
    const availH = h - padding * 2;
    const baseFontSize = Math.min(availW * 0.75 / Math.max(n, 1), availH * 0.5);
    const maxFontSize = baseFontSize * 1.8;
    
    const letters = [];
    let totalWidth = 0;
    
    for (let i = 0; i < n; i++) {
      const hNorm = heightValues[i] !== undefined ? heightValues[i] : 0.5;
      const iNorm = italicValues[i] !== undefined ? italicValues[i] : 0.5;
      const minFS = lerp(baseFontSize * 0.3, baseFontSize, state.minHeight / 100);
      const maxFS = lerp(baseFontSize * 0.3, maxFontSize, state.maxHeight / 100);
      const fontSize = lerp(minFS, maxFS, hNorm);
      const italicAngle = lerp(state.minItalic, state.maxItalic, iNorm);
      
      ctx.font = `900 ${fontSize}px 'Special Elite', monospace, serif`;
      const metrics = ctx.measureText(text[i]);
      const letterWidth = metrics.width;
      
      letters.push({ char: text[i], fontSize, italicAngle, width: letterWidth });
      totalWidth += letterWidth + (i < n - 1 ? state.letterSpacing : 0);
    }
    
    if (totalWidth > availW) {
      const scaleFactor = availW / totalWidth;
      totalWidth = 0;
      for (let i = 0; i < letters.length; i++) {
        letters[i].fontSize *= scaleFactor;
        ctx.font = `900 ${letters[i].fontSize}px 'Special Elite', monospace, serif`;
        letters[i].width = ctx.measureText(text[i]).width;
        totalWidth += letters[i].width + (i < n - 1 ? state.letterSpacing * scaleFactor : 0);
      }
    }
    
    let startX = (w - totalWidth) / 2;
    const baselineY = state.baseline === 'bottom' ? h * 0.62 : h * 0.42;
    
    for (let i = 0; i < n; i++) {
      const lt = letters[i];
      const x = startX + lt.width / 2;
      let y = state.baseline === 'bottom' ? baselineY : baselineY + lt.fontSize * 0.8;
      ctx.save();
      ctx.translate(x, y);
      const skewRad = -lt.italicAngle * Math.PI / 180;
      ctx.transform(1, 0, Math.tan(skewRad), 1, 0, 0);
      ctx.font = `900 ${lt.fontSize}px 'Special Elite', monospace, serif`;
      ctx.fillStyle = 'var(--text-dark)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(lt.char, 0, 0);
      ctx.restore();
      startX += lt.width + state.letterSpacing;
    }
  }, [state]);

  const update = (key, val) => setState(prev => ({...prev, [key]: val}));

  return (
    <ToolLayout title="Italic Modulator"
      inputSidebar={
        <div>
           <div className="hint" style={{marginTop: 0}}>Input Text</div>
           <input 
             type="text" 
             className="input" 
             value={state.text} 
             onChange={e => update('text', e.target.value.toUpperCase())} 
           />
           <button className="btn" onClick={() => update('text', '')}>Clear</button>
        </div>
      }
      rightSidebar={
        <div>
          <CollapsibleSection title="Patterns" defaultOpen={true}>
             <div className="hint" style={{marginTop: 0}}>Height</div>
             <select className="input" value={state.heightPattern} onChange={e => update('heightPattern', e.target.value)}>
                {Object.keys(heightPatterns).map(p => <option key={p} value={p}>{p}</option>)}
             </select>
             
             <div className="hint" style={{marginTop: '8px'}}>Italics</div>
             <select className="input" value={state.italicPattern} onChange={e => update('italicPattern', e.target.value)}>
                {Object.keys(italicPatterns).map(p => <option key={p} value={p}>{p}</option>)}
             </select>
             
             <div className="hint" style={{marginTop: '8px'}}>Baseline</div>
             <select className="input" value={state.baseline} onChange={e => update('baseline', e.target.value)}>
               <option value="bottom">Bottom</option>
               <option value="top">Top</option>
             </select>
          </CollapsibleSection>
          
          <CollapsibleSection title="Adjustments" defaultOpen={true}>
            <Slider label="Min Height" min={0} max={100} value={state.minHeight} onChange={v => update('minHeight', v)} />
            <Slider label="Max Height" min={0} max={200} value={state.maxHeight} onChange={v => update('maxHeight', v)} />
            <div style={{height:'12px'}}></div>
            <Slider label="Min Italic" min={-40} max={40} value={state.minItalic} onChange={v => update('minItalic', v)} />
            <Slider label="Max Italic" min={-40} max={80} value={state.maxItalic} onChange={v => update('maxItalic', v)} />
            <div style={{height:'12px'}}></div>
            <Slider label="Letter Spacing" min={-20} max={100} value={state.letterSpacing} onChange={v => update('letterSpacing', v)} />
          </CollapsibleSection>
          
          <CollapsibleSection title="Export" defaultOpen={true}>
             <button className="btn primary" onClick={() => {
                const link = document.createElement('a');
                link.download = 'italic-mod.png';
                link.href = canvasRef.current.toDataURL('image/png');
                link.click();
             }}>Download PNG</button>
          </CollapsibleSection>
        </div>
      }
    >
      <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%', backgroundColor: 'transparent', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
    </ToolLayout>
  );
}
