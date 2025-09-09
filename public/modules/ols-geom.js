
// public/modules/ols-geom.js
(function(){
  const rad = (d)=>d*Math.PI/180;
  const unitFromHeading = (deg)=>{ const th=rad(deg); return [Math.sin(th), Math.cos(th)]; };
  const rot = (pt, ang)=>{ const c=Math.cos(ang), s=Math.sin(ang); return [ pt[0]*c - pt[1]*s, pt[0]*s + pt[1]*c ]; };
  const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  const mul=(a,k)=>[a[0]*k,a[1]*k];
  const perpRight=(u)=>[u[1],-u[0]];

  // Tabelas (copiadas de modules/ols.js com citações)
  const TAB = {
    innerHorizontalRadius(code, klass){
      if(code<=1) return 2000;
      if(code===2) return klass==='non-instrument'?2500:4000;
      return 4000;
    },
    innerHorizontalHeight(){ return 45; }, // fileciteturn4file0L52-L57
    conicalSlope(){ return 0.05; }, // fileciteturn4file0L45-L50
    conicalHeight(code, klass){
      if(code===1) return 35;
      if(code===2) return klass==='non-instrument'?55:75;
      if(code>=3 && klass==='non-instrument') return 75;
      return 100; // fileciteturn4file0L45-L50
    },
    transitionalSlope(code, klass){
      if(code<=2 && klass==='non-instrument') return 0.20;
      return 0.143; // 1:7  fileciteturn4file6L41-L46
    },
    innerTransitionalSlope(klass){
      if(klass.startsWith('cat')) return 0.333; // fileciteturn4file6L47-L51
      return null;
    },
    approachParams(code, klass){
      const div = (klass==='non-instrument')?0.10:0.15; // fileciteturn4file0L71-L76
      let inner = 60, dist=30, len1=1600, slope1=0.05;
      if(code===2){ inner=80; dist=60; len1=2500; slope1=0.04; }
      if(code>=3){
        inner = (klass==='non-instrument')?150: (klass==='non-precision'?280:280);
        dist = 60;
        len1 = 3000;
        slope1 = (klass==='non-instrument')?1/30:0.02; // fileciteturn4file6L20-L26
        if(klass.startsWith('cat')) { slope1 = (klass==='catI'?0.025:0.02); }
      }
      return {inner, dist, len1, slope1, div};
    },
    innerApproach(code, klass){
      if(!klass.startsWith('cat')) return null;
      const width = (code<=2)?90:120; // fileciteturn4file0L59-L66
      return {width, length:900, dist:60, slope:(klass==='catI'?0.025:0.02)}; // fileciteturn4file0L59-L66
    },
    balkedLanding(code, klass){
      if(!klass.startsWith('cat')) return null;
      const inner = (code<=2)?90:120, dist=1800, div=0.10, slope=(klass==='catI'?0.04:1/30);
      return {inner, dist, div, slope}; // fileciteturn4file6L58-L66
    },
    takeoffParams(code){
      let inner=180, dist=60, div=0.125, finalW=1200, len=15000, slope=0.02;
      if(code===1){ inner=60; dist=30; div=0.10; finalW=380; len=1600; slope=0.05; }
      if(code===2){ inner=80; dist=60; div=0.10; finalW=580; len=2500; slope=0.04; }
      return {inner, dist, div, finalW, len, slope}; // fileciteturn3file0L55-L69
    }
  };

  function makeRunwayGeometry(params){
    const {
      cx, cy, heading, rwyl, rwyw, code, klass,
      thrA_elev, thrB_elev, slopeLong=0
    } = params;

    const u = unitFromHeading(heading);
    const v = perpRight(u);
    const mid = [cx, cy];
    const half = mul(u, rwyl/2);
    const thrA = sub(mid, half);
    const thrB = add(mid, half);

    function approachSurface(thr, dirDeg){
      const uDir = unitFromHeading(dirDeg);
      const vDir = perpRight(uDir);
      const ap = TAB.approachParams(code, klass);
      const innerCenter = add(thr, mul(uDir,-ap.dist));
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
      return { type:'Inner approach', inner:[innerL,innerR], outer:[outerL,outerR], dir:uDir, innerCenter:center, outerCenter: add(center, mul(uDir,-ia.length)) };
    }

    function takeoffSurface(thr, dirDeg){
      const uDir = unitFromHeading(dirDeg);
      const vDir = perpRight(uDir);
      const tk = TAB.takeoffParams(code);
      const innerCenter = add(thr, mul(uDir, tk.dist));
      const halfInner = tk.inner/2;
      const innerL = add(innerCenter, mul(vDir,-halfInner));
      const innerR = add(innerCenter, mul(vDir, halfInner));
      const outerCenter = add(innerCenter, mul(uDir, tk.len));
      const halfOuter = tk.finalW/2;
      const outerL = add(outerCenter, mul(vDir,-halfOuter));
      const outerR = add(outerCenter, mul(vDir, halfOuter));
      return { type:'Take-off climb', inner:[innerL,innerR], outer:[outerL,outerR], dir:uDir, innerCenter, outerCenter };
    }

    function stripPolygon(){
      const halfW = rwyw/2;
      return [ add(thrA, mul(v,-halfW)), add(thrB, mul(v,-halfW)),
               add(thrB, mul(v, halfW)), add(thrA, mul(v, halfW)) ];
    }

    const A = {
      thr: thrA, dirDeg: heading, label: 'Cabeceira A',
      approach: approachSurface(thrA, heading),
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

  window.OLSGeom = { makeRunwayGeometry, TAB };
})();
