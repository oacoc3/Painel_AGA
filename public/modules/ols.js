/* public/modules/ols.js
 * Gerador de OLS (2D + 3D interativo) com camada de terreno e obstáculos.
 * Não altera estilos globais. Usa apenas <canvas> e uma div (#ols3d) para WebGL.
 */
window.Modules = window.Modules || {};
window.Modules.ols = (() => {
  // ===== Helpers DOM =====
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ===== Parâmetros (Annex 14 — valores consolidados e simplificados) =====
  const DATA = {
    innerHorizontal: {
      height: 45,
      radius: {
        nonInstrument: { 1: 2000, 2: 2500, 3: 4000, 4: 4000 },
        nonPrecision:  { 1: 3500, 2: 3500, 3: 4000, 4: 4000 },
        catI:          { 1: 3500, 2: 3500, 3: 4000, 4: 4000 },
        catIIIII:      { 3: 4000, 4: 4000 }
      }
    },
    conical: {
      slope: 5,
      height: {
        nonInstrument: { 1: 35, 2: 55, 3: 75, 4: 100 },
        nonPrecision:  { 1: 60, 2: 60, 3: 75, 4: 100 },
        catI:          { 1: 60, 2: 60, 3: 100, 4: 100 },
        catIIIII:      { 3: 100, 4: 100 }
      }
    },
    approach: {
      nonInstrument: {
        innerEdge: { 1: 60, 2: 80, 3: 150, 4: 150 },
        distThr:   { 1: 30, 2: 60, 3: 60, 4: 60 },
        divEach:   { 1: 10, 2: 10, 3: 10, 4: 10 },
        first:     { len: {1:1600,2:2500,3:3000,4:3000}, slope: {1:5,2:4,3:3.33,4:2.5} },
        second:    { len: {1:0,2:0,3:0,4:0}, slope: {1:0,2:0,3:0,4:0} },
        horiz:     { len: {1:0,2:0,3:0,4:0} }
      },
      nonPrecision: {
        innerEdge: { 1: 140, 2: 140, 3: 280, 4: 280 },
        distThr:   { 1: 60, 2: 60, 3: 60, 4: 60 },
        divEach:   { 1: 15, 2: 15, 3: 15, 4: 15 },
        first:     { len: {1:2500,2:3000,3:3000,4:3000}, slope: {1:3.33,2:2,3:2,4:2} },
        second:    { len: {1:3600,2:3600,3:3600,4:3600}, slope: {1:2.5,2:2.5,3:2.5,4:2.5} },
        horiz:     { len: {1:8400,2:8400,3:8400,4:8400} }
      },
      catI: {
        innerEdge: { 1: 140, 2: 140, 3: 280, 4: 280 },
        distThr:   { 1: 60, 2: 60, 3: 60, 4: 60 },
        divEach:   { 1: 15, 2: 15, 3: 15, 4: 15 },
        first:     { len: {1:3000,2:3000,3:3000,4:3000}, slope: {1:2.5,2:2.5,3:2,4:2} },
        second:    { len: {1:12000,2:12000,3:3600,4:3600}, slope: {1:3,2:3,3:2.5,4:2.5} },
        horiz:     { len: {1:8400,2:8400,3:8400,4:8400} }
      },
      catIIIII: {
        innerEdge: { 3: 280, 4: 280 },
        distThr:   { 3: 60, 4: 60 },
        divEach:   { 3: 15, 4: 15 },
        first:     { len: {3:3000,4:3000}, slope: {3:2,4:2} },
        second:    { len: {3:3600,4:3600}, slope: {3:2.5,4:2.5} },
        horiz:     { len: {3:8400,4:8400} }
      }
    },
    innerApproach: {
      catI:     { width: {1:90,2:90,3:120,4:120}, distThr: {1:60,2:60,3:60,4:60}, len: {1:900,2:900,3:900,4:900}, slope: {1:2.5,2:2.5,3:2,4:2} },
      catIIIII: { width: {3:120,4:120},               distThr: {3:60,4:60},           len: {3:900,4:900},           slope: {3:2,4:2} }
    },
    transitional: {
      slope: {
        nonInstrument: {1:20,2:20,3:14.3,4:14.3},
        nonPrecision:  {1:20,2:14.3,3:14.3,4:14.3},
        catI:          {1:14.3,2:14.3,3:14.3,4:14.3},
        catIIIII:      {3:14.3,4:14.3}
      }
    },
    innerTransitional: {
      slope: {
        catI:     {1:40,2:40,3:33.3,4:33.3},
        catIIIII: {3:33.3,4:33.3}
      }
    },
    balkedLanding: {
      innerEdge: { catI: {1:90,2:90,3:120,4:120}, catIIIII: {3:120,4:120} },
      distThr:   { catI: {1:1800,2:1800,3:1800,4:1800}, catIIIII: {3:1800,4:1800} },
      divEach:   { catI: {1:10,2:10,3:10,4:10}, catIIIII: {3:10,4:10} },
      slope:     { catI: {1:4,2:3.33,3:3.33,4:3.33}, catIIIII: {3:3.33,4:3.33} }
    },
    takeoffClimb: {
      innerEdge: {1:60,2:80,3:180,4:180},
      distRwEnd: {1:30,2:60,3:60,4:60},
      divEach:   {1:10,2:10,3:12.5,4:12.5},
      finalWidth:{1:380,2:580,3:1200,4:1200},
      len:       {1:1600,2:2500,3:15000,4:15000},
      slope:     {1:5,2:4,3:2,4:2}
    }
  };

  function getNumber(v, d=0){ const x = Number(v); return Number.isFinite(x) ? x : d; }

  // ===== Modelo geométrico (idêntico às regras do 2D; 3D usa os mesmos shapes) =====
  function buildModel(p) {
    const m = { p, shapes: {}, extents: { xmin:-200, xmax: Math.max(3000,p.rwLen)+16000, ymin:-2000, ymax:2000, zmax: 300 } };

    // IHS
    const ihR = DATA.innerHorizontal.radius[p.cat]?.[p.code];
    const ihH = DATA.innerHorizontal.height;
    if (ihR) m.shapes.ihs = { radius: ihR, height: ihH };

    // Conical
    const conH = DATA.conical.height[p.cat]?.[p.code];
    if (ihR && conH) m.shapes.cone = { innerRadius: ihR, height: conH, slope: DATA.conical.slope };

    // Approach
    const A = DATA.approach[p.cat];
    if (A && A.innerEdge[p.code]) {
      const innerEdge = A.innerEdge[p.code];
      const dist = A.distThr[p.code];
      const div = A.divEach[p.code] / 100;
      const fLen = A.first.len[p.code];
      const fSlope = A.first.slope[p.code] / 100;
      const sLen = (A.second.len[p.code] || 0);
      const sSlope = (A.second.slope?.[p.code] || 0) / 100;
      const hLen = (A.horiz.len[p.code] || 0);
      const polys = [];
      let x0 = dist;
      let w0 = innerEdge;
      let x1 = x0 + fLen;
      let w1 = w0 + 2*div*fLen;
      polys.push({ x0, w0, x1, w1, color:'#4a90e2', label:'Approach (1)', slope:fSlope });

      if (sLen>0) {
        const x2 = x1 + sLen;
        const w2 = w1 + 2*div*sLen;
        polys.push({ x0:x1, w0:w1, x1:x2, w1:w2, color:'#2f7bdc', label:'Approach (2)', slope:sSlope });
        x1 = x2; w1 = w2;
      }
      if (hLen>0) {
        const x3 = x1 + hLen;
        polys.push({ x0:x1, w0:w1, x1:x3, w1:w1, color:'#7fb3f3', label:'Approach (H)', slope:0 });
      }
      m.shapes.approach = polys;
    }

    // Inner approach (CAT I / II-III)
    const IA = DATA.innerApproach[p.cat];
    if (IA && IA.width[p.code]) {
      let w = IA.width[p.code];
      if (p.letterF && w===120) w = 140;
      m.shapes.innerApproach = { dist: IA.distThr[p.code], len: IA.len[p.code], width: w, slope: IA.slope[p.code]/100 };
    }

    // Balked landing
    const blCat = (p.cat==='catIIIII') ? 'catIIIII' : (p.cat==='catI' ? 'catI' : null);
    if (blCat) {
      const innerEdge = DATA.balkedLanding.innerEdge[blCat][p.code];
      if (innerEdge) {
        const distThr = DATA.balkedLanding.distThr[blCat][p.code];
        const div = DATA.balkedLanding.divEach[blCat][p.code] / 100;
        const slope = DATA.balkedLanding.slope[blCat][p.code] / 100;
        const targetLen = ihH / (slope || 0.01);
        const len = Math.min(5000, targetLen);
        m.shapes.balked = { x0:distThr, w0:innerEdge, x1: distThr+len, w1: innerEdge + 2*div*len, slope, color:'#9013fe' };
      }
    }

    // Transitional (largura até atingir IHS)
    const tSlope = DATA.transitional.slope[p.cat]?.[p.code];
    if (tSlope) {
      const reach = ihH / (tSlope/100);
      m.shapes.transitional = { width: reach, slope:tSlope/100, color:'#bd10e0' };
    }
    // Inner transitional (perfil indicativo)
    const itSlope = DATA.innerTransitional.slope[p.cat]?.[p.code];
    if (itSlope) m.shapes.innerTransitional = { slope: itSlope/100, color:'#bd10e0' };

    // Take-off climb
    const TO = DATA.takeoffClimb;
    if (TO.innerEdge[p.code]) {
      const inner = TO.innerEdge[p.code];
      const distEnd = TO.distRwEnd[p.code];
      const div = TO.divEach[p.code]/100;
      const len = TO.len[p.code];
      const slope = TO.slope[p.code]/100;
      const x0 = p.rwLen + distEnd;
      const x1 = x0 + len;
      const w0 = inner;
      const w1 = inner + 2*div*len;
      m.shapes.takeoff = { x0, x1, w0, w1, slope, color:'#f5a623' };
    }

    // OHS (parâmetro)
    if (p.ohsR>0 && p.ohsH>0) m.shapes.ohs = { radius:p.ohsR, height:p.ohsH };

    return m;
  }

  // ===== 2D: Planta & Perfil =====
  function clearCanvas(c){ const ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); return ctx; }

  function drawPlan(canvas, model) {
    const ctx = clearCanvas(canvas);
    const W = canvas.width, H = canvas.height;
    const margin = 40;
    const Xspan = model.extents.xmax - model.extents.xmin;
    const Yspan = model.extents.ymax - model.extents.ymin;
    const s = Math.min((W-2*margin)/Xspan, (H-2*margin)/Yspan);
    const x0 = margin - model.extents.xmin*s;
    const y0 = margin - model.extents.ymin*s;
    const toPx = (pt) => [x0 + pt[0]*s, y0 + (-pt[1])*s];

    // Grade
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
    for (let x = 0; x <= model.extents.xmax; x+=1000){ const [a,b]=toPx([x,model.extents.ymin]); const [c,d]=toPx([x,model.extents.ymax]); ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke(); }
    for (let y = -2000; y <= 2000; y+=500){ const [a,b]=toPx([model.extents.xmin,y]); const [c,d]=toPx([model.extents.xmax,y]); ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke(); }

    function drawTrapezoid(x0m, w0m, x1m, w1m, color) {
      const half0 = w0m/2, half1 = w1m/2;
      const p1 = toPx([x0m, -half0]), p2 = toPx([x1m, -half1]), p3 = toPx([x1m, half1]), p4 = toPx([x0m, half0]);
      ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.lineTo(...p4); ctx.closePath();
      ctx.fillStyle = color; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    }

    // Pista
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.8;
    const rw = [ toPx([-60,-model.p.rwWid/2]), toPx([model.p.rwLen,-model.p.rwWid/2]), toPx([model.p.rwLen,model.p.rwWid/2]), toPx([-60,model.p.rwWid/2]) ];
    ctx.beginPath(); ctx.moveTo(...rw[0]); for (let i=1;i<rw.length;i++) ctx.lineTo(...rw[i]); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;

    // Sections
    model.shapes.approach?.forEach(sec => drawTrapezoid(sec.x0, sec.w0, sec.x1, sec.w1, sec.color||'#4a90e2'));
    if (model.shapes.innerApproach){ const ia=model.shapes.innerApproach; drawTrapezoid(ia.dist, ia.width, ia.dist+ia.len, ia.width, '#50e3c2'); }
    if (model.shapes.balked){ const b=model.shapes.balked; drawTrapezoid(b.x0, b.w0, b.x1, b.w1, b.color); }
    if (model.shapes.takeoff){ const t=model.shapes.takeoff; drawTrapezoid(t.x0,t.w0,t.x1,t.w1,t.color); }

    // IHS
    if (model.shapes.ihs){ ctx.strokeStyle='#7ed321'; ctx.lineWidth=2; const [cx,cy]=toPx([0,0]); const r=model.shapes.ihs.radius*s; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); }
    // Conical (anel externo)
    if (model.shapes.ihs && model.shapes.cone){ ctx.strokeStyle='#b8e986'; ctx.lineWidth=2; ctx.setLineDash([6,6]); const [cx,cy]=toPx([0,0]); const addR=(model.shapes.cone.height)/(DATA.conical.slope/100); const r=(model.shapes.ihs.radius+addR)*s; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }
    // Transição — faixas laterais
    if (model.shapes.transitional){ ctx.strokeStyle='#bd10e0'; ctx.lineWidth=2; const reach=model.shapes.transitional.width;
      // direita
      let p0=toPx([-60, model.p.rwWid/2]), p1=toPx([model.p.rwLen, model.p.rwWid/2]), p2=toPx([model.p.rwLen, model.p.rwWid/2+reach]), p3=toPx([-60, model.p.rwWid/2+reach]);
      ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.globalAlpha=.2; ctx.fillStyle='#bd10e0'; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
      // esquerda
      p0=toPx([-60, -model.p.rwWid/2]); p1=toPx([model.p.rwLen, -model.p.rwWid/2]); p2=toPx([model.p.rwLen, -model.p.rwWid/2-reach]); p3=toPx([-60, -model.p.rwWid/2-reach]);
      ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.globalAlpha=.2; ctx.fillStyle='#bd10e0'; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    }
    // OHS
    if (model.shapes.ohs){ ctx.strokeStyle='#9b9b9b'; ctx.lineWidth=1.5; ctx.setLineDash([3,5]); const [cx,cy]=toPx([0,0]); const r=model.shapes.ohs.radius*s; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }

    // Eixos
    ctx.fillStyle='#000'; ctx.font='12px sans-serif';
    const [oX,oY]=toPx([0,0]); ctx.beginPath(); ctx.moveTo(oX-6,oY); ctx.lineTo(oX+6,oY); ctx.moveTo(oX,oY-6); ctx.lineTo(oX,oY+6); ctx.strokeStyle='#000'; ctx.stroke();
    ctx.fillText('THR (0,0)', oX+8, oY-8);
    const km=1000*s; ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(40, H-30); ctx.lineTo(40+km, H-30); ctx.stroke(); ctx.fillText('1 km', 40+km/2-14, H-35);
  }

  function drawProfile(canvas, model) {
    const ctx = clearCanvas(canvas);
    const W=canvas.width, H=canvas.height, margin=40;
    const Xmax=16000;
    const Zmax = Math.max(model.extents.zmax, (model.shapes.ohs?.height||0), (model.shapes.ihs?.height||0) + (model.shapes.cone?.height||0));
    const sx=(W-2*margin)/Xmax, sz=(H-2*margin)/Zmax;
    const toPx=(x,z)=>[margin + x*sx, H-margin - z*sz];

    // grade
    ctx.strokeStyle='#eee'; ctx.lineWidth=1;
    for (let x=0;x<=Xmax;x+=1000){ const [a,b]=toPx(x,0), [c,d]=toPx(x,Zmax); ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke(); }
    for (let z=0;z<=Zmax;z+=25){ const [a,b]=toPx(0,z), [c,d]=toPx(Xmax,z); ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke(); }

    // eixos
    ctx.strokeStyle='#000'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(Xmax,0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(0,Zmax)); ctx.stroke();
    ctx.fillStyle='#000'; ctx.font='12px sans-serif';
    ctx.fillText('Distância (m)', W/2-30, H-10);
    ctx.save(); ctx.translate(14,H/2); ctx.rotate(-Math.PI/2); ctx.fillText('Altura acima do limiar (m)', 0, 0); ctx.restore();

    // IHS
    if (model.shapes.ihs){ ctx.strokeStyle='#7ed321'; ctx.setLineDash([6,4]); ctx.beginPath(); ctx.moveTo(...toPx(0,model.shapes.ihs.height)); ctx.lineTo(...toPx(Xmax,model.shapes.ihs.height)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle='#7ed321'; ctx.fillText('IHS 45 m', ...toPx(20,model.shapes.ihs.height+3)); }
    // Conical
    if (model.shapes.ihs && model.shapes.cone){ const z1=model.shapes.ihs.height + model.shapes.cone.height; ctx.strokeStyle='#b8e986'; ctx.beginPath(); ctx.moveTo(...toPx(0,model.shapes.ihs.height)); ctx.lineTo(...toPx(0,z1)); ctx.stroke(); ctx.fillStyle='#b8e986'; ctx.fillText(`Cônica +${model.shapes.cone.height} m`, ...toPx(10, z1-2)); }
    // Approach perfil
    if (model.shapes.approach){ let z=0; for (const sec of model.shapes.approach){ const len=sec.x1-sec.x0, z1=z + (sec.slope||0)*len; ctx.strokeStyle='#4a90e2'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(sec.x0,z)); ctx.lineTo(...toPx(sec.x1,z1)); ctx.stroke(); z=z1; } }
    // Inner approach
    if (model.shapes.innerApproach){ const ia=model.shapes.innerApproach; const z0=ia.slope*ia.len; ctx.strokeStyle='#50e3c2'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(ia.dist,0)); ctx.lineTo(...toPx(ia.dist+ia.len,z0)); ctx.stroke(); }
    // Balked
    if (model.shapes.balked){ const b=model.shapes.balked; const z1=b.slope*(b.x1-b.x0); ctx.strokeStyle='#9013fe'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(b.x0,0)); ctx.lineTo(...toPx(b.x1,z1)); ctx.stroke(); }
    // Takeoff
    if (model.shapes.takeoff){ const t=model.shapes.takeoff; const z1=t.slope*(t.x1-t.x0); ctx.strokeStyle='#f5a623'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(t.x0,0)); ctx.lineTo(...toPx(t.x1,z1)); ctx.stroke(); }
    // Transicional
    if (model.shapes.transitional){ const ts=model.shapes.transitional; ctx.strokeStyle='#bd10e0'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(ts.width, model.shapes.ihs.height)); ctx.stroke(); }
    if (model.shapes.innerTransitional){ const it=model.shapes.innerTransitional; const w=model.shapes.ihs.height/it.slope; ctx.strokeStyle='#bd10e0'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(w, model.shapes.ihs.height)); ctx.stroke(); ctx.setLineDash([]); }
    // OHS
    if (model.shapes.ohs){ ctx.strokeStyle='#9b9b9b'; ctx.setLineDash([6,6]); ctx.beginPath(); ctx.moveTo(...toPx(0,model.shapes.ohs.height)); ctx.lineTo(...toPx(Xmax,model.shapes.ohs.height)); ctx.stroke(); ctx.setLineDash([]); }
  }

  function save2D() {
    const plan = el('planCanvas'), prof = el('profileCanvas');
    const combo = document.createElement('canvas');
    combo.width = Math.max(plan.width, prof.width);
    combo.height = plan.height + 20 + prof.height;
    const ctx = combo.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,combo.width, combo.height);
    ctx.drawImage(plan, 0, 0);
    ctx.drawImage(prof, 0, plan.height + 20);
    const a = document.createElement('a');
    a.href = combo.toDataURL('image/png');
    a.download = 'ols_2d.png';
    a.click();
  }

  // ===== 3D =====
  let three = { scene:null, camera:null, controls:null, renderer:null, meshes:[], terrain:null, obstacles:[] };

  function init3D() {
    const box = el('ols3d');
    if (!box) return;
    // limpa container
    box.innerHTML = '';

    const width = box.clientWidth;
    const height = box.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(55, width/height, 1, 200000);
    camera.position.set(-800, 800, 1200);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    box.appendChild(renderer.domElement);

    // luz
    const amb = new THREE.AmbientLight(0xffffff, 0.8); scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(1000,1000,2000); scene.add(dir);

    // grade no plano do terreno
    const grid = new THREE.GridHelper(4000, 40, 0xdddddd, 0xeeeeee);
    grid.position.set(1000, 0, 0); // alinhado aproximadamente ao domínio (X positivo para frente)
    scene.add(grid);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(1000, 0, 0);
    controls.update();

    three = { scene, camera, controls, renderer, meshes:[], terrain:null, obstacles:[] };

    // animação
    function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
    animate();

    window.addEventListener('resize', () => {
      const w = box.clientWidth, h = box.clientHeight || (box.getBoundingClientRect().width * 9/16);
      camera.aspect = w/h; camera.updateProjectionMatrix();
      renderer.setSize(w,h);
    });
  }

  function clear3DWorld() {
    if (!three.scene) return;
    // remove meshes adicionadas
    three.meshes.forEach(m => { three.scene.remove(m); m.geometry?.dispose?.(); if (m.material) {
      if (Array.isArray(m.material)) m.material.forEach(mm=>mm.dispose?.()); else m.material.dispose?.();
    }});
    three.meshes = [];
    // terreno
    if (three.terrain) { three.scene.remove(three.terrain); three.terrain.geometry?.dispose?.(); three.terrain.material?.dispose?.(); three.terrain=null; }
    // obstáculos
    three.obstacles.forEach(o => { three.scene.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); });
    three.obstacles = [];
  }

  function addMesh(mesh){ three.scene.add(mesh); three.meshes.push(mesh); }

  function build3D(model) {
    clear3DWorld();
    if (!three.scene) init3D();

    // Escala e cores — apenas dentro do canvas 3D
    const col = {
      runway: 0x000000,
      approach1: 0x4a90e2,
      approach2: 0x2f7bdc,
      approachH: 0x7fb3f3,
      innerApp: 0x50e3c2,
      trans: 0xbd10e0,
      takeoff: 0xf5a623,
      balked: 0x9013fe,
      ihs: 0x7ed321,
      cone: 0xb8e986,
      ohs: 0x9b9b9b,
      terrain: 0x888888,
      obstacle: 0xd0021b
    };

    // Pista (box fino)
    const rw = new THREE.Mesh(
      new THREE.BoxGeometry(model.p.rwLen+60, 2, model.p.rwWid),
      new THREE.MeshBasicMaterial({ color: col.runway })
    );
    rw.position.set(model.p.rwLen/2 - 30, 1, 0);
    addMesh(rw);

    // Aproximação (como superfícies finas)
    if (model.shapes.approach) {
      model.shapes.approach.forEach((sec, idx) => {
        const g = trapezoidGeometry(sec.x0, sec.w0, sec.x1, sec.w1, 0.5);
        const mat = new THREE.MeshBasicMaterial({ color: idx===0?col.approach1 : (sec.slope===0?col.approachH:col.approach2), transparent:true, opacity:0.5, side:THREE.DoubleSide });
        const mesh = new THREE.Mesh(g, mat);
        addMesh(mesh);
      });
    }
    // Inner Approach (retângulo fino)
    if (model.shapes.innerApproach) {
      const ia = model.shapes.innerApproach;
      const g = trapezoidGeometry(ia.dist, ia.width, ia.dist+ia.len, ia.width, 0.5);
      const m = new THREE.MeshBasicMaterial({ color: col.innerApp, transparent:true, opacity:0.5, side:THREE.DoubleSide });
      addMesh(new THREE.Mesh(g, m));
    }
    // Takeoff
    if (model.shapes.takeoff) {
      const t = model.shapes.takeoff;
      const g = trapezoidGeometry(t.x0, t.w0, t.x1, t.w1, 0.5);
      const m = new THREE.MeshBasicMaterial({ color: col.takeoff, transparent:true, opacity:0.5, side:THREE.DoubleSide });
      addMesh(new THREE.Mesh(g, m));
    }
    // Balked
    if (model.shapes.balked) {
      const b = model.shapes.balked;
      const g = trapezoidGeometry(b.x0, b.w0, b.x1, b.w1, 0.5);
      const m = new THREE.MeshBasicMaterial({ color: col.balked, transparent:true, opacity:0.5, side:THREE.DoubleSide });
      addMesh(new THREE.Mesh(g, m));
    }

    // Transição (faixas laterais)
    if (model.shapes.transitional) {
      const reach = model.shapes.transitional.width;
      const left = rectGeometry(-60, -model.p.rwWid/2 - reach, model.p.rwLen+60, reach, 0.3);
      const right= rectGeometry(-60,  model.p.rwWid/2,       model.p.rwLen+60, reach, 0.3);
      const m = new THREE.MeshBasicMaterial({ color: col.trans, transparent:true, opacity:0.25, side:THREE.DoubleSide });
      addMesh(new THREE.Mesh(left, m)); addMesh(new THREE.Mesh(right,m.clone()));
    }

    // IHS (anel como círculo fino) — plano horizontal a z=45
    if (model.shapes.ihs) {
      const ring = ringGeometry(0, model.shapes.ihs.radius, 128, 0.5);
      const mat = new THREE.MeshBasicMaterial({ color: col.ihs, transparent:true, opacity:0.35, side:THREE.DoubleSide });
      const mesh = new THREE.Mesh(ring, mat); mesh.position.y = model.shapes.ihs.height;
      addMesh(mesh);
    }
    // Conical (cilindro tronco aberto)
    if (model.shapes.ihs && model.shapes.cone) {
      const innerR = model.shapes.ihs.radius;
      const addR = model.shapes.cone.height / (DATA.conical.slope/100);
      const outerR = innerR + addR;
      const h = model.shapes.cone.height;
      const geo = new THREE.CylinderGeometry(outerR, innerR, h, 128, 1, true);
      const mat = new THREE.MeshBasicMaterial({ color: col.cone, wireframe:false, transparent:true, opacity:0.2, side:THREE.DoubleSide });
      const cone = new THREE.Mesh(geo, mat);
      cone.position.y = model.shapes.ihs.height + h/2;
      addMesh(cone);
    }
    // OHS (círculo fino)
    if (model.shapes.ohs) {
      const ring = ringGeometry(0, model.shapes.ohs.radius, 128, 0.5);
      const mat = new THREE.MeshBasicMaterial({ color: col.ohs, transparent:true, opacity:0.25, side:THREE.DoubleSide });
      const mesh = new THREE.Mesh(ring, mat); mesh.position.y = model.shapes.ohs.height;
      addMesh(mesh);
    }

    // Terreno/obstáculos adicionados depois via loadTerrain/loadObstacles
  }

  // Geometrias auxiliares (X para frente, Z lateral convertida para 'z' THREE => usamos X horizontal, Z profundidade, Y altura)
  function trapezoidGeometry(x0, w0, x1, w1, thickness=0.5) {
    // cria um retângulo/trapézio no plano XZ com pequena espessura em Y
    const half0 = w0/2, half1 = w1/2;
    const vertsTop = [
      new THREE.Vector3(x0, thickness/2, -half0),
      new THREE.Vector3(x1, thickness/2, -half1),
      new THREE.Vector3(x1, thickness/2,  half1),
      new THREE.Vector3(x0, thickness/2,  half0),
    ];
    const vertsBot = [
      new THREE.Vector3(x0, -thickness/2, -half0),
      new THREE.Vector3(x1, -thickness/2, -half1),
      new THREE.Vector3(x1, -thickness/2,  half1),
      new THREE.Vector3(x0, -thickness/2,  half0),
    ];
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const pushFace = (a,b,c)=>{ positions.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z); };

    // faces top
    pushFace(vertsTop[0], vertsTop[1], vertsTop[2]);
    pushFace(vertsTop[0], vertsTop[2], vertsTop[3]);
    // faces bottom
    pushFace(vertsBot[2], vertsBot[1], vertsBot[0]);
    pushFace(vertsBot[3], vertsBot[2], vertsBot[0]);
    // laterais
    for (let i=0;i<4;i++){
      const j=(i+1)%4;
      pushFace(vertsTop[i], vertsTop[j], vertsBot[j]);
      pushFace(vertsTop[i], vertsBot[j], vertsBot[i]);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions),3));
    geom.computeVertexNormals();
    return geom;
  }

  function rectGeometry(x, y0, len, width, thickness=0.5) {
    const w0 = width, w1 = width;
    return trapezoidGeometry(x, w0, x+len, w1, thickness).translate(0,0,y0 + width/2);
  }

  function ringGeometry(r0, r1, seg=64, thickness=0.5) {
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const push = (a,b,c)=>{ positions.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z); };
    for (let i=0;i<seg;i++){
      const a0 = (i/seg)*Math.PI*2, a1 = ((i+1)/seg)*Math.PI*2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p00 = new THREE.Vector3(r0*c0, thickness/2, r0*s0);
      const p01 = new THREE.Vector3(r1*c0, thickness/2, r1*s0);
      const p10 = new THREE.Vector3(r0*c1, thickness/2, r0*s1);
      const p11 = new THREE.Vector3(r1*c1, thickness/2, r1*s1);

      const q00 = p00.clone().setY(-thickness/2);
      const q01 = p01.clone().setY(-thickness/2);
      const q10 = p10.clone().setY(-thickness/2);
      const q11 = p11.clone().setY(-thickness/2);

      // topo
      push(p01, p11, p10); push(p01, p10, p00);
      // fundo
      push(q10, q11, q01); push(q00, q10, q01);
      // laterais internas
      push(p00, p10, q10); push(p00, q10, q00);
      // laterais externas
      push(p11, p01, q01); push(p11, q01, q11);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions),3));
    geom.computeVertexNormals();
    return geom;
  }

  // ===== Terreno e Obstáculos =====
  async function readTextFile(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsText(file); }); }

  function loadTerrainCSV(text) {
    // primeira linha: "# cell=50 originX=-2000 originY=-2000"
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return null;

    let meta = { cell: 50, originX: 0, originY: 0 };
    if (lines[0].startsWith('#')) {
      const m = {
        cell: lines[0].match(/cell\s*=\s*([0-9.]+)/i),
        ox:   lines[0].match(/originX\s*=\s*(-?[0-9.]+)/i),
        oy:   lines[0].match(/originY\s*=\s*(-?[0-9.]+)/i),
      };
      meta.cell = m.cell ? parseFloat(m.cell[1]) : 50;
      meta.originX = m.ox ? parseFloat(m.ox[1]) : 0;
      meta.originY = m.oy ? parseFloat(m.oy[1]) : 0;
      lines.shift();
    }

    const grid = lines.map(row => row.split(/[,; \t]+/).filter(Boolean).map(parseFloat));
    const ny = grid.length, nx = grid[0]?.length || 0;
    if (nx===0 || ny===0) return null;

    // cria malha como Plane em XZ (Y altura) — vertices (nx*ny)
    const geometry = new THREE.PlaneGeometry(meta.cell*(nx-1), meta.cell*(ny-1), nx-1, ny-1);
    geometry.rotateX(-Math.PI/2); // agora X para frente, Z lateral, Y pra cima
    // desloca para originX/Y
    geometry.translate(meta.originX + meta.cell*(nx-1)/2, 0, meta.originY + meta.cell*(ny-1)/2);

    // aplica alturas
    const pos = geometry.attributes.position;
    for (let j=0;j<ny;j++){
      for (let i=0;i<nx;i++){
        const idx = j*nx + i;
        const z = grid[j][i]; // altura (m) acima do limiar
        pos.setY(idx, z);
      }
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide, wireframe:false, transparent:true, opacity:0.6 });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  function loadObstaclesCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const header = lines.shift().split(/[,; \t]+/).map(s => s.trim().toLowerCase());
    const idx = { name: header.indexOf('name'), x: header.indexOf('x'), y: header.indexOf('y'), h: header.indexOf('height') };
    if (idx.x<0 || idx.y<0 || idx.h<0) return [];

    const list = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(/[,; \t]+/);
      const name = idx.name>=0 ? parts[idx.name] : '';
      const x = parseFloat(parts[idx.x]||'0'), y = parseFloat(parts[idx.y]||'0'), h = parseFloat(parts[idx.h]||'0');
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(2.5, 2.5, Math.max(1,h), 12),
        new THREE.MeshBasicMaterial({ color: 0xd0021b })
      );
      cyl.position.set(x, h/2, y);
      cyl.userData = { name, height: h };
      list.push(cyl);
    }
    return list;
  }

  // ===== Ligação com o formulário =====
  function readForm() {
    const cat = el('categoria').value;
    const code = parseInt(el('codeNumber').value, 10);
    const letterF = el('codeLetterF').checked;
    const thrElev = getNumber(el('thrElev').value, 0);
    const rwLen = getNumber(el('rwLen').value, 3000);
    const rwWid = getNumber(el('rwWid').value, 45);
    const ohsR = getNumber(el('ohsRadius').value, 15000);
    const ohsH = getNumber(el('ohsHeight').value, 150);
    return { cat, code, letterF, thrElev, rwLen, rwWid, ohsR, ohsH };
  }

  async function gerar() {
    const p = readForm();
    const msg = el('msg'); msg.textContent = '';
    if (p.cat==='catIIIII' && (p.code===1 || p.code===2)) {
      msg.textContent = 'CAT II/III só se aplica a code number 3 ou 4.';
    }
    const model = buildModel(p);
    drawPlan(el('planCanvas'), model);
    drawProfile(el('profileCanvas'), model);
    build3D(model);
  }

  async function onTerrainFile(file) {
    if (!file) return;
    const txt = await readTextFile(file);
    const mesh = loadTerrainCSV(txt);
    if (!mesh) { el('msg').textContent = 'Terreno CSV inválido.'; return; }
    if (!three.scene) init3D();
    if (three.terrain) { three.scene.remove(three.terrain); }
    three.terrain = mesh; three.scene.add(mesh);
  }

  async function onObstaclesFile(file) {
    if (!file) return;
    const txt = await readTextFile(file);
    const obs = loadObstaclesCSV(txt);
    if (!three.scene) init3D();
    three.obstacles.forEach(o => three.scene.remove(o));
    three.obstacles = obs;
    obs.forEach(o => three.scene.add(o));
  }

  function save3D() {
    if (!three.renderer) return;
    const a = document.createElement('a');
    a.href = three.renderer.domElement.toDataURL('image/png');
    a.download = 'ols_3d.png';
    a.click();
  }

  function clearTerrainObstacles() {
    if (!three.scene) return;
    if (three.terrain) { three.scene.remove(three.terrain); three.terrain.geometry.dispose(); three.terrain.material.dispose(); three.terrain=null; }
    three.obstacles.forEach(o => { three.scene.remove(o); o.geometry.dispose(); o.material.dispose(); });
    three.obstacles=[];
  }

  function bindForm() {
    el('btnGerar')?.addEventListener('click', gerar);
    el('btnSave2D')?.addEventListener('click', save2D);
    el('btnSave3D')?.addEventListener('click', save3D);
    el('btnClearTerrain')?.addEventListener('click', clearTerrainObstacles);
    el('fileTerrain')?.addEventListener('change', (ev)=> onTerrainFile(ev.target.files?.[0]));
    el('fileObstacles')?.addEventListener('change', (ev)=> onObstaclesFile(ev.target.files?.[0]));
  }

  function init() {
    bindForm();
    init3D();
    gerar();
  }

  return { init, load: gerar };
})();
