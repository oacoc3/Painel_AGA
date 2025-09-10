/* public/modules/ols.js
 * - Botões de zoom (+/−/100%/Ajustar) para Planta e Perfil
 * - 3D: botões +/−/Reset/Ajustar e carregamento local garantido
 * - Visualizações responsivas (ajuste pela janela, Hi-DPI)
 */
(function(){
  const DEG = Math.PI/180;
  const el = (id)=>document.getElementById(id);
  const num = (v,d=0)=>{ const x=Number(v); return Number.isFinite(x)?x:d; };
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const fmt = (x)=> new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(x);

  function setMsg(txt,isError=false){ const m=el('msg'); if(!m) return; m.textContent=txt||''; m.style.color=isError?'#b20':'#666'; }

  // ===== Modelo
  function collectParams(){
    const categoria = el('categoria').value;
    const codeNumber = Number(el('codeNumber').value);
    const thrElev = num(el('thrElev').value, 0);
    const rwLen = num(el('rwLen').value, 3000);
    const rwWidth = num(el('rwWidth').value, 45);
    const headingDeg = num(el('rwHeading').value, 90);
    const rwyLabelDeg = num(el('rwyLabelDeg').value, headingDeg);
    const drawA = !!el('drawA').checked;
    const drawB = !!el('drawB').checked;
    const ohsRadius = num(el('ohsRadius').value,15000);
    const ohsHeight = num(el('ohsHeight').value,150);
    return {categoria, codeNumber, thrElev, rwLen, rwWidth, headingDeg, rwyLabelDeg, drawA, drawB, ohsRadius, ohsHeight};
  }
  function setRwyLabels(rumodeg){
    const a = OLSGeom.rwyNumFromDeg(rumodeg); const b = OLSGeom.rwyNumFromDeg((rumodeg+180)%360);
    el('rwyLabelA').textContent=`RWY ${a}`; el('rwyLabelB').textContent=`RWY ${b}`;
  }

  // ===== CSV
  async function readFileAsText(file){ if(!file) return ''; const buf=await file.arrayBuffer(); return new TextDecoder('utf-8').decode(new Uint8Array(buf)); }
  function parseTerrainCSV(text){
    let cell=50, originX=0, originY=0; const rows=[];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim(); if(!line) continue;
      if (line.startsWith('#')) {
        const m = /cell\s*=\s*([-\d.]+).*originX\s*=\s*([-\d.]+).*originY\s*=\s*([-\d.]+)/i.exec(line);
        if (m){ cell=Number(m[1]); originX=Number(m[2]); originY=Number(m[3]); }
        continue;
      }
      const parts=line.split(',').map(x=>x.trim()).filter(Boolean);
      if(parts.length) rows.push(parts.map(Number));
    }
    if(!rows.length) return null;
    return { zGrid: rows, cell, originX, originY };
  }
  function parseObstaclesCSV(text){
    const out=[], lines=text.split(/\r?\n/); const header=(lines[0]||'').toLowerCase();
    const hasHeader = header.includes('name')&&header.includes('x')&&header.includes('y')&&(header.includes('h')||header.includes('z')||header.includes('alt'));
    for (let i=hasHeader?1:0;i<lines.length;i++){
      const line=lines[i].trim(); if(!line) continue;
      const [name,x,y,h]=line.split(',').map(s=>s.trim());
      const xx=Number(x), yy=Number(y), hh=Number(h);
      if(Number.isFinite(xx)&&Number.isFinite(yy)&&Number.isFinite(hh)) out.push({name:name||`Obs${i}`, x:xx, y:yy, h:hh});
    }
    return out;
  }

  // ===== Zoom estados
  function makeZoomStateCenter(canvas){
    const s={k:1, tx:0, ty:0}, ctx=canvas.getContext('2d');
    const apply=()=>{ ctx.setTransform(s.k,0,0,s.k, canvas.width/2 + s.tx, canvas.height/2 + s.ty); };
    const reset=()=>{ s.k=1; s.tx=s.ty=0; apply(); };
    function wheel(ev){ ev.preventDefault(); const nk=clamp(s.k*(1+Math.sign(ev.deltaY)*-0.1), 0.05, 20); s.k=nk; apply(); drawAll(); }
    let last=null;
    canvas.addEventListener('wheel', wheel, {passive:false});
    canvas.addEventListener('mousedown', e=>{ last=[e.clientX,e.clientY]; canvas.style.cursor='grabbing'; });
    window.addEventListener('mousemove', e=>{ if(!last) return; const dx=e.clientX-last[0], dy=e.clientY-last[1]; last=[e.clientX,e.clientY]; s.tx+=dx; s.ty+=dy; apply(); drawAll(); });
    window.addEventListener('mouseup', ()=>{ last=null; canvas.style.cursor='default'; });
    canvas.addEventListener('dblclick', ()=>{ reset(); drawAll(); });
    apply();
    return {state:s, apply, reset};
  }
  function makeZoomStateBottomLeft(canvas, offx=40, offy=30){
    const s={k:1, tx:0, ty:0}, ctx=canvas.getContext('2d');
    const apply=()=>{ ctx.setTransform(s.k,0,0,s.k, offx + s.tx, canvas.height - offy + s.ty); };
    const reset=()=>{ s.k=1; s.tx=s.ty=0; apply(); };
    function wheel(ev){ ev.preventDefault(); const nk=clamp(s.k*(1+Math.sign(ev.deltaY)*-0.1), 0.1, 20); s.k=nk; apply(); drawAll(); }
    let last=null;
    canvas.addEventListener('wheel', wheel, {passive:false});
    canvas.addEventListener('mousedown', e=>{ last=[e.clientX,e.clientY]; canvas.style.cursor='grabbing'; });
    window.addEventListener('mousemove', e=>{ if(!last) return; const dx=e.clientX-last[0], dy=e.clientY-last[1]; last=[e.clientX,e.clientY]; s.tx+=dx; s.ty+=dy; apply(); drawAll(); });
    window.addEventListener('mouseup', ()=>{ last=null; canvas.style.cursor='default'; });
    canvas.addEventListener('dblclick', ()=>{ reset(); drawAll(); });
    apply();
    return {state:s, apply, reset};
  }
  function _scaleFromCTX(ctx){ const m=ctx.getTransform(); return Math.hypot(m.a,m.b); }

  // ===== Estado geral
  let planZoom, profZoom, geom=null, obstacles=[], terrain=null, three=null;
  const planCanvas = el('planCanvas'), profileCanvas = el('profileCanvas');

  // ===== Draw: Planta
  function drawPolygon(ctx, poly, style='#0b5'){
    const k=_scaleFromCTX(ctx);
    ctx.beginPath(); poly.forEach((p,i)=>{ if(i===0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }); ctx.closePath();
    ctx.strokeStyle=style; ctx.lineWidth=2/Math.max(k,0.001); ctx.stroke();
    ctx.globalAlpha=0.06; ctx.fillStyle=style; ctx.fill(); ctx.globalAlpha=1;
  }
  function drawCircle(ctx, r, style='#09f'){ const k=_scaleFromCTX(ctx); ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.strokeStyle=style; ctx.lineWidth=2/Math.max(k,0.001); ctx.stroke(); }
  function label(ctx, text, x, y){ const p=ctx.getTransform().transformPoint(new DOMPoint(x,y)); ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#333'; ctx.font='12px system-ui'; ctx.fillText(text,p.x,p.y); ctx.restore(); }

  function drawPlan(){
    const ctx = planCanvas.getContext('2d');
    ctx.clearRect(0,0,planCanvas.width, planCanvas.height);
    ctx.save(); planZoom.apply();
    ctx.rotate(num(el('rwHeading').value,0)*DEG);

    drawPolygon(ctx, geom.strip, '#333');
    if (geom.innerHorizontal) { drawCircle(ctx, geom.innerHorizontal.radius, '#3399ff'); label(ctx, `Inner Horizontal R=${fmt(geom.innerHorizontal.radius)}m`, 8,-8); }
    if (geom.conical) { const outerR = geom.conical.innerRadius + (geom.conical.height*geom.conical.slope/100); drawCircle(ctx, outerR, '#99cc66'); label(ctx, `Conical Rext≈${fmt(outerR)}m`, 8,12); }

    if (el('drawA').checked) drawPolygon(ctx, geom.A.approach, '#ff9955');
    if (el('drawB').checked) drawPolygon(ctx, geom.B.approach, '#ff9955');
    if (el('drawA').checked) drawPolygon(ctx, geom.A.innerApproach, '#ffaa99');
    if (el('drawB').checked) drawPolygon(ctx, geom.B.innerApproach, '#ffaa99');

    ctx.fillStyle='#222';
    obstacles.forEach(o=>{ ctx.beginPath(); ctx.arc(o.x,o.y, 3/_scaleFromCTX(ctx), 0, Math.PI*2); ctx.fill(); });

    if (terrain) {
      const k=_scaleFromCTX(ctx);
      ctx.strokeStyle='#888'; ctx.setLineDash([6/k,6/k]);
      const rows=terrain.zGrid.length, cols=terrain.zGrid[0].length;
      const minX=terrain.originX, minY=terrain.originY;
      const maxX=terrain.originX+(cols-1)*terrain.cell, maxY=terrain.originY+(rows-1)*terrain.cell;
      ctx.strokeRect(minX,minY,maxX-minX,maxY-minY); ctx.setLineDash([]);
      label(ctx,'Terreno (grade)', minX, maxY);
    }
    ctx.restore();
  }

  // ===== Draw: Perfil
  function drawProfile(){
    const ctx = profileCanvas.getContext('2d');
    ctx.clearRect(0,0,profileCanvas.width, profileCanvas.height);
    ctx.save(); profZoom.apply();

    // Linhas base
    const baseZ = 0;
    const cat = el('categoria').value; const code = Number(el('codeNumber').value);
    const A = OLSGeom.DATA.approach[cat]; const slope = A.slope[code]; const len = A.len[code];

    // eixo X (solo)
    ctx.strokeStyle='#ccc'; ctx.beginPath(); ctx.moveTo(0, -baseZ); ctx.lineTo(len*1.1, -baseZ); ctx.stroke();
    // linha de referência alta
    ctx.beginPath(); ctx.moveTo(0, -(geom.thrElev+200)); ctx.lineTo(len*1.1, -(geom.thrElev+200)); ctx.stroke();

    // IHS
    if (geom.innerHorizontal){
      const z=geom.thrElev+geom.innerHorizontal.height;
      ctx.strokeStyle='#3399ff'; ctx.beginPath(); ctx.moveTo(0,-z); ctx.lineTo(len*1.1,-z); ctx.stroke();
    }
    // OHS
    const zOHS = geom.thrElev + num(el('ohsHeight').value,150);
    ctx.strokeStyle='#6666aa'; ctx.beginPath(); ctx.moveTo(0,-zOHS); ctx.lineTo(len*1.1,-zOHS); ctx.stroke();

    // Rampa A (e B igual para visual)
    ctx.strokeStyle='#ff9955';
    ctx.beginPath(); ctx.moveTo(0,-geom.thrElev); ctx.lineTo(len, -(geom.thrElev + len*slope/100)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-geom.thrElev); ctx.lineTo(len, -(geom.thrElev + len*slope/100)); ctx.stroke();

    // Obstáculos (projeção)
    ctx.fillStyle='#222';
    obstacles.forEach(o=>{ const x=Math.abs(o.x); const z=geom.thrElev+o.h; ctx.beginPath(); ctx.arc(x,-z,2,0,Math.PI*2); ctx.fill(); });

    ctx.restore();
  }

  // ===== 3D
  function ensure3D(){ const container=el('ols3d'); if(!container) return; if(!three) three = OLS3D.init3D(container); return three; }
  function build3D(){
    const t=ensure3D(); if(!t) return;
    t.clearSurfaces();

    // Strip
    t.addSurface('strip', { poly: geom.strip });
    // IHS
    if (geom.innerHorizontal) t.addSurface('ihs', { radius: geom.innerHorizontal.radius, z: geom.thrElev + geom.innerHorizontal.height });
    // Conical
    if (geom.conical) {
      const baseZ = geom.thrElev + geom.innerHorizontal.height;
      t.addSurface('conical', { innerRadius: geom.conical.innerRadius, height: geom.conical.height, slopePct: geom.conical.slope, baseZ });
    }
    // Approaches
    const cat = el('categoria').value; const code = Number(el('codeNumber').value);
    const A = OLSGeom.DATA.approach[cat]; const slope = A.slope[code]; const h0=geom.thrElev;
    if (el('drawA').checked) t.addSurface('approachA', { poly: geom.A.approach, h0, slopePct: slope });
    if (el('drawB').checked) t.addSurface('approachB', { poly: geom.B.approach, h0, slopePct: slope });

    if (terrain) t.addTerrain(terrain.zGrid, terrain.cell, terrain.originX, terrain.originY, geom.thrElev);
    obstacles.forEach(o=> t.addObstacle(o.x,o.y,o.h));

    t.setYaw(num(el('rwHeading').value,0)*DEG);
  }

  // ===== Responsivo (usa mais espaço da tela)
  function sizeCanvas(canvas, cssW, cssH){
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    canvas.style.width = cssW+'px'; canvas.style.height = cssH+'px';
    canvas.width = Math.max(1, Math.round(cssW*dpr));
    canvas.height = Math.max(1, Math.round(cssH*dpr));
  }
  function resizeAll(){
    const card = document.getElementById('vizCard');
    const cw = card.clientWidth || card.offsetWidth || 1000;
    const vh = window.innerHeight || 800;

    // Alturas pensadas para aproveitar bem a tela sem alterar o tema
    const planH = Math.max(320, Math.round(vh*0.45));
    const profH = Math.max(180, Math.round(vh*0.22));
    const threeH= Math.max(320, Math.round(vh*0.48));

    sizeCanvas(planCanvas, cw, planH);
    sizeCanvas(profileCanvas, cw, profH);

    const container3D = el('ols3d');
    container3D.style.width = cw+'px';
    container3D.style.height = threeH+'px';

    // Reaplica transform e redesenha
    planZoom?.apply(); drawPlan();
    profZoom?.apply(); drawProfile();
  }

  // ===== Fluxo principal
  function gerar(){
    try{
      const p = collectParams();
      setRwyLabels(p.rwyLabelDeg);

      geom = OLSGeom.makeRunwayGeometry({
        categoria: p.categoria, codeNumber: p.codeNumber, thrElev: p.thrElev,
        rwLen: p.rwLen, rwWidth: p.rwWidth, headingDeg: p.headingDeg
      });

      planZoom.apply(); drawPlan();
      profZoom.apply(); drawProfile();

      if (window.THREE) {
        build3D();
      } else {
        window.addEventListener('THREE_READY', ()=>{ el('ols3dFallback').style.display='none'; build3D(); }, {once:true});
        window.addEventListener('THREE_FAILED', ()=>{ el('ols3dFallback').style.display='block'; }, {once:true});
      }

      setMsg('Modelo atualizado.');
    }catch(e){ console.error(e); setMsg('Erro ao gerar modelo: '+e.message, true); }
  }

  // ===== Bind UI
  function bind(){
    // Zoom estados
    planZoom = makeZoomStateCenter(planCanvas);
    profZoom = makeZoomStateBottomLeft(profileCanvas, 40, 30);

    // Inputs
    ['categoria','codeNumber','thrElev','rwLen','rwWidth','rwHeading','rwyLabelDeg','drawA','drawB','ohsRadius','ohsHeight']
      .forEach(id=> el(id).addEventListener('input', gerar));
    el('btnGerar').addEventListener('click', gerar);

    // Botões de zoom — Planta
    el('planZoomIn').addEventListener('click', ()=>{ planZoom.state.k = clamp(planZoom.state.k*1.2, 0.05, 20); planZoom.apply(); drawPlan(); });
    el('planZoomOut').addEventListener('click', ()=>{ planZoom.state.k = clamp(planZoom.state.k/1.2, 0.05, 20); planZoom.apply(); drawPlan(); });
    el('planZoomReset').addEventListener('click', ()=>{ planZoom.reset(); drawPlan(); });
    el('planZoomFit').addEventListener('click', fitPlan);
    el('btnFit').addEventListener('click', fitPlan);

    // Botões de zoom — Perfil
    el('profZoomIn').addEventListener('click', ()=>{ profZoom.state.k = clamp(profZoom.state.k*1.2, 0.1, 20); profZoom.apply(); drawProfile(); });
    el('profZoomOut').addEventListener('click', ()=>{ profZoom.state.k = clamp(profZoom.state.k/1.2, 0.1, 20); profZoom.apply(); drawProfile(); });
    el('profZoomReset').addEventListener('click', ()=>{ profZoom.reset(); drawProfile(); });

    // 3D — botões
    el('threeZoomIn').addEventListener('click', ()=>{ const t=ensure3D(); if(!t) return; t.zoomBy(0.8); });
    el('threeZoomOut').addEventListener('click', ()=>{ const t=ensure3D(); if(!t) return; t.zoomBy(1.25); });
    el('threeReset').addEventListener('click', ()=>{ const t=ensure3D(); if(!t) return; t.controls.reset(); });
    el('threeFit').addEventListener('click', ()=>{ const t=ensure3D(); if(!t) return; t.fitToSurfaces(); });

    // CSVs
    el('fileTerrain').addEventListener('change', async ()=>{
      const f=el('fileTerrain').files[0];
      terrain = f ? parseTerrainCSV(await readFileAsText(f)) : null;
      if (!terrain && f) { setMsg('Terreno CSV inválido.', true); return; }
      gerar();
    });
    el('fileObstacles').addEventListener('change', async ()=>{
      const f=el('fileObstacles').files[0];
      obstacles = f ? parseObstaclesCSV(await readFileAsText(f)) : [];
      gerar();
    });

    // Export
    el('btnSave2DPlan').addEventListener('click', ()=>{ const a=document.createElement('a'); a.href=planCanvas.toDataURL('image/png'); a.download='ols_planta.png'; a.click(); });
    el('btnSave2DProfile').addEventListener('click', ()=>{ const a=document.createElement('a'); a.href=profileCanvas.toDataURL('image/png'); a.download='ols_perfil.png'; a.click(); });
    el('btnSave3D').addEventListener('click', ()=>{ const t=ensure3D(); if(!t) return; const a=document.createElement('a'); a.href=t.snapshotPNG(); a.download='ols_3d.png'; a.click(); });

    // Resize responsivo
    window.addEventListener('resize', resizeAll);
    new ResizeObserver(resizeAll).observe(document.getElementById('vizCard'));

    // Labels iniciais
    setRwyLabels(num(el('rwyLabelDeg').value, 90));
  }

  function fitPlan(){
    const rIHS = geom?.innerHorizontal?.radius || 2500;
    const rCon = geom?.conical ? (geom.conical.innerRadius + geom.conical.height*geom.conical.slope/100) : rIHS;
    const ext = Math.max(rCon, 0.6*el('rwLen').value|0);
    planZoom.state.k = Math.min(planCanvas.width, planCanvas.height)/(2*ext*1.1);
    planZoom.state.tx = planZoom.state.ty = 0;
    planZoom.apply(); drawPlan();
  }

  // ===== Boot
  function init(){ bind(); resizeAll(); gerar(); }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
