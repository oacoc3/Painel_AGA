/* public/modules/ols.js
 * OLS com eixos por cabeceira (RWY xx/yy) + 2D/3D e terreno/obstáculos.
 * Corrige: Approach antes do THR e TOC após o fim, para cada cabeceira.
 */
(() => {
  const $ = (s, r=document)=>r.querySelector(s);
  const el = (id)=>document.getElementById(id);
  const toRwyNum = (deg)=>{ let n=Math.round(((deg%360)+360)%360/10); if(n===0) n=36; return String(n).padStart(2,'0'); };
  const num = (v,d=0)=>{ const x=Number(v); return Number.isFinite(x)?x:d; };

  // === Tabela simplificada (valores consolidados) ===
  const DATA = {
    innerHorizontal: { height:45, radius:{
      nonInstrument:{1:2000,2:2500,3:4000,4:4000},
      nonPrecision: {1:3500,2:3500,3:4000,4:4000},
      catI:         {1:3500,2:3500,3:4000,4:4000},
      catIIIII:     {3:4000,4:4000}
    }},
    conical: { slope:5, height:{
      nonInstrument:{1:35,2:55,3:75,4:100},
      nonPrecision: {1:60,2:60,3:75,4:100},
      catI:         {1:60,2:60,3:100,4:100},
      catIIIII:     {3:100,4:100}
    }},
    approach:{
      nonInstrument:{ innerEdge:{1:60,2:80,3:150,4:150}, distThr:{1:30,2:60,3:60,4:60}, divEach:{1:10,2:10,3:10,4:10},
        first:{len:{1:1600,2:2500,3:3000,4:3000}, slope:{1:5,2:4,3:3.33,4:2.5}}, second:{len:{1:0,2:0,3:0,4:0}, slope:{1:0,2:0,3:0,4:0}}, horiz:{len:{1:0,2:0,3:0,4:0}}
      },
      nonPrecision:{ innerEdge:{1:140,2:140,3:280,4:280}, distThr:{1:60,2:60,3:60,4:60}, divEach:{1:15,2:15,3:15,4:15},
        first:{len:{1:2500,2:3000,3:3000,4:3000}, slope:{1:3.33,2:2,3:2,4:2}}, second:{len:{1:3600,2:3600,3:3600,4:3600}, slope:{1:2.5,2:2.5,3:2.5,4:2.5}}, horiz:{len:{1:8400,2:8400,3:8400,4:8400}}
      },
      catI:{ innerEdge:{1:140,2:140,3:280,4:280}, distThr:{1:60,2:60,3:60,4:60}, divEach:{1:15,2:15,3:15,4:15},
        first:{len:{1:3000,2:3000,3:3000,4:3000}, slope:{1:2.5,2:2.5,3:2,4:2}}, second:{len:{1:12000,2:12000,3:3600,4:3600}, slope:{1:3,2:3,3:2.5,4:2.5}}, horiz:{len:{1:8400,2:8400,3:8400,4:8400}}
      },
      catIIIII:{ innerEdge:{3:280,4:280}, distThr:{3:60,4:60}, divEach:{3:15,4:15},
        first:{len:{3:3000,4:3000}, slope:{3:2,4:2}}, second:{len:{3:3600,4:3600}, slope:{3:2.5,4:2.5}}, horiz:{len:{3:8400,4:8400}}
      }
    },
    innerApproach:{
      catI:     { width:{1:90,2:90,3:120,4:120}, distThr:{1:60,2:60,3:60,4:60}, len:{1:900,2:900,3:900,4:900}, slope:{1:2.5,2:2.5,3:2,4:2} },
      catIIIII: { width:{3:120,4:120},           distThr:{3:60,4:60},           len:{3:900,4:900},           slope:{3:2,4:2} }
    },
    transitional:{ slope:{ nonInstrument:{1:20,2:20,3:14.3,4:14.3}, nonPrecision:{1:20,2:14.3,3:14.3,4:14.3}, catI:{1:14.3,2:14.3,3:14.3,4:14.3}, catIIIII:{3:14.3,4:14.3} } },
    innerTransitional:{ slope:{ catI:{1:40,2:40,3:33.3,4:33.3}, catIIIII:{3:33.3,4:33.3} } },
    balkedLanding:{
      innerEdge:{ catI:{1:90,2:90,3:120,4:120}, catIIIII:{3:120,4:120} },
      distThr:  { catI:{1:1800,2:1800,3:1800,4:1800}, catIIIII:{3:1800,4:1800} },
      divEach:  { catI:{1:10,2:10,3:10,4:10}, catIIIII:{3:10,4:10} },
      slope:    { catI:{1:4,2:3.33,3:3.33,4:3.33}, catIIIII:{3:3.33,4:3.33} }
    },
    takeoffClimb:{
      innerEdge:{1:60,2:80,3:180,4:180},
      distRwEnd:{1:30,2:60,3:60,4:60},
      divEach:  {1:10,2:10,3:12.5,4:12.5},
      finalWidth:{1:380,2:580,3:1200,4:1200},
      len:      {1:1600,2:2500,3:15000,4:15000},
      slope:    {1:5,2:4,3:2,4:2}
    }
  };

  // --- helpers de geometria 2D (planta/perfil) ---
  function clearCanvas(c){ const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); return ctx; }

  // --- modelo de UMA cabeceira em local (x para fora, y lateral) ---
  function buildLocal(p){
    const shapes={};
    const ihR = DATA.innerHorizontal.radius[p.cat]?.[p.code];
    if (ihR) shapes.ihs = { radius: ihR, height: DATA.innerHorizontal.height };
    const conH = DATA.conical.height[p.cat]?.[p.code];
    if (ihR && conH) shapes.cone = { innerRadius: ihR, height: conH, slope: DATA.conical.slope };

    const A = DATA.approach[p.cat];
    if (A && A.innerEdge[p.code]){
      const inner=A.innerEdge[p.code], dist=A.distThr[p.code], div=A.divEach[p.code]/100;
      const s1=A.first.len[p.code],  m1=A.first.slope[p.code]/100;
      const s2=A.second.len[p.code]||0, m2=(A.second.slope?.[p.code]||0)/100;
      const sh=A.horiz.len[p.code]||0;

      // guardo valores base; o sentido (A/B) será aplicado ao projetar no global
      shapes.approach = { inner, dist, div, sections:[
        {len:s1, slope:m1, color:'#4a90e2'},
        ...(s2? [{len:s2, slope:m2, color:'#2f7bdc'}] : []),
        ...(sh? [{len:sh, slope:0,  color:'#7fb3f3'}] : []),
      ]};
    }

    const IA = DATA.innerApproach[p.cat];
    if (IA && IA.width[p.code]){
      let w=IA.width[p.code]; if(p.letterF && w===120) w=140;
      shapes.innerApproach = { width:w, dist:IA.distThr[p.code], len:IA.len[p.code], slope:IA.slope[p.code]/100 };
    }

    const blCat = (p.cat==='catIIIII')?'catIIIII':(p.cat==='catI'?'catI':null);
    if (blCat){
      const inner=DATA.balkedLanding.innerEdge[blCat][p.code];
      if(inner){
        const dist=DATA.balkedLanding.distThr[blCat][p.code],
              div =DATA.balkedLanding.divEach[blCat][p.code]/100,
              slope=DATA.balkedLanding.slope[blCat][p.code]/100;
        const len = Math.min(5000, (DATA.innerHorizontal.height)/(slope||0.01));
        shapes.balked = { inner, dist, div, len, slope, color:'#9013fe' };
      }
    }

    const tSlope = DATA.transitional.slope[p.cat]?.[p.code];
    if (tSlope) shapes.transitional = { width: DATA.innerHorizontal.height/(tSlope/100), slope:tSlope/100, color:'#bd10e0' };

    const itSlope = DATA.innerTransitional.slope[p.cat]?.[p.code];
    if (itSlope) shapes.innerTransitional = { slope: itSlope/100, color:'#bd10e0' };

    const TO = DATA.takeoffClimb;
    if (TO.innerEdge[p.code]){
      shapes.takeoff = {
        inner: TO.innerEdge[p.code],
        distEnd: TO.distRwEnd[p.code],
        div: TO.divEach[p.code]/100,
        len: TO.len[p.code],
        slope: TO.slope[p.code]/100,
        color:'#f5a623'
      };
    }
    return shapes;
  }

  // --- modelo global (duas cabeceiras), X: A→B, THR A=0, THR B=rwLen ---
  function buildModel(p){
    const base = buildLocal(p);
    const model = { p, A:{}, B:{}, common:{}, extents:{xmin:-16000, xmax:p.rwLen+16000, ymin:-2000, ymax:2000, zmax:300} };

    // comuns (centro no meio da pista)
    if (base.ihs) model.common.ihs = { ...base.ihs, cx:p.rwLen/2, cy:0 };
    if (base.cone) model.common.cone = { ...base.cone, cx:p.rwLen/2, cy:0 };
    if (p.ohsR>0 && p.ohsH>0) model.common.ohs = { radius:p.ohsR, height:p.ohsH, cx:p.rwLen/2, cy:0 };
    if (base.transitional) model.common.transitional = { ...base.transitional };

    // pista (faixa única)
    model.A.runway = { x0:-60, x1:p.rwLen, width:p.rwWid };

    // ---------- Cabeceira A ----------
    // Approach A: para "antes" do limiar A => lado negativo
    if (base.approach){
      const arr=[]; let nearX = -base.approach.dist; let nearW = base.approach.inner;
      for (const sec of base.approach.sections){
        const farX = nearX - sec.len;           // vai para -X
        const farW = nearW + 2*base.approach.div*sec.len;
        arr.push({ x0:farX, w0:farW, x1:nearX, w1:nearW, slope:sec.slope, color:sec.color });
        nearX = farX; nearW = farW;
      }
      model.A.approach = arr;
    }
    // Inner approach A (antes do limiar)
    if (base.innerApproach){
      const ia=base.innerApproach;
      model.A.innerApproach = { x0:-(ia.dist+ia.len), w0:ia.width, x1:-ia.dist, w1:ia.width, slope:ia.slope };
    }
    // Balked landing A (após o THR A, direção +X)
    if (base.balked){
      const b=base.balked, nearX=b.dist, farX=b.dist + b.len, nearW=b.inner, farW=b.inner + 2*b.div*b.len;
      model.A.balked = { x0:nearX, w0:nearW, x1:farX, w1:farW, slope:b.slope, color:b.color };
    }
    // Take-off A (após o fim da pista A => +X a partir de rwLen)
    if (base.takeoff){
      const t=base.takeoff, x0=p.rwLen + t.distEnd, x1=x0 + t.len, w0=t.inner, w1=t.inner + 2*t.div*t.len;
      model.A.takeoff = { x0, w0, x1, w1, slope:t.slope, color:t.color };
    }
    if (base.innerTransitional) model.A.innerTransitional = { ...base.innerTransitional };

    // ---------- Cabeceira B ----------
    // Approach B: para "antes" do limiar B => lado positivo ( > rwLen )
    if (base.approach){
      const arr=[]; let nearX = p.rwLen + base.approach.dist; let nearW = base.approach.inner;
      for (const sec of base.approach.sections){
        const farX = nearX + sec.len;           // vai para +X
        const farW = nearW + 2*base.approach.div*sec.len;
        arr.push({ x0:nearX, w0:nearW, x1:farX, w1:farW, slope:sec.slope, color:sec.color });
        nearX = farX; nearW = farW;
      }
      model.B.approach = arr;
    }
    // Inner approach B (antes do limiar B => +X)
    if (base.innerApproach){
      const ia=base.innerApproach;
      model.B.innerApproach = { x0:p.rwLen + ia.dist, w0:ia.width, x1:p.rwLen + ia.dist + ia.len, w1:ia.width, slope:ia.slope };
    }
    // Balked landing B (após THR B, direção -X)
    if (base.balked){
      const b=base.balked;
      const nearX = p.rwLen - b.dist, farX = nearX - b.len;
      const nearW = b.inner, farW = b.inner + 2*b.div*b.len;
      // reordeno para x0<x1 na planta
      model.B.balked = { x0:farX, w0:farW, x1:nearX, w1:nearW, slope:b.slope, color:'#7a00ff' };
    }
    // Take-off B (após o fim de B => -X a partir de 0)
    if (base.takeoff){
      const t=base.takeoff;
      const nearX = -t.distEnd, farX = nearX - t.len; // distâncias negativas
      model.B.takeoff = { x0:farX, w0:t.inner + 2*t.div*t.len, x1:nearX, w1:t.inner, slope:t.slope, color:'#e09421' };
    }
    if (base.innerTransitional) model.B.innerTransitional = { ...base.innerTransitional };

    // extents automáticos (planta)
    const bump = (xmin,xmax,yreach)=>{
      model.extents.xmin=Math.min(model.extents.xmin,xmin);
      model.extents.xmax=Math.max(model.extents.xmax,xmax);
      model.extents.ymin=Math.min(model.extents.ymin,-yreach);
      model.extents.ymax=Math.max(model.extents.ymax, yreach);
    };
    const tR = (model.common.transitional? model.common.transitional.width + p.rwWid/2 : p.rwWid/2);
    bump(-60, p.rwLen, tR);
    const consider = (arr)=>arr?.forEach(s=>bump(Math.min(s.x0,s.x1), Math.max(s.x0,s.x1), Math.max(s.w0,s.w1)/2));
    consider(model.A.approach); consider(model.B.approach);
    ['innerApproach','balked','takeoff'].forEach(k=>{
      if(model.A[k]) bump(Math.min(model.A[k].x0,model.A[k].x1), Math.max(model.A[k].x0,model.A[k].x1), Math.max(model.A[k].w0,model.A[k].w1)/2);
      if(model.B[k]) bump(Math.min(model.B[k].x0,model.B[k].x1), Math.max(model.B[k].x0,model.B[k].x1), Math.max(model.B[k].w0,model.B[k].w1)/2);
    });
    if (model.common.ihs){ const R=model.common.ihs.radius; bump(p.rwLen/2-R, p.rwLen/2+R, R); }
    if (model.common.cone && model.common.ihs){ const add=model.common.cone.height/(DATA.conical.slope/100); const R=(model.common.ihs.radius+add); bump(p.rwLen/2-R, p.rwLen/2+R, R); }
    if (model.common.ohs){ const R=model.common.ohs.radius; bump(p.rwLen/2-R, p.rwLen/2+R, R); }
    model.extents.zmax = Math.max(300,(model.common.ihs?.height||0)+(model.common.cone?.height||0),(model.common.ohs?.height||0));
    return model;
  }

  // --- desenho 2D (planta) ---
  function drawPlan(canvas, model, drawA=true, drawB=true, rwyLabels={A:'RWY A',B:'RWY B'}){
    const ctx=clearCanvas(canvas);
    const W=canvas.width,H=canvas.height,margin=40;
    const Xspan=model.extents.xmax-model.extents.xmin, Yspan=model.extents.ymax-model.extents.ymin;
    const s=Math.min((W-2*margin)/Xspan,(H-2*margin)/Yspan);
    const x0=margin-model.extents.xmin*s, y0=margin-model.extents.ymin*s;
    const toPx=([x,y])=>[x0+x*s, y0-y*s];

    // grade
    ctx.strokeStyle='#eee'; ctx.lineWidth=1;
    for(let x=Math.ceil(model.extents.xmin/1000)*1000; x<=model.extents.xmax; x+=1000){
      const [a,b]=toPx([x,model.extents.ymin]), [c,d]=toPx([x,model.extents.ymax]); ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke();
    }
    for(let y=Math.ceil(model.extents.ymin/500)*500; y<=model.extents.ymax; y+=500){
      const [a,b]=toPx([model.extents.xmin,y]), [c,d]=toPx([model.extents.xmax,y]); ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke();
    }

    const trap = (x0m,w0m,x1m,w1m,color)=>{
      const h0=w0m/2,h1=w1m/2;
      const p1=toPx([x0m,-h0]), p2=toPx([x1m,-h1]), p3=toPx([x1m, h1]), p4=toPx([x0m, h0]);
      ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.lineTo(...p4); ctx.closePath();
      ctx.fillStyle=color; ctx.globalAlpha=.35; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=color; ctx.lineWidth=2; ctx.stroke();
    };

    // pista
    ctx.fillStyle='#000'; ctx.globalAlpha=.8;
    const rw=[toPx([-60,-model.p.rwWid/2]),toPx([model.p.rwLen,-model.p.rwWid/2]),toPx([model.p.rwLen,model.p.rwWid/2]),toPx([-60,model.p.rwWid/2])];
    ctx.beginPath(); ctx.moveTo(...rw[0]); for(let i=1;i<rw.length;i++) ctx.lineTo(...rw[i]); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1;

    // transicional (faixas laterais)
    if(model.common.transitional){
      const reach=model.common.transitional.width;
      let p0=toPx([-60, model.p.rwWid/2]), p1=toPx([model.p.rwLen, model.p.rwWid/2]), p2=toPx([model.p.rwLen, model.p.rwWid/2+reach]), p3=toPx([-60, model.p.rwWid/2+reach]);
      ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.globalAlpha=.2; ctx.fillStyle='#bd10e0'; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle='#bd10e0'; ctx.stroke();
      p0=toPx([-60,-model.p.rwWid/2]); p1=toPx([model.p.rwLen,-model.p.rwWid/2]); p2=toPx([model.p.rwLen,-model.p.rwWid/2-reach]); p3=toPx([-60,-model.p.rwWid/2-reach]);
      ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.closePath(); ctx.globalAlpha=.2; ctx.fill(); ctx.globalAlpha=1; ctx.stroke();
    }

    // IHS, cônica e OHS
    if(model.common.ihs){ const [cx,cy]=toPx([model.common.ihs.cx,0]), r=model.common.ihs.radius*s; ctx.strokeStyle='#7ed321'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.stroke(); }
    if(model.common.cone && model.common.ihs){ const add=model.common.cone.height/(DATA.conical.slope/100); const [cx,cy]=toPx([model.common.ihs.cx,0]); const r=(model.common.ihs.radius+add)*s; ctx.strokeStyle='#b8e986'; ctx.setLineDash([6,6]); ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.stroke(); ctx.setLineDash([]); }
    if(model.common.ohs){ const [cx,cy]=toPx([model.common.ohs.cx,0]), r=model.common.ohs.radius*s; ctx.strokeStyle='#9b9b9b'; ctx.setLineDash([3,5]); ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.stroke(); ctx.setLineDash([]); }

    // A
    if(drawA){
      model.A.approach?.forEach(s=>trap(s.x0,s.w0,s.x1,s.w1,s.color));
      if(model.A.innerApproach) trap(model.A.innerApproach.x0,model.A.innerApproach.w0,model.A.innerApproach.x1,model.A.innerApproach.w1,'#50e3c2');
      if(model.A.balked)       trap(model.A.balked.x0,model.A.balked.w0,model.A.balked.x1,model.A.balked.w1,model.A.balked.color);
      if(model.A.takeoff)      trap(model.A.takeoff.x0,model.A.takeoff.w0,model.A.takeoff.x1,model.A.takeoff.w1,model.A.takeoff.color);
    }
    // B
    if(drawB){
      model.B.approach?.forEach(s=>trap(s.x0,s.w0,s.x1,s.w1,s.color));
      if(model.B.innerApproach) trap(model.B.innerApproach.x0,model.B.innerApproach.w0,model.B.innerApproach.x1,model.B.innerApproach.w1,'#33c9a8');
      if(model.B.balked)        trap(model.B.balked.x0,model.B.balked.w0,model.B.balked.x1,model.B.balked.w1,model.B.balked.color);
      if(model.B.takeoff)       trap(model.B.takeoff.x0,model.B.takeoff.w0,model.B.takeoff.x1,model.B.takeoff.w1,model.B.takeoff.color);
    }

    // marcadores de eixo
    const axis = (x,y,label)=>{
      const [ox,oy]=toPx([x,y]); ctx.strokeStyle='#000'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(ox+40,oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+40,oy); ctx.lineTo(ox+34,oy-4); ctx.lineTo(ox+34,oy+4); ctx.closePath(); ctx.fillStyle='#000'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(ox,oy-40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox,oy-40); ctx.lineTo(ox-4,oy-34); ctx.lineTo(ox+4,oy-34); ctx.closePath(); ctx.fill();
      ctx.font='12px sans-serif'; ctx.fillText(label+' (X→, Y↑)', ox+46, oy-6);
    };
    axis(0,0,rwyLabels.A); axis(model.p.rwLen,0,rwyLabels.B);

    // escala
    const km=1000*s; ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(40,H-30); ctx.lineTo(40+km,H-30); ctx.stroke(); ctx.font='12px sans-serif'; ctx.fillStyle='#000'; ctx.fillText('1 km',40+km/2-14,H-35);
  }

  // --- perfil (apenas rampas e planos de referência) ---
  function drawProfile(canvas, model, drawA=true, drawB=true){
    const ctx=clearCanvas(canvas), W=canvas.width,H=canvas.height,margin=40;
    const Xmax=16000, Zmax=model.extents.zmax;
    const sx=(W-2*margin)/Xmax, sz=(H-2*margin)/Zmax;
    const toPx=(x,z)=>[margin+x*sx, H-margin - z*sz];

    // grades
    ctx.strokeStyle='#eee'; ctx.lineWidth=1;
    for(let x=0;x<=Xmax;x+=1000){ const [a,b]=toPx(x,0), [c,d]=toPx(x,Zmax); ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke(); }
    for(let z=0;z<=Zmax;z+=25){ const [a,b]=toPx(0,z), [c,d]=toPx(Xmax,z); ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke(); }

    // eixos
    ctx.strokeStyle='#000'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(Xmax,0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(0,Zmax)); ctx.stroke();
    ctx.font='12px sans-serif'; ctx.fillText('Distância (m) a partir do limiar', W/2-80, H-10);
    ctx.save(); ctx.translate(14,H/2); ctx.rotate(-Math.PI/2); ctx.fillText('Altura acima do limiar (m)', 0,0); ctx.restore();

    // planos IHS / OHS + marca da conical
    if(model.common.ihs){ ctx.strokeStyle='#7ed321'; ctx.setLineDash([6,4]); ctx.beginPath(); ctx.moveTo(...toPx(0,model.common.ihs.height)); ctx.lineTo(...toPx(Xmax,model.common.ihs.height)); ctx.stroke(); ctx.setLineDash([]); }
    if(model.common.cone && model.common.ihs){ const z1=model.common.ihs.height+model.common.cone.height; ctx.strokeStyle='#b8e986'; ctx.beginPath(); ctx.moveTo(...toPx(0,model.common.ihs.height)); ctx.lineTo(...toPx(0,z1)); ctx.stroke(); }
    if(model.common.ohs){ ctx.strokeStyle='#9b9b9b'; ctx.setLineDash([6,6]); ctx.beginPath(); ctx.moveTo(...toPx(0,model.common.ohs.height)); ctx.lineTo(...toPx(Xmax,model.common.ohs.height)); ctx.stroke(); ctx.setLineDash([]); }

    const ramp = (x0, x1, slope, color)=>{
      const len=Math.abs(x1-x0), z1=slope*len;
      ctx.strokeStyle=color; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(0,0)); ctx.lineTo(...toPx(len,z1)); ctx.stroke();
    };
    // A
    if(drawA){
      let z=0;
      model.A.approach?.forEach(s=>{ const len=Math.abs(s.x1-s.x0); const z1=z + (s.slope||0)*len; ctx.strokeStyle='#4a90e2'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(0,z)); ctx.lineTo(...toPx(len,z1)); ctx.stroke(); z=z1; });
      if(model.A.innerApproach) ramp(model.A.innerApproach.x0, model.A.innerApproach.x1, model.A.innerApproach.slope, '#50e3c2');
      if(model.A.balked)       ramp(model.A.balked.x0, model.A.balked.x1, model.A.balked.slope, '#9013fe');
      if(model.A.takeoff)      ramp(model.A.takeoff.x0, model.A.takeoff.x1, model.A.takeoff.slope, '#f5a623');
    }
    // B
    if(drawB){
      let z=0;
      model.B.approach?.forEach(s=>{ const len=Math.abs(s.x1-s.x0); const z1=z + (s.slope||0)*len; ctx.strokeStyle='#2f7bdc'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(...toPx(0,z)); ctx.lineTo(...toPx(len,z1)); ctx.stroke(); z=z1; });
      if(model.B.innerApproach) ramp(model.B.innerApproach.x0, model.B.innerApproach.x1, model.B.innerApproach.slope, '#33c9a8');
      if(model.B.balked)        ramp(model.B.balked.x0, model.B.balked.x1, model.B.balked.slope, '#7a00ff');
      if(model.B.takeoff)       ramp(model.B.takeoff.x0, model.B.takeoff.x1, model.B.takeoff.slope, '#e09421');
    }
  }

  // --- THREE.js 3D ---
  let three={scene:null,camera:null,controls:null,renderer:null,meshes:[],terrain:null,obstacles:[]};

  function init3D(){
    const box=el('ols3d'); if(!box) return; box.innerHTML='';
    const w=box.clientWidth, h=box.clientHeight||Math.round(w*9/16);

    const scene=new THREE.Scene(); scene.background=new THREE.Color(0xffffff);
    const camera=new THREE.PerspectiveCamera(55, w/h, 1, 200000); camera.position.set(-800,800,1200);

    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); renderer.setSize(w,h); box.appendChild(renderer.domElement);

    const amb=new THREE.AmbientLight(0xffffff,0.8); scene.add(amb);
    const dir=new THREE.DirectionalLight(0xffffff,0.6); dir.position.set(1000,1000,2000); scene.add(dir);

    const grid=new THREE.GridHelper(12000,120,0xdddddd,0xeeeeee); scene.add(grid);

    const controls=new THREE.OrbitControls(camera, renderer.domElement); controls.target.set(1000,0,0); controls.update();

    three={scene,camera,controls,renderer,meshes:[],terrain:null,obstacles:[]};

    const animate=()=>{ requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); };
    animate();

    window.addEventListener('resize', ()=>{ const w2=box.clientWidth, h2=box.clientHeight||Math.round(box.getBoundingClientRect().width*9/16); camera.aspect=w2/h2; camera.updateProjectionMatrix(); renderer.setSize(w2,h2); });
  }

  function addMesh(m){ three.scene.add(m); three.meshes.push(m); }
  function reset3D(){
    if(!three.scene) return;
    three.meshes.forEach(m=>{ three.scene.remove(m); m.geometry?.dispose?.(); if(Array.isArray(m.material)) m.material.forEach(mm=>mm.dispose?.()); else m.material?.dispose?.(); });
    three.meshes=[];
    if(three.terrain){ three.scene.remove(three.terrain); three.terrain.geometry.dispose(); three.terrain.material.dispose(); three.terrain=null; }
    three.obstacles.forEach(o=>{ three.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }); three.obstacles=[];
  }

  function trapGeom(x0,w0,x1,w1,th=0.5){
    const h0=w0/2,h1=w1/2;
    const top=[ new THREE.Vector3(x0, th/2,-h0), new THREE.Vector3(x1, th/2,-h1), new THREE.Vector3(x1, th/2, h1), new THREE.Vector3(x0, th/2, h0) ];
    const bot=top.map(v=>v.clone().setY(-th/2));
    const g=new THREE.BufferGeometry(), pos=[];
    const push=(a,b,c)=>{ pos.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z); };
    // topo/fundo
    push(top[0],top[1],top[2]); push(top[0],top[2],top[3]);
    push(bot[2],bot[1],bot[0]); push(bot[3],bot[2],bot[0]);
    // laterais
    for(let i=0;i<4;i++){ const j=(i+1)%4; push(top[i],top[j],bot[j]); push(top[i],bot[j],bot[i]); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pos),3));
    g.computeVertexNormals(); return g;
  }
  function rectGeom(x, y0, len, width, th=0.5){ return trapGeom(x,width,x+len,width,th).translate(0,0,y0+width/2); }
  function ringGeom(r0,r1,seg=128,th=0.5){
    const g=new THREE.BufferGeometry(), pos=[]; const push=(a,b,c)=>pos.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
    for(let i=0;i<seg;i++){
      const a0=(i/seg)*Math.PI*2, a1=((i+1)/seg)*Math.PI*2, c0=Math.cos(a0),s0=Math.sin(a0), c1=Math.cos(a1),s1=Math.sin(a1);
      const p00=new THREE.Vector3(r0*c0, th/2, r0*s0), p01=new THREE.Vector3(r1*c0, th/2, r1*s0), p10=new THREE.Vector3(r0*c1, th/2, r0*s1), p11=new THREE.Vector3(r1*c1, th/2, r1*s1);
      const q00=p00.clone().setY(-th/2), q01=p01.clone().setY(-th/2), q10=p10.clone().setY(-th/2), q11=p11.clone().setY(-th/2);
      push(p01,p11,p10); push(p01,p10,p00); push(q10,q11,q01); push(q00,q10,q01); push(p00,p10,q10); push(p00,q10,q00); push(p11,p01,q01); push(p11,q01,q11);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pos),3));
    g.computeVertexNormals(); return g;
  }

  function build3D(model,drawA=true,drawB=true){
    reset3D(); if(!three.scene) init3D();
    const col={ runway:0x000000, ihs:0x7ed321, cone:0xb8e986, ohs:0x9b9b9b, trans:0xbd10e0,
      app1:0x4a90e2, app2:0x2f7bdc, appH:0x7fb3f3, innerA:0x50e3c2, innerB:0x33c9a8,
      tocA:0xf5a623, tocB:0xe09421, blA:0x9013fe, blB:0x7a00ff, obstacle:0xd0021b
    };

    // pista
    const rw=new THREE.Mesh(new THREE.BoxGeometry(model.p.rwLen+60,2,model.p.rwWid), new THREE.MeshBasicMaterial({color:col.runway}));
    rw.position.set(model.p.rwLen/2-30,1,0); addMesh(rw);

    // transicional
    if(model.common.transitional){
      const reach=model.common.transitional.width;
      const left=rectGeom(-60,-model.p.rwWid/2-reach, model.p.rwLen+60, reach, .3);
      const right=rectGeom(-60, model.p.rwWid/2,     model.p.rwLen+60, reach, .3);
      const m=new THREE.MeshBasicMaterial({color:col.trans,transparent:true,opacity:.25,side:THREE.DoubleSide});
      addMesh(new THREE.Mesh(left,m)); addMesh(new THREE.Mesh(right,m.clone()));
    }

    // IHS, cone, OHS
    if(model.common.ihs){ const ring=ringGeom(0,model.common.ihs.radius,128,.5); const m=new THREE.MeshBasicMaterial({color:col.ihs,transparent:true,opacity:.35,side:THREE.DoubleSide}); const mesh=new THREE.Mesh(ring,m); mesh.position.set(model.p.rwLen/2,model.common.ihs.height,0); addMesh(mesh); }
    if(model.common.cone && model.common.ihs){ const inner=model.common.ihs.radius, add=model.common.cone.height/(DATA.conical.slope/100), outer=inner+add, h=model.common.cone.height;
      const geo=new THREE.CylinderGeometry(outer,inner,h,128,1,true), m=new THREE.MeshBasicMaterial({color:col.cone,transparent:true,opacity:.2,side:THREE.DoubleSide});
      const cone=new THREE.Mesh(geo,m); cone.position.set(model.p.rwLen/2, model.common.ihs.height+h/2, 0); addMesh(cone);
    }
    if(model.common.ohs){ const ring=ringGeom(0,model.common.ohs.radius,128,.5); const m=new THREE.MeshBasicMaterial({color:col.ohs,transparent:true,opacity:.25,side:THREE.DoubleSide}); const mesh=new THREE.Mesh(ring,m); mesh.position.set(model.p.rwLen/2,model.common.ohs.height,0); addMesh(mesh); }

    // A
    if(drawA){
      model.A.approach?.forEach((s,i)=>{ const g=trapGeom(s.x0,s.w0,s.x1,s.w1,.5); const c=(s.slope===0?col.appH:(i===0?col.app1:col.app2)); const m=new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.5,side:THREE.DoubleSide}); addMesh(new THREE.Mesh(g,m)); });
      if(model.A.innerApproach){ const ia=model.A.innerApproach; addMesh(new THREE.Mesh(trapGeom(ia.x0,ia.w0,ia.x1,ia.w1,.5), new THREE.MeshBasicMaterial({color:col.innerA,transparent:true,opacity:.5,side:THREE.DoubleSide}))); }
      if(model.A.takeoff){ const t=model.A.takeoff; addMesh(new THREE.Mesh(trapGeom(t.x0,t.w0,t.x1,t.w1,.5), new THREE.MeshBasicMaterial({color:col.tocA,transparent:true,opacity:.5,side:THREE.DoubleSide}))); }
      if(model.A.balked){ const b=model.A.balked; addMesh(new THREE.Mesh(trapGeom(b.x0,b.w0,b.x1,b.w1,.5), new THREE.MeshBasicMaterial({color:col.blA,transparent:true,opacity:.5,side:THREE.DoubleSide}))); }
    }
    // B
    if(drawB){
      model.B.approach?.forEach((s,i)=>{ const g=trapGeom(s.x0,s.w0,s.x1,s.w1,.5); const c=(s.slope===0?col.appH:(i===0?col.app1:col.app2)); const m=new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.5,side:THREE.DoubleSide}); addMesh(new THREE.Mesh(g,m)); });
      if(model.B.innerApproach){ const ia=model.B.innerApproach; addMesh(new THREE.Mesh(trapGeom(ia.x0,ia.w0,ia.x1,ia.w1,.5), new THREE.MeshBasicMaterial({color:col.innerB,transparent:true,opacity:.5,side:THREE.DoubleSide}))); }
      if(model.B.takeoff){ const t=model.B.takeoff; addMesh(new THREE.Mesh(trapGeom(t.x0,t.w0,t.x1,t.w1,.5), new THREE.MeshBasicMaterial({color:col.tocB,transparent:true,opacity:.5,side:THREE.DoubleSide}))); }
      if(model.B.balked){ const b=model.B.balked; addMesh(new THREE.Mesh(trapGeom(b.x0,b.w0,b.x1,b.w1,.5), new THREE.MeshBasicMaterial({color:col.blB,transparent:true,opacity:.5,side:THREE.DoubleSide}))); }
    }
  }

  // --- terreno/obstáculos CSV ---
  function readText(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsText(f); }); }
  function loadTerrainCSV(text){
    const lines=text.trim().split(/\r?\n/); if(!lines.length) return null;
    let meta={cell:50,originX:0,originY:0};
    if(lines[0].startsWith('#')){
      meta.cell=parseFloat((lines[0].match(/cell\s*=\s*([0-9.]+)/i)||[])[1]||'50');
      meta.originX=parseFloat((lines[0].match(/originX\s*=\s*(-?[0-9.]+)/i)||[])[1]||'0');
      meta.originY=parseFloat((lines[0].match(/originY\s*=\s*(-?[0-9.]+)/i)||[])[1]||'0');
      lines.shift();
    }
    const grid=lines.map(r=>r.split(/[,; \t]+/).filter(Boolean).map(parseFloat));
    const ny=grid.length, nx=grid[0]?.length||0; if(nx===0||ny===0) return null;

    const g=new THREE.PlaneGeometry(meta.cell*(nx-1), meta.cell*(ny-1), nx-1, ny-1);
    g.rotateX(-Math.PI/2);
    g.translate(meta.originX+meta.cell*(nx-1)/2, 0, meta.originY+meta.cell*(ny-1)/2);
    const pos=g.attributes.position;
    for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ pos.setY(j*nx+i, grid[j][i]); }
    pos.needsUpdate=true; g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({color:0x888888,side:THREE.DoubleSide,transparent:true,opacity:.6}));
  }
  function loadObstaclesCSV(text){
    const lines=text.trim().split(/\r?\n/); const header=lines.shift().split(/[,; \t]+/).map(s=>s.trim().toLowerCase());
    const idx={name:header.indexOf('name'), x:header.indexOf('x'), y:header.indexOf('y'), h:header.indexOf('height')};
    if(idx.x<0||idx.y<0||idx.h<0) return [];
    const list=[];
    for(const line of lines){ if(!line.trim()) continue;
      const p=line.split(/[,; \t]+/); const name=idx.name>=0? p[idx.name] : '';
      const x=parseFloat(p[idx.x]||'0'), y=parseFloat(p[idx.y]||'0'), h=parseFloat(p[idx.h]||'0');
      const m=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,Math.max(1,h),12), new THREE.MeshBasicMaterial({color:0xd0021b}));
      m.position.set(x,h/2,y); m.userData={name,height:h}; list.push(m);
    }
    return list;
  }

  // --- UI / integração ---
  function setRwyLabels(h){ const H=((h%360)+360)%360; el('rwyLabelA').textContent='RWY '+toRwyNum(H); el('rwyLabelB').textContent='RWY '+toRwyNum(H+180); }
  function readForm(){
    return {
      cat: el('categoria').value,
      code: parseInt(el('codeNumber').value,10),
      letterF: !!el('codeLetterF').checked,
      thrElev: num(el('thrElev').value,0),
      rwLen:   num(el('rwLen').value,3000),
      rwWid:   num(el('rwWid').value,45),
      rwHeading: num(el('rwHeading').value,90),
      drawA: !!el('drawA').checked,
      drawB: !!el('drawB').checked,
      ohsR: num(el('ohsRadius').value,15000),
      ohsH: num(el('ohsHeight').value,150)
    };
  }

  async function gerar(){
    const p=readForm(); const msg=el('msg'); msg.textContent='';
    if(p.cat==='catIIIII' && (p.code===1||p.code===2)) msg.textContent='CAT II/III só se aplica a code number 3 ou 4.';
    const model=buildModel(p); const labels={A:el('rwyLabelA').textContent,B:el('rwyLabelB').textContent};
    drawPlan(el('planCanvas'), model, p.drawA, p.drawB, labels);
    drawProfile(el('profileCanvas'), model, p.drawA, p.drawB);
    build3D(model, p.drawA, p.drawB);
  }

  async function onTerrain(f){ if(!f) return; const mesh=loadTerrainCSV(await readText(f)); if(!mesh){ el('msg').textContent='Terreno CSV inválido.'; return; }
    if(!three.scene) init3D(); if(three.terrain) three.scene.remove(three.terrain); three.terrain=mesh; three.scene.add(mesh);
  }
  async function onObstacles(f){ if(!f) return; const list=loadObstaclesCSV(await readText(f)); if(!three.scene) init3D();
    three.obstacles.forEach(o=>three.scene.remove(o)); three.obstacles=list; list.forEach(o=>three.scene.add(o));
  }
  function save2D(){ const plan=el('planCanvas'), prof=el('profileCanvas'); const combo=document.createElement('canvas');
    combo.width=Math.max(plan.width,prof.width); combo.height=plan.height+20+prof.height;
    const ctx=combo.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,combo.width,combo.height);
    ctx.drawImage(plan,0,0); ctx.drawImage(prof,0,plan.height+20);
    const a=document.createElement('a'); a.href=combo.toDataURL('image/png'); a.download='ols_2d.png'; a.click();
  }
  function save3D(){ if(!three.renderer) return; const a=document.createElement('a'); a.href=three.renderer.domElement.toDataURL('image/png'); a.download='ols_3d.png'; a.click(); }
  function clearLayers(){ if(!three.scene) return; if(three.terrain){ three.scene.remove(three.terrain); three.terrain.geometry.dispose(); three.terrain.material.dispose(); three.terrain=null; } three.obstacles.forEach(o=>{ three.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }); three.obstacles=[]; }

  function bind(){
    el('btnGerar')?.addEventListener('click', gerar);
    el('btnSave2D')?.addEventListener('click', save2D);
    el('btnSave3D')?.addEventListener('click', save3D);
    el('btnClearTerrain')?.addEventListener('click', clearLayers);
    el('fileTerrain')?.addEventListener('change', ev=>onTerrain(ev.target.files?.[0]));
    el('fileObstacles')?.addEventListener('change', ev=>onObstacles(ev.target.files?.[0]));
    el('rwHeading')?.addEventListener('input', ()=>setRwyLabels(num(el('rwHeading').value,90)));
  }

  function init(){ bind(); init3D(); setRwyLabels(num(el('rwHeading')?.value,90)); gerar(); }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
