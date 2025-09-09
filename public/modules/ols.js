
// public/modules/ols.js
// Gera planta e 3D das OLS por cabeceira (RWY xx/yy).
// Corrige inversão de sentido: as superfícies de Aproximação (Approach) se estendem
// ANTES da cabeceira, e as de Decolagem (Take-off climb) APÓS a cabeceira correspondente.

(function(){
  const $ = (s) => document.querySelector(s);
  const el = (id) => document.getElementById(id);

  // -------------------- Geometria base --------------------
  function rad(d){ return d*Math.PI/180; }
  function rot(pt, ang){ // gira vetor [x,y] por ângulo em rad
    const c = Math.cos(ang), s = Math.sin(ang);
    return [ pt[0]*c - pt[1]*s, pt[0]*s + pt[1]*c ];
  }
  function add(a,b){ return [a[0]+b[0], a[1]+b[1]]; }
  function sub(a,b){ return [a[0]-b[0], a[1]-b[1]]; }
  function mul(a,k){ return [a[0]*k, a[1]*k]; }
  function unitFromHeading(deg){ // rumo a partir do Norte (sentido horário)
    const th = rad(deg);
    return [Math.sin(th), Math.cos(th)]; // x para Leste, y para Norte
  }
  function perpRight(u){ return [u[1], -u[0]]; } // 90° à direita de u

  // -------------------- Parâmetros ICAO/Anexo 14 --------------------
  // Tabela 4-1 e 4-2 (valores simplificados mais usados). Fontes citadas no PDF anexo.
  const TAB = {
    innerHorizontalRadius(code, klass){
      // radius em metros — abordagem: ver Tabela 4-1
      // códigos 3/4 -> 4000 m (vários casos)
      if(code<=1) return 2000;
      if(code===2) return klass==='non-instrument'?2500:4000;
      return 4000;
    },
    innerHorizontalHeight(){ return 45; }, // 45 m  (Tabela 4-1) fileciteturn4file0L52-L57
    conicalSlope(){ return 0.05; }, // 5% (Tabela 4-1) fileciteturn4file0L45-L50
    conicalHeight(code, klass){
      // altura acima do plano inner horizontal
      if(code===1) return 35;
      if(code===2) return klass==='non-instrument'?55:75;
      if(code>=3 && klass==='non-instrument') return 75;
      return 100; // simplificado para maiorias (Tabela 4-1) fileciteturn4file0L45-L50
    },
    transitionalSlope(code, klass){
      // Tabela 4-1 — 14.3% para códigos 3/4 em várias classes
      if(code<=2 && klass==='non-instrument') return 0.20;
      return 0.143; // 14.3% (1:7)  fileciteturn4file6L41-L46
    },
    innerTransitionalSlope(klass){
      // 33.3% (1:3) p/ CAT I/II/III — Tabela 4-1
      if(klass.startsWith('cat')) return 0.333; // fileciteturn4file6L47-L51
      return null; // não aplicável
    },
    approachParams(code, klass){
      // Retorna dimensões principais para a 1ª seção (para desenho em planta).
      // Ver Tabela 4-1 (comprimento do bordo interno, deslocamento e divergência).
      const div = (klass==='non-instrument')?0.10:0.15; // por lado  fileciteturn4file0L71-L76
      let inner = 60, dist=30, len1=1600, slope1=0.05;
      if(code===2){ inner=80; dist=60; len1=2500; slope1=0.04; }
      if(code>=3){
        inner = (klass==='non-instrument')?150: (klass==='non-precision'?280:280);
        dist = 60;
        len1 = (klass==='non-instrument')?3000:3000;
        slope1 = (klass==='non-instrument')?1/30:0.02; // 3.33% ou 2%  fileciteturn4file6L20-L26
        if(klass.startsWith('cat')) { len1 = 3000; slope1 = (klass==='catI'?0.025:0.02); } // fileciteturn4file6L20-L26
      }
      return {inner, dist, len1, slope1, div};
    },
    innerApproach(code, klass){
      if(!klass.startsWith('cat')) return null;
      // Largura 90/120 m, comprimento 900 m, distância 60 m  (Tabela 4-1)
      const width = (code<=2)?90:120; // fileciteturn4file0L59-L66
      return {width, length:900, dist:60, slope:(klass==='catI'?0.025:0.02)}; // fileciteturn4file0L59-L66
    },
    balkedLanding(code, klass){
      if(!klass.startsWith('cat')) return null;
      // Tabela 4-1
      const inner = (code<=2)?90:120, dist=1800, div=0.10, slope=(klass==='catI'?0.04:1/30);
      return {inner, dist, div, slope}; // fileciteturn4file6L58-L66
    },
    takeoffParams(code){
      // Tabela 4-2
      let inner=180, dist=60, div=0.125, finalW=1200, len=15000, slope=0.02;
      if(code===1){ inner=60; dist=30; div=0.10; finalW=380; len=1600; slope=0.05; }
      if(code===2){ inner=80; dist=60; div=0.10; finalW=580; len=2500; slope=0.04; }
      return {inner, dist, div, finalW, len, slope}; // fileciteturn3file0L55-L69
    }
  };

  // -------------------- Construção das superfícies em planta --------------------
  function makeRunwayGeometry(params){
    const {
      cx, cy, heading, rwyl, rwyw, code, klass,
      thrA_elev, thrB_elev, slopeLong=0
    } = params;

    const u = unitFromHeading(heading);       // direção A->B
    const v = perpRight(u);                   // direita da direção A->B
    const mid = [cx, cy];
    const half = mul(u, rwyl/2);
    const thrA = sub(mid, half);
    const thrB = add(mid, half);

    function approachSurface(thr, dirDeg){
      const uDir = unitFromHeading(dirDeg);
      const vDir = perpRight(uDir);
      const ap = TAB.approachParams(code, klass);
      // Inner edge centrado no eixo, a 'dist' antes da cabeceira (no sentido OPOSTO ao pouso)
      const innerCenter = add(thr, mul(uDir,-ap.dist)); // antes da cabeceira
      const halfInner = ap.inner/2;
      const innerL = add(innerCenter, mul(vDir,-halfInner));
      const innerR = add(innerCenter, mul(vDir, halfInner));
      const outerCenter = add(innerCenter, mul(uDir,-ap.len1));
      const widen = ap.div * ap.len1;
      const halfOuter = halfInner + widen;
      const outerL = add(outerCenter, mul(vDir,-halfOuter));
      const outerR = add(outerCenter, mul(vDir, halfOuter));
      return { type:'Approach', inner:[innerL,innerR], outer:[outerL,outerR], dir:uDir, innerCenter, outerCenter };
    }

    function innerApproach(thr, dirDeg){
      const uDir = unitFromHeading(dirDeg);
      const vDir = perpRight(uDir);
      const ia = TAB.innerApproach(code, klass); if(!ia) return null;
      const center = add(thr, mul(uDir,-ia.dist));
      const half = ia.width/2;
      const innerL = add(center, mul(vDir,-half));
      const innerR = add(center, mul(vDir, half));
      const outerL = add(center, add(mul(uDir,-ia.length), mul(vDir,-half)));
      const outerR = add(center, add(mul(uDir,-ia.length), mul(vDir, half)));
      return { type:'Inner approach', inner:[innerL,innerR], outer:[outerL,outerR], dir:uDir };
    }

    function takeoffSurface(thr, dirDeg){
      const uDir = unitFromHeading(dirDeg);
      const vDir = perpRight(uDir);
      const tk = TAB.takeoffParams(code);
      const innerCenter = add(thr, mul(uDir, tk.dist)); // após a cabeceira
      const halfInner = tk.inner/2;
      const innerL = add(innerCenter, mul(vDir,-halfInner));
      const innerR = add(innerCenter, mul(vDir, halfInner));
      const outerCenter = add(innerCenter, mul(uDir, tk.len));
      const halfOuter = tk.finalW/2;
      const outerL = add(outerCenter, mul(vDir,-halfOuter));
      const outerR = add(outerCenter, mul(vDir, halfOuter));
      return { type:'Take-off climb', inner:[innerL,innerR], outer:[outerL,outerR], dir:uDir };
    }

    // Transicionais laterais: para planta desenhamos como faixas em cada lado do strip
    function stripPolygon(){
      const halfW = rwyw/2;
      return [ add(thrA, mul(v,-halfW)), add(thrB, mul(v,-halfW)),
               add(thrB, mul(v, halfW)), add(thrA, mul(v, halfW)) ];
    }

    // Pacote por cabeceira
    const A = {
      thr: thrA, dirDeg: heading, label: 'Cabeceira A',
      approach: approachSurface(thrA, heading), // correção: para A, Approach vai no sentido -u (já aplicado na função)
      innerApproach: innerApproach(thrA, heading),
      takeoff: takeoffSurface(thrA, heading),
    };
    const B = {
      thr: thrB, dirDeg: (heading+180)%360, label: 'Cabeceira B',
      approach: approachSurface(thrB, (heading+180)%360),
      innerApproach: innerApproach(thrB, (heading+180)%360),
      takeoff: takeoffSurface(thrB, (heading+180)%360),
    };

    return { A, B, strip: stripPolygon(), u, v, thrA, thrB, mid };
  }

  // -------------------- Desenho 2D em canvas --------------------
  function drawPlan2D(ctx, geom){
    const {A,B, strip} = geom;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.save();
    // sistema: origem no centro
    ctx.translate(W/2, H/2);
    // escala automática para caber no canvas
    const R = OLSGeom.TAB.innerHorizontalRadius(window._lastParams.code, window._lastParams.klass);
    const hCon = OLSGeom.TAB.conicalHeight(window._lastParams.code, window._lastParams.klass);
    const R2 = R + hCon/OLSGeom.TAB.conicalSlope();
    const pad = 40;
    const maxR = Math.max(R2, window._lastParams.rwyl*1.2);
    const s = Math.min((W/2-pad)/maxR, (H/2-pad)/maxR);
    ctx.scale(s,-s);


    function poly(p, fill, stroke){
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for(let i=1;i<p.length;i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      if(fill){ ctx.globalAlpha=0.25; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha=1; }
      if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=1; ctx.stroke(); }
    }
    function annotate(pt, txt){
      ctx.save();
      ctx.scale(1,-1); // voltar texto
      ctx.fillStyle='#222';
      ctx.font='12px sans-serif';
      const s = ctx.measureText(txt).width;
      ctx.fillText(txt, pt[0]-s/2, -pt[1]);
      ctx.restore();
    }

    // Strip
    poly(strip, null, '#555');

    // Superfícies por cabeceira
    const surfaces = [
      [A.approach, '#f97316'], // laranja
      [B.approach, '#f97316'],
      [A.takeoff, '#60a5fa'],  // azul
      [B.takeoff, '#60a5fa'],
      [A.innerApproach, '#22c55e'],
      [B.innerApproach, '#22c55e']
    ];
    surfaces.forEach(([s,color])=>{
      if(!s) return;
      const polyPts = [s.inner[0], s.inner[1], s.outer[1], s.outer[0]];
      poly(polyPts, color, color);
      annotate(s.innerCenter || s.inner[0], s.type);
    });

    // Inner horizontal (círculo) e conical (anel) — somente guia em planta
    ctx.save();
    ctx.strokeStyle='#16a34a'; // verde
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(0,0,R,0,2*Math.PI); ctx.stroke();
    ctx.setLineDash([6,6]);
    ctx.beginPath(); ctx.arc(0,0,R2,0,2*Math.PI); ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  // -------------------- 3D --------------------
  /* init3D moved to OLS3D */
  function init3D(container){ return window.OLS3D.init3D(container); }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    const renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.innerHTML='';
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth/container.clientHeight, 1, 100000);
    camera.position.set(1500, 1200, 1500);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const grid = new THREE.GridHelper(8000, 80);
    scene.add(grid);
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(1000,1500,1000); scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    function addSurface(s, color, elev0){
      const shape = new THREE.Shape();
      const pts = [s.inner[0], s.inner[1], s.outer[1], s.outer[0]].map(p => new THREE.Vector2(p[0], p[1]));
      shape.moveTo(pts[0].x, pts[0].y);
      for(let i=1;i<pts.length;i++) shape.lineTo(pts[i].x, pts[i].y);
      shape.lineTo(pts[0].x, pts[0].y);
      // extrusão proporcional ao ganho de altura pela rampa
      const len = Math.hypot(s.outerCenter[0]-s.innerCenter[0], s.outerCenter[1]-s.innerCenter[1]);
      const slope = (s.type==='Take-off climb') ? OLSGeom.TAB.takeoffParams(window._lastParams.code).slope
                  : (s.type==='Approach') ? OLSGeom.TAB.approachParams(window._lastParams.code, window._lastParams.klass).slope1
                  : (s.type==='Inner approach' ? (OLSGeom.TAB.innerApproach(window._lastParams.code, window._lastParams.klass)||{}).slope : 0.02);
      const height = len * slope;
      const geom = new THREE.ExtrudeGeometry(shape, {depth: height, bevelEnabled:false});
      const mat = new THREE.MeshLambertMaterial({color, transparent:true, opacity:0.35});
      const mesh = new THREE.Mesh(geom, mat);
      // levantar em Z conforme elevação do bordo interno
      mesh.rotation.x = -Math.PI/2;
      mesh.position.z = elev0||0;
      scene.add(mesh);
      return mesh;
    }

    function addObstacle(pt, elev){
      const g = new THREE.SphereGeometry(20,16,16);
      const m = new THREE.MeshLambertMaterial({color:0x444444});
      const mesh = new THREE.Mesh(g,m);
      mesh.position.set(pt[0], 20, pt[1]);
      mesh.position.z = elev || 0;
      scene.add(mesh);
    }

    function render(){ controls.update(); renderer.render(scene, camera); requestAnimationFrame(render); }
    requestAnimationFrame(render);

    return {scene, addSurface, addObstacle, camera, renderer};
  }

  // -------------------- Integração UI --------------------
  window.addEventListener('DOMContentLoaded', () => {
    const canvas = el('plan2d');
    const c2d = canvas.getContext('2d');
    function fit(){
      const right = document.querySelector('.ols-view');
      const rect = right.getBoundingClientRect();
      canvas.width = rect.width; canvas.height = rect.height/2 - 4;
      if(window._geom) drawPlan2D(c2d, window._geom);
      if(window._three) { window._three.renderer.setSize(rect.width, rect.height/2 - 4); }
    }
    window.addEventListener('resize', fit);
    const three = OLS3D.init3D(el('view3d'));
    window._three = three;

    el('btnDraw').addEventListener('click', async () => {
      const params = {
        rwyl: +el('rwyl').value, rwyw:+el('rwyw').value,
        heading: +el('heading').value, code:+el('code').value,
        klass: el('class').value, cx:+el('cx').value, cy:+el('cy').value,
        thrA_elev:+el('thrA_elev').value, thrB_elev:+el('thrB_elev').value,
      };
      window._lastParams = params;
      const geom = OLSGeom.makeRunwayGeometry(params);
      window._geom = geom;
      fit();
      drawPlan2D(c2d, geom);

      // 3D: limpar e redesenhar superfícies
      const sc = three.scene;
      // remove anteriores (mantém grade e luzes)
      sc.children = sc.children.filter(o => !(o.userData && o.userData.surface));
      const green = 0x22c55e, orange=0xf97316, blue=0x60a5fa; const TAB = OLSGeom.TAB;
      const ms = [];
      ms.push( three.addSurface(geom.A.approach, orange, params.thrA_elev) );
      ms.push( three.addSurface(geom.B.approach, orange, params.thrB_elev) );
      if(geom.A.innerApproach) ms.push( three.addSurface(geom.A.innerApproach, green, params.thrA_elev) );
      if(geom.B.innerApproach) ms.push( three.addSurface(geom.B.innerApproach, green, params.thrB_elev) );
      ms.push( three.addSurface(geom.A.takeoff, blue, params.thrA_elev) );
      ms.push( three.addSurface(geom.B.takeoff, blue, params.thrB_elev) );
      ms.forEach(m => m.userData.surface = true);

      // Obstáculos (GeoJSON)
      const file = el('obstacles').files[0];
      if(file){
        const text = await file.text();
        const gj = JSON.parse(text);
        const feats = gj.type==='FeatureCollection' ? gj.features : [];
        feats.forEach(f => {
          if(!f.geometry) return;
          const t = f.geometry.type;
          let pt = null;
          if(t==='Point'){ pt = f.geometry.coordinates; }
          if(t==='Polygon'){ pt = f.geometry.coordinates[0][0]; }
          if(!pt) return;
          const elev = (f.properties?.elev ?? f.properties?.height ?? 0);
          three.addObstacle([pt[0], pt[1]], elev);
        });
      }
    });

    fit();
    el('btnDraw').click(); // desenhar com valores padrão
  });

})();
