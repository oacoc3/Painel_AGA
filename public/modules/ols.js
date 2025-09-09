/* public/modules/ols.js
 * Módulo OLS completo (2D + 3D), independente de utils.js.
 * - Eixos por cabeceira (A: +X; B: -X)
 * - Planta e Perfil com zoom/pan e export PNG
 * - 3D interativo (aguarda THREE_READY) com Terreno e Obstáculos
 */
(function(){
  // ===== Helpers mínimos (sem depender de utils.js)
  const el = (id)=>document.getElementById(id);
  const num = (v, d=0)=>{ const x = Number(v); return Number.isFinite(x) ? x : d; };
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const fmt = (x)=> new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(x);

  function setMsg(txt, isError=false){
    const m = el('msg');
    if (!m) return;
    m.textContent = txt || '';
    m.style.color = isError ? '#b20' : '#666';
  }

  // ===== Modelo de parâmetros/estado
  function collectParams(){
    const categoria = el('categoria').value;
    const codeNumber = Number(el('codeNumber').value);
    const codeLetterF = !!el('codeLetterF').checked;
    const thrElev = num(el('thrElev').value, 0);
    const rwLen = num(el('rwLen').value, 3000);
    const rwWidth = num(el('rwWidth').value, 45);
    const headingDeg = num(el('rwHeading').value, 90);
    const rwyLabelDeg = num(el('rwyLabelDeg').value, headingDeg);
    const drawA = !!el('drawA').checked;
    const drawB = !!el('drawB').checked;
    const ohsRadius = num(el('ohsRadius').value, 15000);
    const ohsHeight = num(el('ohsHeight').value, 150);

    return { categoria, codeNumber, codeLetterF, thrElev, rwLen, rwWidth, headingDeg, rwyLabelDeg, drawA, drawB, ohsRadius, ohsHeight };
  }

  function setRwyLabels(rumodeg){
    const a = OLSGeom.rwyNumFromDeg(rumodeg);
    const bDeg = (rumodeg+180)%360;
    const b = OLSGeom.rwyNumFromDeg(bDeg);
    el('rwyLabelA').textContent = `RWY ${a}`;
    el('rwyLabelB').textContent = `RWY ${b}`;
  }

  // ===== Leitura de CSV
  async function readFileAsText(file){
    if (!file) return '';
    const buf = await file.arrayBuffer();
    return new TextDecoder('utf-8').decode(new Uint8Array(buf));
  }

  function parseTerrainCSV(text){
    // Suporte a cabeçalho: "# cell=50 originX=-500 originY=-500"
    let cell = 50, originX = 0, originY = 0;
    const rows = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('#')) {
        const m = /cell\s*=\s*([-\d.]+).*originX\s*=\s*([-\d.]+).*originY\s*=\s*([-\d.]+)/i.exec(line);
        if (m) {
          cell = Number(m[1]); originX = Number(m[2]); originY = Number(m[3]);
        }
        continue;
      }
      const parts = line.split(',').map(x=>x.trim()).filter(x=>x.length);
      if (parts.length) rows.push(parts.map(Number));
    }
    if (!rows.length) return null;
    return { zGrid: rows, cell, originX, originY };
  }

  function parseObstaclesCSV(text){
    // Esperado: name,x,y,height
    const out = [];
    const lines = text.split(/\r?\n/);
    const header = (lines[0]||'').toLowerCase();
    const hasHeader = header.includes('name') && header.includes('x') && header.includes('y') && (header.includes('h')||header.includes('alt')||header.includes('z'));
    for (let i=hasHeader?1:0;i<lines.length;i++){
      const line = lines[i].trim(); if (!line) continue;
      const [name,x,y,h] = line.split(',').map(s=>s.trim());
      const xx = Number(x), yy = Number(y), hh = Number(h);
      if (Number.isFinite(xx) && Number.isFinite(yy) && Number.isFinite(hh)) out.push({ name:name||`Obs${i}`, x:xx, y:yy, h:hh });
    }
    return out;
  }

  // ===== Desenho 2D com zoom/pan
  function makeZoomState(canvas){
    const s = { k:1, tx:0, ty:0 };
    const ctx = canvas.getContext('2d');
    const apply = ()=>{ ctx.setTransform(s.k,0,0,s.k, canvas.width/2 + s.tx, canvas.height/2 + s.ty); };
    const reset = ()=>{ s.k=1; s.tx=s.ty=0; apply(); };
    const wheel = (ev)=>{
      ev.preventDefault();
      const delta = Math.sign(ev.deltaY) * -0.1;
      const nk = clamp(s.k*(1+delta), 0.05, 20);
      s.k = nk; apply(); drawAll();
    };
    let last=null;
    const down = (ev)=>{ last=[ev.clientX, ev.clientY]; canvas.style.cursor='grabbing'; };
    const move = (ev)=>{ if(!last) return; const dx=ev.clientX-last[0], dy=ev.clientY-last[1]; last=[ev.clientX,ev.clientY]; s.tx+=dx; s.ty+=dy; apply(); drawAll(); };
    const up = ()=>{ last=null; canvas.style.cursor='default'; };
    const dbl = ()=>{ reset(); drawAll(); };
    canvas.addEventListener('wheel', wheel, { passive:false });
    canvas.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    canvas.addEventListener('dblclick', dbl);
    // init
    apply();
    return { state:s, apply, reset };
  }

  function drawPolygon(ctx, poly, style='#0b5'){
    ctx.beginPath();
    poly.forEach((p,i)=>{ if(i===0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
    ctx.strokeStyle = style;
    ctx.lineWidth = 2/ctx.getTransform().a;
    ctx.stroke();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = style;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  function drawCircle(ctx, r, style='#09f'){
    ctx.beginPath();
    ctx.arc(0,0,r,0,Math.PI*2);
    ctx.strokeStyle = style;
    ctx.lineWidth = 2/ctx.getTransform().a;
    ctx.stroke();
  }

  function label(ctx, text, x, y){
    const k = ctx.getTransform().a;
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = '#333';
    ctx.font = '12px system-ui';
    const p = ctx.getTransform().transformPoint(new DOMPoint(x,y));
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
  }

  // ===== Renderizações
  let planZoom, profZoom;
  let geom = null;
  let obstacles = [];
  let terrain = null;

  const planCanvas = el('planCanvas');
  const profileCanvas = el('profileCanvas');

  function drawPlan(){
    const ctx = planCanvas.getContext('2d');
    ctx.clearRect(0,0,planCanvas.width, planCanvas.height);

    // eixos
    ctx.save();
    ctx.translate(planCanvas.width/2, planCanvas.height/2);
    ctx.scale(planZoom.state.k, planZoom.state.k);
    ctx.translate(planZoom.state.tx, planZoom.state.ty);

    // strip
    drawPolygon(ctx, geom.strip, '#333');

    // IHS
    if (geom.innerHorizontal) {
      drawCircle(ctx, geom.innerHorizontal.radius, '#3399ff');
      label(ctx, `Inner Horizontal R=${fmt(geom.innerHorizontal.radius)}m`, 8, -8);
    }

    // Conical (desenha como anel — borda externa)
    if (geom.conical) {
      const outerR = geom.conical.innerRadius + (geom.conical.height * geom.conical.slope/100);
      drawCircle(ctx, outerR, '#99cc66');
      label(ctx, `Conical Rext≈${fmt(outerR)}m`, 8, 12);
    }

    // Aproximações
    if (el('drawA').checked) drawPolygon(ctx, geom.A.approach, '#ff9955');
    if (el('drawB').checked) drawPolygon(ctx, geom.B.approach, '#ff9955');

    // Inner Approach
    if (el('drawA').checked) drawPolygon(ctx, geom.A.innerApproach, '#ffaa99');
    if (el('drawB').checked) drawPolygon(ctx, geom.B.innerApproach, '#ffaa99');

    // Obstáculos
    ctx.fillStyle='#222';
    obstacles.forEach(o=>{
      ctx.beginPath();
      ctx.arc(o.x, o.y, 3/planZoom.state.k, 0, Math.PI*2);
      ctx.fill();
    });

    // Terreno: desenha borda da grade
    if (terrain) {
      ctx.strokeStyle='#888';
      ctx.setLineDash([6/planZoom.state.k, 6/planZoom.state.k]);
      const rows = terrain.zGrid.length, cols = terrain.zGrid[0].length;
      const minX = terrain.originX, minY = terrain.originY;
      const maxX = terrain.originX + (cols-1)*terrain.cell;
      const maxY = terrain.originY + (rows-1)*terrain.cell;
      ctx.strokeRect(minX, minY, maxX-minX, maxY-minY);
      ctx.setLineDash([]);
      label(ctx, 'Terreno (grade)', minX, maxY);
    }

    ctx.restore();
  }

  function drawProfile(){
    const ctx = profileCanvas.getContext('2d');
    ctx.clearRect(0,0,profileCanvas.width, profileCanvas.height);

    // sistema do perfil: X = distância (m) a partir da A (positiva para +X); Y = elevação (m)
    ctx.save();
    ctx.translate(40, profileCanvas.height-30);

    // linhas base
    ctx.strokeStyle='#ccc';
    ctx.beginPath();
    ctx.moveTo(0,0); ctx.lineTo(profileCanvas.width-60, 0);
    ctx.moveTo(0,-(geom.thrElev+200)); ctx.lineTo(profileCanvas.width-60, -(geom.thrElev+200));
    ctx.stroke();

    // IHS e OHS como linhas
    if (geom.innerHorizontal) {
      const z = geom.thrElev + geom.innerHorizontal.height;
      ctx.strokeStyle='#3399ff';
      ctx.beginPath();
      ctx.moveTo(0, -z); ctx.lineTo(profileCanvas.width-60, -z);
      ctx.stroke();
    }
    const ohsRadius = num(el('ohsRadius').value,15000);
    const ohsHeight = num(el('ohsHeight').value,150);
    const zOHS = geom.thrElev + ohsHeight;
    ctx.strokeStyle='#6666aa';
    ctx.beginPath(); ctx.moveTo(0,-zOHS); ctx.lineTo(profileCanvas.width-60,-zOHS); ctx.stroke();

    // Aproximação A (rampa)
    const cat = el('categoria').value;
    const code = Number(el('codeNumber').value);
    const A = OLSGeom.DATA.approach[cat];
    const slopeA = A.slope[code];
    const lenA = A.len[code];
    ctx.strokeStyle='#ff9955';
    ctx.beginPath();
    ctx.moveTo(0, -geom.thrElev);
    ctx.lineTo(lenA, -(geom.thrElev + lenA*slopeA/100));
    ctx.stroke();

    // Aproximação B (rampa invertida no eixo X negativo; desenhar como se fosse para +X para visual)
    const lenB = lenA, slopeB = slopeA;
    ctx.strokeStyle='#ff9955';
    ctx.beginPath();
    ctx.moveTo(0, -geom.thrElev);
    ctx.lineTo(lenB, -(geom.thrElev + lenB*slopeB/100));
    ctx.stroke();

    // Obstáculos: projetamos X absoluto (tomando A como origem)
    ctx.fillStyle='#222';
    obstacles.forEach(o=>{
      const x = Math.abs(o.x); // perfil ao longo do eixo
      const z = geom.thrElev + o.h;
      ctx.beginPath(); ctx.arc(x, -z, 2, 0, Math.PI*2); ctx.fill();
    });

    ctx.restore();
  }

  // ===== 3D
  let three = null;
  function ensure3D(){
    const container = el('ols3d');
    if (!container) return;
    if (!three) three = OLS3D.init3D(container);
    return three;
  }

  function build3D(){
    const t = ensure3D();
    if (!t) return;
    t.clearSurfaces();

    // Strip
    t.addSurface('strip', { poly: geom.strip });

    // IHS
    if (geom.innerHorizontal) {
      t.addSurface('ihs', { radius: geom.innerHorizontal.radius, z: geom.thrElev + geom.innerHorizontal.height });
    }

    // Conical
    if (geom.conical) {
      const baseZ = geom.thrElev + geom.innerHorizontal.height;
      t.addSurface('conical', {
        innerRadius: geom.conical.innerRadius,
        height: geom.conical.height,
        slopePct: geom.conical.slope,
        baseZ
      });
    }

    // Approach A/B
    const cat = el('categoria').value;
    const code = Number(el('codeNumber').value);
    const A = OLSGeom.DATA.approach[cat];
    const slope = A.slope[code];
    const h0 = geom.thrElev;
    if (el('drawA').checked) t.addSurface('approachA', { poly: geom.A.approach, h0, slopePct: slope });
    if (el('drawB').checked) t.addSurface('approachB', { poly: geom.B.approach, h0, slopePct: slope });

    // Terreno
    if (terrain) {
      t.addTerrain(terrain.zGrid, terrain.cell, terrain.originX, terrain.originY, geom.thrElev);
    }

    // Obstáculos
    obstacles.forEach(o=> t.addObstacle(o.x, o.y, o.h) );
  }

  // ===== Fluxo principal
  function gerar(){
    try {
      const p = collectParams();
      setRwyLabels(p.rwyLabelDeg);

      geom = OLSGeom.makeRunwayGeometry({
        categoria: p.categoria,
        codeNumber: p.codeNumber,
        thrElev: p.thrElev,
        rwLen: p.rwLen,
        rwWidth: p.rwWidth,
        headingDeg: p.headingDeg
      });

      planZoom.apply(); drawPlan();
      drawProfile();

      // 3D: aguarda THREE_READY se necessário
      if (window.THREE) {
        build3D();
      } else {
        window.addEventListener('THREE_READY', () => { el('ols3dFallback').style.display='none'; build3D(); }, { once:true });
        window.addEventListener('THREE_FAILED', () => { el('ols3dFallback').style.display='block'; }, { once:true });
      }

      setMsg('Modelo atualizado.');
    } catch (e) {
      console.error(e);
      setMsg('Erro ao gerar modelo: ' + e.message, true);
    }
  }

  // ===== Bind de UI
  function bind(){
    // ZOOM handlers
    planZoom = makeZoomState(planCanvas);
    profZoom = { apply:()=>{}, reset:()=>{} }; // perfil sem pan/zoom por simplicidade

    ['categoria','codeNumber','codeLetterF','thrElev','rwLen','rwWidth','rwHeading','rwyLabelDeg','drawA','drawB','ohsRadius','ohsHeight']
      .forEach(id => el(id).addEventListener('input', gerar));
    el('btnGerar').addEventListener('click', gerar);

    el('btnFit').addEventListener('click', ()=>{
      // Ajusta para ver IHS/conical/approaches
      const rIHS = geom?.innerHorizontal?.radius || 2500;
      const rCon = geom?.conical ? (geom.conical.innerRadius + geom.conical.height*geom.conical.slope/100) : rIHS;
      const ext = Math.max(rCon, 0.6*el('rwLen').value|0);
      // fit ao canvas
      planZoom.state.k = Math.min(planCanvas.width, planCanvas.height)/(2*ext*1.1);
      planZoom.state.tx = planZoom.state.ty = 0;
      planZoom.apply(); drawPlan();
    });

    // CSVs
    el('fileTerrain').addEventListener('change', async ()=>{
      const file = el('fileTerrain').files[0];
      if (!file) { terrain=null; gerar(); return; }
      const text = await readFileAsText(file);
      terrain = parseTerrainCSV(text);
      if (!terrain) { setMsg('Terreno CSV inválido.', true); return; }
      gerar();
    });

    el('fileObstacles').addEventListener('change', async ()=>{
      const file = el('fileObstacles').files[0];
      if (!file) { obstacles=[]; gerar(); return; }
      const text = await readFileAsText(file);
      obstacles = parseObstaclesCSV(text);
      gerar();
    });

    // Saves
    el('btnSave2DPlan').addEventListener('click', ()=>{
      const url = planCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url; a.download = 'ols_planta.png'; a.click();
    });
    el('btnSave2DProfile').addEventListener('click', ()=>{
      const url = profileCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url; a.download = 'ols_perfil.png'; a.click();
    });
    el('btnSave3D').addEventListener('click', ()=>{
      const t = ensure3D(); if (!t) return;
      const url = t.snapshotPNG();
      const a = document.createElement('a');
      a.href = url; a.download = 'ols_3d.png'; a.click();
    });

    // Inicial
    setRwyLabels(num(el('rwyLabelDeg').value, 90));
  }

  // ===== Boot
  function init(){
    bind();
    gerar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
