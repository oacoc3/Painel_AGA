/* public/modules/ols.js
 * OLS 2D + 3D com eixos por cabeceira (RWY xx/yy) e suporte a terreno/obstáculos.
 * Mantém o visual do app: usa apenas <canvas> e uma div (#ols3d) para WebGL.
 */
window.Modules = window.Modules || {};
window.Modules.ols = (() => {
  // ===== Helpers DOM =====
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (id) => document.getElementById(id);
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const toRwyNum = (deg)=>{ let n=Math.round((deg%360)/10); if(n===0) n=36; return String(n).padStart(2,'0'); };

  // ===== Parâmetros (Annex 14 — consolidados/simplificados) =====
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
      slope: 5, // %
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
      catIIIII: { width: {3:120,4:120},             distThr: {3:60,4:60},           len: {3:900,4:900},           slope: {3:2,4:2} }
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

  // ===== Modelo base para UMA cabeceira (local: x para fora, y lateral) =====
  function buildLocalShapes(p) {
    const shapes = {};
    const ihR = DATA.innerHorizontal.radius[p.cat]?.[p.code];
    const ihH = DATA.innerHorizontal.height;
    if (ihR) shapes.ihs = { radius: ihR, height: ihH };
    const conH = DATA.conical.height[p.cat]?.[p.code];
    if (ihR && conH) shapes.cone = { innerRadius: ihR, height: conH, slope: DATA.conical.slope };

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
      let x0 = dist, w0 = innerEdge;
      let x1 = x0 + fLen, w1 = w0 + 2*div*fLen;
      polys.push({ x0, w0, x1, w1, color:'#4a90e2', label:'Approach (1)', slope:fSlope });
      if (sLen>0) {
        const x2 = x1 + sLen, w2 = w1 + 2*div*sLen;
        polys.push({ x0:x1, w0:w1, x1:x2, w1:w2, color:'#2f7bdc', label:'Approach (2)', slope:sSlope });
        x1 = x2; w1 = w2;
      }
      if (hLen>0) polys.push({ x0:x1, w0:w1, x1:x1+hLen, w1:w1, color:'#7fb3f3', label:'Approach (H)', slope:0 });
      shapes.approach = polys;
    }

    const IA = DATA.innerApproach[p.cat];
    if (IA && IA.width[p.code]) {
      let w = IA.width[p.code];
      if (p.letterF && w===120) w = 140;
      shapes.innerApproach = { dist: IA.distThr[p.code], len: IA.len[p.code], width: w, slope: IA.slope[p.code]/100 };
    }

    const blCat = (p.cat==='catIIIII') ? 'catIIIII' : (p.cat==='catI' ? 'catI' : null);
    if (blCat) {
      const innerEdge = DATA.balkedLanding.innerEdge[blCat][p.code];
      if (innerEdge) {
        const distThr = DATA.balkedLanding.distThr[blCat][p.code];
        const div = DATA.balkedLanding.divEach[blCat][p.code] / 100;
        const slope = DATA.balkedLanding.slope[blCat][p.code] / 100;
        const targetLen = ihH / (slope || 0.01);
        const len = Math.min(5000, targetLen);
        shapes.balked = { x0:distThr, w0:innerEdge, x1: distThr+len, w1: innerEdge + 2*div*len, slope, color:'#9013fe' };
      }
    }

    const tSlope = DATA.transitional.slope[p.cat]?.[p.code];
    if (tSlope) {
      const reach = ihH / (tSlope/100);
      shapes.transitional = { width: reach, slope:tSlope/100, color:'#bd10e0' };
    }
    const itSlope = DATA.innerTransitional.slope[p.cat]?.[p.code];
    if (itSlope) shapes.innerTransitional = { slope: itSlope/100, color:'#bd10e0' };

    const TO = DATA.takeoffClimb;
    if (TO.innerEdge[p.code]) {
      const inner = TO.innerEdge[p.code];
      const distEnd = TO.distRwEnd[p.code];
      const div = TO.divEach[p.code]/100;
      const len = TO.len[p.code];
      const slope = TO.slope[p.code]/100;
      const x0 = p.rwLen + distEnd; // em relação ao fim da pista (para frente da cabeceira oposta)
      const x1 = x0 + len;
      const w0 = inner;
      const w1 = inner + 2*div*len;
      shapes.takeoff = { x0, x1, w0, w1, slope, color:'#f5a623' };
    }

    // OHS deixa no nível do aeródromo (parametrizada)
    if (p.ohsR>0 && p.ohsH>0) shapes.ohs = { radius:p.ohsR, height:p.ohsH };

    return shapes;
  }

  // ===== Modelo global (duas cabeceiras) — sistema global alinhado com a pista:
  // THR A em (0,0); THR B em (rwLen,0); X cresce de A->B; Y lateral.
  function buildModel(p) {
    const base = buildLocalShapes(p);

    const model = {
      p,
      // shapes para cada cabeceira, em coordenadas GLOBAIS
      A: {}, B: {},
      // elementos comuns (IHS/OHS) centrados no meio da pista (ARP simplificado)
      common: {},
      extents: { xmin:-200, xmax: p.rwLen + 16000, ymin:-2000, ymax:2000, zmax: 300 }
    };

    // IHS/OHS (centro no meio da pista para melhor simetria)
    if (base.ihs) model.common.ihs = { ...base.ihs, centerX: p.rwLen/2, centerY: 0 };
    if (base.cone) model.common.cone = { ...base.cone, centerX: p.rwLen/2, centerY: 0 };
    if (base.ohs) model.common.ohs = { ...base.ohs, centerX: p.rwLen/2, centerY: 0 };

    // Transicional (faixa ao longo da pista inteira)
    if (base.transitional) model.common.transitional = { ...base.transitional };

    // === Cabeceira A (THR A)
    model.A.runway = { x0:-60, x1:p.rwLen, width:p.rwWid }; // retângulo da pista
    if (base.approach) model.A.approach = base.approach.map(s=>({ ...s })); // já à frente de A
    if (base.innerApproach) model.A.innerApproach = { ...base.innerApproach };
    if (base.balked) model.A.balked = { ...base.balked };
    if (base.takeoff) {
      // a TOC do base foi medida "à frente do fim da pista"; para A isso fica depois do x1
      model.A.takeoff = { ...base.takeoff };
    }
    if (base.innerTransitional) model.A.innerTransitional = { ...base.innerTransitional };

    // === Cabeceira B (THR B)
    // Para B, espelhamos ao longo do ponto x=rwLen (avança para fora no sentido negativo de X)
    model.B.runway = { x0:-60, x1:p.rwLen, width:p.rwWid }; // pista é a mesma
    if (base.approach) {
      model.B.approach = base.approach.map(s=>{
        // mapeia segmento [x0..x1] para [rwLen-x1 .. rwLen-x0]
        return { x0: p.rwLen - s.x1, w0: s.w1, x1: p.rwLen - s.x0, w1: s.w0, color:s.color, label:s.label, slope:s.slope };
      });
    }
    if (base.innerApproach) {
      const ia = base.innerApproach;
      model.B.innerApproach = { dist: (p.rwLen - (ia.dist + ia.len)), len: ia.len, width: ia.width, slope: ia.slope };
      // Perfil usará apenas o comprimento+inclinação; na planta tratamos como trapézio espelhado
      // Para manter consistência na planta:
      model.B.innerApproach._planta = { x0: p.rwLen - (ia.dist + ia.len), w0: ia.width, x1: p.rwLen - ia.dist, w1: ia.width };
    }
    if (base.balked) {
      const b = base.balked;
      model.B.balked = { x0: p.rwLen - b.x1, w0: b.w1, x1: p.rwLen - b.x0, w1: b.w0, slope:b.slope, color:b.color };
    }
    if (base.takeoff) {
      const t = base.takeoff;
      // TOC de B começa "depois do fim" de B -> mapeia t.x0..t.x1 para negativo
      const len = t.x1 - t.x0;
      const x1 = -t.x0; // fim mais distante "antes de A"
      const x0 = x1 - len;
      model.B.takeoff = { x0, x1, w0:t.w0, w1:t.w1, slope:t.slope, color:t.color };
    }
    if (base.innerTransitional) model.B.innerTransitional = { ...base.innerTransitional };

    // Extents automáticos com base nas geometrias (planta)
    function bump(xmin,xmax,yreach){
      model.extents.xmin = Math.min(model.extents.xmin, xmin);
      model.extents.xmax = Math.max(model.extents.xmax, xmax);
      model.extents.ymin = Math.min(model.extents.ymin, -yreach);
      model.extents.ymax = Math.max(model.extents.ymax,  yreach);
    }
    const tReach = base.transitional ? base.transitional.width + p.rwWid/2 : p.rwWid/2;
    bump(-60, p.rwLen, tReach);

    const considerApproach = (arr)=>arr?.forEach(s=>{
      const xmin = Math.min(s.x0, s.x1), xmax = Math.max(s.x0, s.x1);
      const wmax = Math.max(s.w0, s.w1)/2;
      bump(xmin, xmax, Math.max(tReach, wmax));
    });
    considerApproach(model.A.approach);
    considerApproach(model.B.approach);
    if (model.A.innerApproach) bump(model.A.innerApproach.dist, model.A.innerApproach.dist + model.A.innerApproach.len, model.A.innerApproach.width/2);
    if (model.B.innerApproach?._planta) {
      const p0=model.B.innerApproach._planta;
      bump(Math.min(p0.x0,p0.x1), Math.max(p0.x0,p0.x1), p0.w0/2);
    }
    if (model.A.balked) bump(Math.min(model.A.balked.x0,model.A.balked.x1), Math.max(model.A.balked.x0,model.A.balked.x1), Math.max(model.A.balked.w0,model.A.balked.w1)/2);
    if (model.B.balked) bump(Math.min(model.B.balked.x0,model.B.balked.x1), Math.max(model.B.balked.x0,model.B.balked.x1), Math.max(model.B.balked.w0,model.B.balked.w1)/2);
    if (model.A.takeoff) bump(model.A.takeoff.x0, model.A.takeoff.x1, Math.max(model.A.takeoff.w0, model.A.takeoff.w1)/2);
    if (model.B.takeoff) bump(model.B.takeoff.x0, model.B.takeoff.x1, Math.max(model.B.takeoff.w0, model.B.takeoff.w1)/2);

    // IHS/OHS concentricas no meio
    if (model.common.ihs) {
      const R = model.common.ihs.radius;
      bump(p.rwLen/2 - R, p.rwLen/2 + R, R);
    }
    if (model.common.cone) {
      const addR = model.common.cone.height / (DATA.conical.slope/100);
      const R1 = (model.common.ihs?.radius || 0) + addR;
      bump(p.rwLen/2 - R1, p.rwLen/2 + R1, R1);
    }
    if (model.common.ohs) {
      const R = model.common.ohs.radius;
      bump(p.rwLen/2 - R, p.rwLen/2 + R, R);
    }

    // Z max para perfil
    model.extents.zmax = Math.max(300, (model.common.ihs?.height||0) + (model.common.cone?.height||0), (model.common.ohs?.height||0));

    return model;
  }

  // ===== 2D: Planta & Perfil =====
  function clearCanvas(c){ const ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); return ctx; }

  function drawPlan(canvas, model, drawA=true, drawB=true, rwyLabels={A:'RWY A', B:'RWY B'}) {
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
    for (let x=Math.ceil(model.extents.xmin/1000)*1000; x<=model.extents.xmax; x+=1000){
      const [a,b]=toPx([x,model.extents.ymin]), [c,d]=toPx([x,model.extents.ymax]);
      ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke();
    }
    for (let y=Math.ceil(model.extents.ymin/500)*500; y<=model.extents.ymax; y+=500){
      const [a,b]=toPx([model.extents.xmin,y]), [c,d]=toPx([model.extents.xmax,y]);
      ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke();
    }

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

    // Transicional — faixas laterais ao longo da pista
    if (model.common.transitional){ ctx.strokeStyle='#bd10e0'; ctx.lineWidth=2; const reach=model.common.transitional.width;
      // direita
      let p0=toPx([-60, model.p.rwWid/2]), p1=toPx([model.p.rwLen, model.p.rwWid/2]), p2=toPx([model.p.rwLen, model.p.rwWid/2+reach]), p3=toPx([-60, model.p.rwWid/2+reach]);
      ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.globalAlpha=.2; ctx.fillStyle='#bd10e0'; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
      // esquerda
      p0=toPx([-60, -model.p.rwWid/2]); p1=toPx([model.p.rwLen, -model.p.rwWid/2]); p2=toPx([model.p.rwLen, -model.p.rwWid/2-reach]); p3=toPx([-60, -model.p.rwWid/2-reach]);
      ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.globalAlpha=.2; ctx.fillStyle='#bd10e0'; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    }

    // IHS
    if (model.common.ihs){ ctx.strokeStyle='#7ed321'; ctx.lineWidth=2; const [cx,cy]=toPx([model.common.ihs.centerX, model.common.ihs.centerY]); const r=model.common.ihs.radius*s; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); }
    // Conical (anel externo)
    if (model.common.ihs && model.common.cone){ ctx.strokeStyle='#b8e986'; ctx.lineWidth=2; ctx.setLineDash([6,6]); const [cx,cy]=toPx([model.common.ihs.centerX, model.common.ihs.centerY]); const addR=(model.common.cone.height)/(DATA.conical.slope/100); const r=(model.common.ihs.radius+addR)*s; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }
    // OHS
    if (model.common.ohs){ ctx.strokeStyle='#9b9b9b'; ctx.lineWidth=1.5; ctx.setLineDash([3,5]); const [cx,cy]=toPx([model.common.ohs.centerX, model.common.ohs.centerY]); const r=model.common.ohs.radius*s; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }

    // Aproximação/Inner/TOC/BL para A
    if (drawA) {
      model.A.approach?.forEach(sec => drawTrapezoid(sec.x0, sec.w0, sec.x1, sec.w1, sec.color||'#4a90e2'));
      if (model.A.innerApproach){ const ia=model.A.innerApproach; drawTrapezoid(ia.dist, ia.width, ia.dist+ia.len, ia.width, '#50e3c2'); }
      if (model.A.balked){ const b=model.A.balked; drawTrapezoid(b.x0, b.w0, b.x1, b.w1, b.color); }
      if (model.A.takeoff){ const t=model.A.takeoff; drawTrapezoid(t.x0,t.w0,t.x1,t.w1,t.color); }
    }

    // Aproximação/Inner/TOC/BL para B
    if (drawB) {
      model.B.approach?.forEach(sec => drawTrapezoid(sec.x0, sec.w0, sec.x1, sec.w1, sec.color||'#4a90e2'));
      if (model.B.innerApproach?._planta){ const ia=model.B.innerApproach._planta; drawTrapezoid(ia.x0, ia.w0, ia.x1, ia.w1, '#50e3c2'); }
      if (model.B.balked){ const b=model.B.balked; drawTrapezoid(b.x0, b.w0, b.x1, b.w1, b.color); }
      if (model.B.takeoff){ const t=model.B.takeoff; drawTrapezoid(t.x0,t.w0,t.x1,t.w1,t.color); }
    }

    // Marcadores de eixos nas cabeceiras
    function drawAxisMarker(atX, atY, label) {
      const [oX,oY] = toPx([atX, atY]);
      ctx.strokeStyle='#000'; ctx.lineWidth=1.5;
      // eixo X para fora (pequena seta)
      ctx.beginPath(); ctx.moveTo(oX, oY); ctx.lineTo(oX+40, oY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(oX+40, oY); ctx.lineTo(oX+34, oY-4); ctx.lineTo(oX+34, oY+4); ctx.closePath(); ctx.fillStyle='#000'; ctx.fill();
      // eixo Y lateral
      ctx.beginPath(); ctx.moveTo(oX, oY); ctx.lineTo(oX, oY-40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(oX, oY-40); ctx.lineTo(oX-4, oY-34); ctx.lineTo(oX+4, oY-34); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#000'; ctx.font='12px sans-serif';
      ctx.fillText(`${label} (X→, Y↑)`, oX+46, oY-6);
    }
    drawAxisMarker(0, 0, rwyLabels.A);
    drawAxisMarker(model.p.rwLen, 0, rwyLabels.B);

    // Escala e origem global
    ctx.fillStyle='#000'; ctx.font='12px sans-serif';
    const km=1000*s; ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(40, H-30); ctx.lineTo(40+km, H-30); ctx.stroke(); ctx.fillText('1 km', 40+km/2-14, H-35);
  }

  function drawProfile(canvas, model, drawA=true, drawB=true) {
    const ctx = clearCanvas(canvas);
    const W=canvas.width, H=canvas.height, margin=40;
    const Xmax=16000;
    const Zmax = model.extents.zmax;
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
    ctx.fillText('Distância (m) a partir do limiar', W/2-80, H-10);
    ctx.save(); ctx.translate(14,H/2); ctx.rotate(-Math.PI/2); ctx.fillText('Altura acima do limiar (m)', 0, 0); ctx.restore();

    // IHS / Conical / OHS (alturas)
    if (model.common.ihs){ ctx.strokeStyle='#7ed321'; ctx.setLineDash([6,4]); ctx.beginPath(); ctx.moveTo(...toPx(0,model.common.ihs.height)); ctx.lineTo(...toPx(Xmax,model.common.ihs.height)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle='#7ed321'; ctx.fillText('IHS 45 m', ...toPx(20,model.common.ihs.height+3)); }
    if (model.common.cone){ const z1=model.common.ihs.height + model.common.cone.height; ctx.strokeStyle='#b8e986'; ctx.beginPath(); ctx.moveTo(...toPx(0,model.common.ihs.height)); ctx.lineTo(...toPx(0,z1)); ctx.stroke(); ctx.fillStyle='#b8e986'; ctx.fillText(`Cônica +${model.common.cone.height} m`, ...toPx(10, z1-2)); }
    if (model.common.ohs){ ctx.strokeStyle='#9b9b9b'; ctx.setLineDash([6,6]); ctx.beginPath(); ctx.moveTo(...toPx(0,model.common.ohs.height)); ctx.lineTo(...toPx(Xmax,model.common.ohs.height)); ctx.stroke(); ctx.setLineDash([]); }

    // Perfil — Cabeceira A
    if (drawA) {
      let z=0;
      if (model.A.approach){ for (const sec of model.A.approach){ const len=sec.x1-sec.x0, z1=z + (sec.slope||0)*len; ctx.strokeStyle='#4a90e2'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(sec.x0, z)); ctx.lineTo(...toPx(sec.x1, z1)); ctx.stroke(); z=z1; } }
      if (model.A.innerApproach){ const ia=model.A.innerApproach; const z0=ia.slope*ia.len; ctx.strokeStyle='#50e3c2'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(ia.dist,0)); ctx.lineTo(...toPx(ia.dist+ia.len,z0)); ctx.stroke(); }
      if (model.A.balked){ const b=model.A.balked; const z1=b.slope*(b.x1-b.x0); ctx.strokeStyle='#9013fe'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(b.x0,0)); ctx.lineTo(...toPx(b.x1,z1)); ctx.stroke(); }
      if (model.A.takeoff){ const t=model.A.takeoff; const z1=t.slope*(t.x1-t.x0); ctx.strokeStyle='#f5a623'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(t.x0,0)); ctx.lineTo(...toPx(t.x1,z1)); ctx.stroke(); }
      // Transicional (indicativo)
      if (model.common.transitional){ const ts=model.common.transitional; ctx.strokeStyle='#bd10e0'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(ts.width, model.common.ihs?.height||45)); ctx.stroke(); }
      if (model.A.innerTransitional){ const it=model.A.innerTransitional; const w=(model.common.ihs?.height||45)/it.slope; ctx.strokeStyle='#bd10e0'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(w, model.common.ihs?.height||45)); ctx.stroke(); ctx.setLineDash([]); }
    }

    // Perfil — Cabeceira B (espelha distância para começar em 0)
    if (drawB) {
      let z=0;
      if (model.B.approach){ for (const sec of model.B.approach){ const len=Math.abs(sec.x1-sec.x0); const z1=z + (sec.slope||0)*len; // perfil vs distância local
        // desenha a partir de 0
        ctx.strokeStyle='#2f7bdc'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(0, z)); ctx.lineTo(...toPx(len, z1)); ctx.stroke(); z=z1;
      } }
      if (model.B.innerApproach){ const ia=model.B.innerApproach; const z0=ia.slope*ia.len; ctx.strokeStyle='#33c9a8'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(ia.len, z0)); ctx.stroke(); }
      if (model.B.balked){ const b=model.B.balked; const len=Math.abs(b.x1-b.x0), z1=b.slope*len; ctx.strokeStyle='#7a00ff'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(len,z1)); ctx.stroke(); }
      if (model.B.takeoff){ const t=model.B.takeoff; const len=Math.abs(t.x1-t.x0), z1=t.slope*len; ctx.strokeStyle='#e09421'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(len,z1)); ctx.stroke(); }
      if (model.common.transitional){ const ts=model.common.transitional; ctx.strokeStyle='#a36bd6'; ctx.setLineDash([4,2]); ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(ts.width, model.common.ihs?.height||45)); ctx.stroke(); ctx.setLineDash([]); }
      if (model.B.innerTransitional){ const it=model.B.innerTransitional; const w=(model.common.ihs?.height||45)/it.slope; ctx.strokeStyle='#a36bd6'; ctx.setLineDash([2,4]); ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(w, model.common.ihs?.height||45)); ctx.stroke(); ctx.setLineDash([]); }
    }
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
    box.innerHTML = '';

    const width = box.clientWidth;
    const height = box.clientHeight || Math.round(width * 9/16);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(55, width/height, 1, 200000);
    camera.position.set(-800, 800, 1200);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    box.appendChild(renderer.domElement);

    const amb = new THREE.AmbientLight(0xffffff, 0.8); scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(1000,1000,2000); scene.add(dir);

    const grid = new THREE.GridHelper(8000, 80, 0xdddddd, 0xeeeeee);
    grid.position.set(0, 0, 0);
    scene.add(grid);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(1000, 0, 0);
    controls.update();

    three = { scene, camera, controls, renderer, meshes:[], terrain:null, obstacles:[] };

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
    three.meshes.forEach(m => { three.scene.remove(m); m.geometry?.dispose?.(); if (m.material) {
      if (Array.isArray(m.material)) m.material.forEach(mm=>mm.dispose?.()); else m.material.dispose?.();
    }});
    three.meshes = [];
    if (three.terrain) { three.scene.remove(three.terrain); three.terrain.geometry?.dispose?.(); three.terrain.material?.dispose?.(); three.terrain=null; }
    three.obstacles.forEach(o => { three.scene.remove(o); o.geometry?.dispose?.(); o.material?.dispose?.(); });
    three.obstacles = [];
  }

  function addMesh(mesh){ three.scene.add(mesh); three.meshes.push(mesh); }

  function trapezoidGeometry(x0, w0, x1, w1, thickness=0.5) {
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
    const push = (a,b,c)=>{ positions.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z); };

    // topo
    push(vertsTop[0], vertsTop[1], vertsTop[2]); push(vertsTop[0], vertsTop[2], vertsTop[3]);
    // fundo
    push(vertsBot[2], vertsBot[1], vertsBot[0]); push(vertsBot[3], vertsBot[2], vertsBot[0]);
    // laterais
    for (let i=0;i<4;i++){
      const j=(i+1)%4;
      push(vertsTop[i], vertsTop[j], vertsBot[j]);
      push(vertsTop[i], vertsBot[j], vertsBot[i]);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions),3));
    geom.computeVertexNormals();
    return geom;
  }
  function rectGeometry(x, y0, len, width, thickness=0.5) {
    return trapezoidGeometry(x, width, x+len, width, thickness).translate(0,0,y0 + width/2);
  }
  function ringGeometry(r0, r1, seg=64, thickness=0.5) {
    const geom = new THREE.BufferGeometry(); const positions = [];
    const push = (a,b,c)=>{ positions.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z); };
    for (let i=0;i<seg;i++){
      const a0=(i/seg)*Math.PI*2, a1=((i+1)/seg)*Math.PI*2;
      const c0=Math.cos(a0), s0=Math.sin(a0), c1=Math.cos(a1), s1=Math.sin(a1);
      const p00=new THREE.Vector3(r0*c0, thickness/2, r0*s0), p01=new THREE.Vector3(r1*c0, thickness/2, r1*s0);
      const p10=new THREE.Vector3(r0*c1, thickness/2, r0*s1), p11=new THREE.Vector3(r1*c1, thickness/2, r1*s1);
      const q00=p00.clone().setY(-thickness/2), q01=p01.clone().setY(-thickness/2), q10=p10.clone().setY(-thickness/2), q11=p11.clone().setY(-thickness/2);
      // topo/fundo/laterais
      push(p01,p11,p10); push(p01,p10,p00); push(q10,q11,q01); push(q00,q10,q01); push(p00,p10,q10); push(p00,q10,q00); push(p11,p01,q01); push(p11,q01,q11);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions),3));
    geom.computeVertexNormals();
    return geom;
  }

  function build3D(model, drawA=true, drawB=true) {
    clear3DWorld();
    if (!three.scene) init3D();

    const col = {
      runway: 0x000000,
      approach1: 0x4a90e2,
      approach2: 0x2f7bdc,
      approachH: 0x7fb3f3,
      innerAppA: 0x50e3c2,
      innerAppB: 0x33c9a8,
      trans: 0xbd10e0,
      takeoffA: 0xf5a623,
      takeoffB: 0xe09421,
      balkedA: 0x9013fe,
      balkedB: 0x7a00ff,
      ihs: 0x7ed321,
      cone: 0xb8e986,
      ohs: 0x9b9b9b,
      terrain: 0x888888,
      obstacle: 0xd0021b
    };

    // Pista (box fino)
    const rw = new THREE.Mesh(new THREE.BoxGeometry(model.p.rwLen+60, 2, model.p.rwWid), new THREE.MeshBasicMaterial({ color: col.runway }));
    rw.position.set(model.p.rwLen/2 - 30, 1, 0);
    addMesh(rw);

    // Transicional (faixas laterais)
    if (model.common.transitional) {
      const reach = model.common.transitional.width;
      const left = rectGeometry(-60, -model.p.rwWid/2 - reach, model.p.rwLen+60, reach, 0.3);
      const right= rectGeometry(-60,  model.p.rwWid/2,       model.p.rwLen+60, reach, 0.3);
      const m = new THREE.MeshBasicMaterial({ color: col.trans, transparent:true, opacity:0.25, side:THREE.DoubleSide });
      addMesh(new THREE.Mesh(left, m)); addMesh(new THREE.Mesh(right,m.clone()));
    }

    // IHS/OHS anéis no meio
    if (model.common.ihs) {
      const ring = ringGeometry(0, model.common.ihs.radius, 128, 0.5);
      const mat = new THREE.MeshBasicMaterial({ color: col.ihs, transparent:true, opacity:0.35, side:THREE.DoubleSide });
      const mesh = new THREE.Mesh(ring, mat); mesh.position.set(model.p.rwLen/2, model.common.ihs.height, 0);
      addMesh(mesh);
    }
    if (model.common.cone && model.common.ihs) {
      const innerR = model.common.ihs.radius;
      const addR = model.common.cone.height / (DATA.conical.slope/100);
      const outerR = innerR + addR;
      const h = model.common.cone.height;
      const geo = new THREE.CylinderGeometry(outerR, innerR, h, 128, 1, true);
      const mat = new THREE.MeshBasicMaterial({ color: col.cone, wireframe:false, transparent:true, opacity:0.2, side:THREE.DoubleSide });
      const cone = new THREE.Mesh(geo, mat);
      cone.position.set(model.p.rwLen/2, model.common.ihs.height + h/2, 0);
      addMesh(cone);
    }
    if (model.common.ohs) {
      const ring = ringGeometry(0, model.common.ohs.radius, 128, 0.5);
      const mat = new THREE.MeshBasicMaterial({ color: col.ohs, transparent:true, opacity:0.25, side:THREE.DoubleSide });
      const mesh = new THREE.Mesh(ring, mat); mesh.position.set(model.p.rwLen/2, model.common.ohs.height, 0);
      addMesh(mesh);
    }

    // A — Approach / Inner / TOC / BL
    if (drawA) {
      model.A.approach?.forEach((sec, idx)=>{
        const g = trapezoidGeometry(sec.x0, sec.w0, sec.x1, sec.w1, 0.5);
        const mat = new THREE.MeshBasicMaterial({ color: (sec.slope===0?col.approachH:(idx===0?col.approach1:col.approach2)), transparent:true, opacity:0.5, side:THREE.DoubleSide });
        addMesh(new THREE.Mesh(g, mat));
      });
      if (model.A.innerApproach) {
        const ia = model.A.innerApproach;
        const g = trapezoidGeometry(ia.dist, ia.width, ia.dist+ia.len, ia.width, 0.5);
        addMesh(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col.innerAppA, transparent:true, opacity:0.5, side:THREE.DoubleSide })));
      }
      if (model.A.takeoff) {
        const t = model.A.takeoff;
        const g = trapezoidGeometry(t.x0, t.w0, t.x1, t.w1, 0.5);
        addMesh(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col.takeoffA, transparent:true, opacity:0.5, side:THREE.DoubleSide })));
      }
      if (model.A.balked) {
        const b = model.A.balked;
        const g = trapezoidGeometry(b.x0, b.w0, b.x1, b.w1, 0.5);
        addMesh(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col.balkedA, transparent:true, opacity:0.5, side:THREE.DoubleSide })));
      }
    }

    // B — espelhado
    if (drawB) {
      model.B.approach?.forEach((sec, idx)=>{
        const g = trapezoidGeometry(sec.x0, sec.w0, sec.x1, sec.w1, 0.5);
        const mat = new THREE.MeshBasicMaterial({ color: (sec.slope===0?col.approachH:(idx===0?col.approach1:col.approach2)), transparent:true, opacity:0.5, side:THREE.DoubleSide });
        addMesh(new THREE.Mesh(g, mat));
      });
      if (model.B.innerApproach?._planta) {
        const ia = model.B.innerApproach._planta;
        const g = trapezoidGeometry(ia.x0, ia.w0, ia.x1, ia.w1, 0.5);
        addMesh(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col.innerAppB, transparent:true, opacity:0.5, side:THREE.DoubleSide })));
      }
      if (model.B.takeoff) {
        const t = model.B.takeoff;
        const g = trapezoidGeometry(t.x0, t.w0, t.x1, t.w1, 0.5);
        addMesh(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col.takeoffB, transparent:true, opacity:0.5, side:THREE.DoubleSide })));
      }
      if (model.B.balked) {
        const b = model.B.balked;
        const g = trapezoidGeometry(b.x0, b.w0, b.x1, b.w1, 0.5);
        addMesh(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col.balkedB, transparent:true, opacity:0.5, side:THREE.DoubleSide })));
      }
    }
  }

  // ===== Terreno e Obstáculos =====
  async function readTextFile(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsText(file); }); }

  function loadTerrainCSV(text) {
    // primeira linha: "# cell=50 originX=-500 originY=-500"
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

    const geometry = new THREE.PlaneGeometry(meta.cell*(nx-1), meta.cell*(ny-1), nx-1, ny-1);
    geometry.rotateX(-Math.PI/2);
    geometry.translate(meta.originX + meta.cell*(nx-1)/2, 0, meta.originY + meta.cell*(ny-1)/2);

    const pos = geometry.attributes.position;
    for (let j=0;j<ny;j++){
      for (let i=0;i<nx;i++){
        const idx = j*nx + i;
        const z = grid[j][i]; // altura (m) acima do limiar A
        pos.setY(idx, z);
      }
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide, wireframe:false, transparent:true, opacity:0.6 });
    return new THREE.Mesh(geometry, material);
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
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, Math.max(1,h), 12), new THREE.MeshBasicMaterial({ color: 0xd0021b }));
      cyl.position.set(x, h/2, y);
      cyl.userData = { name, height: h };
      list.push(cyl);
    }
    return list;
  }

  // ===== UI & Integração =====
  function readForm() {
    const cat = el('categoria').value;
    const code = parseInt(el('codeNumber').value, 10);
    const letterF = el('codeLetterF').checked;
    const thrElev = getNumber(el('thrElev').value, 0);
    const rwLen = getNumber(el('rwLen').value, 3000);
    const rwWid = getNumber(el('rwWid').value, 45);
    const rwHeading = getNumber(el('rwHeading').value, 90);
    const drawA = !!el('drawA')?.checked;
    const drawB = !!el('drawB')?.checked;
    const ohsR = getNumber(el('ohsRadius').value, 15000);
    const ohsH = getNumber(el('ohsHeight').value, 150);
    return { cat, code, letterF, thrElev, rwLen, rwWid, rwHeading, drawA, drawB, ohsR, ohsH };
  }

  function setRwyLabels(headingDeg) {
    const h = ((headingDeg%360)+360)%360;
    const rwyA = toRwyNum(h);
    const rwyB = toRwyNum(h+180);
    el('rwyLabelA').textContent = `RWY ${rwyA}`;
    el('rwyLabelB').textContent = `RWY ${rwyB}`;
  }

  async function gerar() {
    const p = readForm();
    const msg = el('msg'); msg.textContent = '';
    if (p.cat==='catIIIII' && (p.code===1 || p.code===2)) {
      msg.textContent = 'CAT II/III só se aplica a code number 3 ou 4.';
    }
    setRwyLabels(p.rwHeading);

    const model = buildModel(p);
    const rwyLabels = { A: el('rwyLabelA').textContent, B: el('rwyLabelB').textContent };
    drawPlan(el('planCanvas'), model, p.drawA, p.drawB, rwyLabels);
    drawProfile(el('profileCanvas'), model, p.drawA, p.drawB);
    build3D(model, p.drawA, p.drawB);
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
    el('rwHeading')?.addEventListener('input', () => setRwyLabels(getNumber(el('rwHeading').value, 90)));
  }

  function init() {
    bindForm();
    init3D();
    setRwyLabels(getNumber(el('rwHeading')?.value, 90));
    gerar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, load: gerar };
})();
