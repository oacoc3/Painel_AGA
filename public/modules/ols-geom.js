// public/modules/ols-geom.js
(function(){
  // Geometria local: eixo X segue a cabeceira A (para fora), Y é lateral (esquerda positivo)
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const round = (x,n=3)=>Math.round(x*10**n)/10**n;

  // Tabelas simplificadas baseadas no Anexo 14 (valores típicos, sem pretensão normativa).
  // Ajustáveis conforme necessidade. Mantive estrutura da sua versão.
  const DATA = {
    innerHorizontal: { height: 45, radius: {
      nonInstrument:{1:2000,2:2500,3:4000,4:4000},
      nonPrecision: {1:3500,2:3500,3:4000,4:4000},
      catI:         {1:3500,2:3500,3:4000,4:4000},
      catIIIII:     {3:4000,4:4000}
    }},
    conical: { slope: 5, height: {
      nonInstrument:{1:35,2:55,3:75,4:100},
      nonPrecision: {1:60,2:60,3:75,4:100},
      catI:         {1:60,2:60,3:100,4:100},
      catIIIII:     {3:100,4:100}
    }},
    // Aproximação (innerEdge largura na base; divergence ~ 10% cada lado)
    approach: {
      nonInstrument:{
        innerEdge:{1:60, 2:80, 3:80, 4:80},
        len:     {1:1600,2:2500,3:2500,4:2500},
        slope:   {1:5,   2:4,   3:4,   4:4},
        div: 0.10
      },
      nonPrecision:{
        innerEdge:{1:80, 2:80, 3:300,4:300},
        len:     {1:2500,2:2500,3:3000,4:3000},
        slope:   {1:4,   2:4,   3:2,   4:2},
        div: 0.10
      },
      catI:{
        innerEdge:{1:80, 2:80, 3:300,4:300},
        len:     {1:2500,2:2500,3:3000,4:3000},
        slope:   {1:4,   2:4,   3:2,   4:2},
        div: 0.10
      },
      catIIIII:{
        innerEdge:{3:300,4:300},
        len:     {3:3000,4:3000},
        slope:   {3:2,   4:2},
        div: 0.10
      }
    },
    // Transição (simplificado): 1:7 (~14.3%)
    transition: { slope: 14.3 }
  };

  // Vetores utilitários
  const rotZ = (pt, ang)=>{ const c=Math.cos(ang), s=Math.sin(ang); return [pt[0]*c-pt[1]*s, pt[0]*s+pt[1]*c]; };
  const add = (a,b)=>[a[0]+b[0], a[1]+b[1]];
  const sub = (a,b)=>[a[0]-b[0], a[1]-b[1]];
  const mul = (a,k)=>[a[0]*k, a[1]*k];
  const unitFromHeading = (deg)=>{
    const th = deg*DEG;
    // X cresce para fora da cabeceira A; Y positivo para esquerda
    return [Math.cos(th), Math.sin(th)]; // X = cos, Y = sin
  };
  const left = u => [-u[1], u[0]];

  // Números RWY a partir de rumo (para rótulo somente)
  function rwyNumFromDeg(deg) {
    let n = Math.floor(((deg % 360 + 360) % 360 + 5) / 10);
    if (n === 0) n = 36;
    return String(n).padStart(2,'0');
  }

  // Polígono da pista (strip) — apenas para desenho/3D simplificado
  function stripPolygon(rwLen, rwWidth) {
    const L = rwLen/2, W = rwWidth/2;
    // retângulo centrado na origem do sistema local (meio da pista)
    return [[-L,-W],[+L,-W],[+L,+W],[-L,+W]];
  }

  // Superfície de aproximação (polígono no plano XY; A aponta para +X, B para -X)
  function approachPolygon(params, side /* 'A'|'B' */) {
    const { categoria, codeNumber, rwWidth } = params;
    const A = DATA.approach[categoria];
    const code = Number(codeNumber);
    const w0 = A.innerEdge[code];
    const L  = A.len[code];
    const div = A.div; // 10% cada lado
    const halfW0 = (w0/2);
    const halfW1 = halfW0 + L*div;

    if (side === 'A') {
      // base na cabeceira A em X=0
      return [[0,-halfW0],[0,+halfW0],[L,+halfW1],[L,-halfW1]];
    } else {
      // base na cabeceira B em X=0 (mas para o lado -X)
      return [[0,-halfW0],[0,+halfW0],[-L,+halfW1],[-L,-halfW1]];
    }
  }

  // Inner Approach (retângulo curto junto à cabeceira) — opcional
  function innerApproachRect(params, side) {
    const w = 2 * (DATA.approach[params.categoria].innerEdge[Number(params.codeNumber)]/2);
    const L = 60; // comprimento curto simbólico
    const hw = w/2;
    if (side === 'A') return [[0,-hw],[0,+hw],[L,+hw],[L,-hw]];
    else return [[0,-hw],[0,+hw],[-L,+hw],[-L,-hw]];
  }

  // Inner Horizontal (círculo — raio depende) e Conical (anel) — devolvemos parâmetros
  function innerHorizontalParams(params) {
    const { categoria, codeNumber } = params;
    const code = Number(codeNumber);
    const radius = DATA.innerHorizontal.radius[categoria]?.[code];
    const height = DATA.innerHorizontal.height;
    return radius ? { radius, height } : null;
  }
  function conicalParams(params) {
    const { categoria, codeNumber } = params;
    const code = Number(codeNumber);
    const ih = innerHorizontalParams(params);
    if (!ih) return null;
    const h = DATA.conical.height[categoria]?.[code];
    const slope = DATA.conical.slope;
    return (h!=null) ? { innerRadius: ih.radius, height: h, slope } : null;
  }

  // Transição (faixas laterais ao strip; aqui retornamos apenas largura de referência)
  function transitionParams(params) {
    return { slope: DATA.transition.slope, widthRef: 105 }; // largura simbólica
  }

  // Geração completa por cabeceira (em sistema local A: +X; B: -X)
  function makeRunwayGeometry(params) {
    const { rwLen, rwWidth, headingDeg, thrElev, categoria, codeNumber } = params;

    const u = unitFromHeading(headingDeg);   // vetor para fora de A
    const v = left(u);

    const mid = [0,0];
    const L = rwLen/2;
    const thrA = sub(mid, mul(u,L)); // A em X=0 (no sistema local), mas guardamos ponto real
    const thrB = add(mid, mul(u,L)); // B

    const strip = stripPolygon(rwLen, rwWidth);

    const A = {
      thr: thrA,
      dirDeg: headingDeg%360,
      label: 'Cabeceira A',
      approach: approachPolygon(params,'A'),
      innerApproach: innerApproachRect(params,'A')
    };
    const B = {
      thr: thrB,
      dirDeg: (headingDeg+180)%360,
      label: 'Cabeceira B',
      approach: approachPolygon(params,'B'),
      innerApproach: innerApproachRect(params,'B')
    };

    return {
      A, B,
      strip,
      innerHorizontal: innerHorizontalParams(params),
      conical: conicalParams(params),
      transition: transitionParams(params),
      mid, u, v, thrElev
    };
  }

  window.OLSGeom = { makeRunwayGeometry, DATA, rwyNumFromDeg };
})();
