// public/modules/ols-3d.js
(function(){
  function flatPolygonToShape(points) {
    const shape = new THREE.Shape();
    points.forEach((p,i)=>{ if (i===0) shape.moveTo(p[0], p[1]); else shape.lineTo(p[0], p[1]); });
    shape.closePath();
    return shape;
  }
  function makeGrid(size=5000, step=500) {
    const grid = new THREE.Group();
    const m = new THREE.LineBasicMaterial({transparent:true, opacity:0.2});
    for (let i=-size;i<=size;i+=step) {
      const g1 = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(-size,0,i), new THREE.Vector3(size,0,i) ]);
      const g2 = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(i,0,-size), new THREE.Vector3(i,0,size) ]);
      grid.add(new THREE.Line(g1,m)); grid.add(new THREE.Line(g2,m));
    }
    return grid;
  }
  function extrudeUp(shape, h, color=0x44aa88) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled:false });
    geo.rotateX(Math.PI/2);
    const mat = new THREE.MeshPhongMaterial({ color, transparent:true, opacity:0.25, side:THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  }
  function makeRamp(points, h0, slopePct, color=0xff9955) {
    const steps = 20, group = new THREE.Group();
    for (let i=0;i<steps;i++){
      const t0 = i/steps, t1=(i+1)/steps;
      const x0 = THREE.MathUtils.lerp(points[0][0], points[2][0], t0);
      const x1 = THREE.MathUtils.lerp(points[0][0], points[2][0], t1);
      const w0a = THREE.MathUtils.lerp(points[0][1], points[3][1], t0);
      const w0b = THREE.MathUtils.lerp(points[1][1], points[2][1], t0);
      const w1a = THREE.MathUtils.lerp(points[0][1], points[3][1], t1);
      const w1b = THREE.MathUtils.lerp(points[1][1], points[2][1], t1);
      const poly = [[x0,w0a],[x0,w0b],[x1,w1b],[x1,w1a]];
      const sh = flatPolygonToShape(poly);
      const h = h0 + (Math.abs(x1) * slopePct/100);
      group.add(extrudeUp(sh, h, color));
    }
    return group;
  }
  function makeDisc(radius, z, color=0x6699ff) {
    const geo = new THREE.CircleGeometry(radius, 96);
    const mat = new THREE.MeshPhongMaterial({ color, transparent:true, opacity:0.2, side:THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = z; mesh.rotation.x = -Math.PI/2;
    return mesh;
  }
  function ringMesh(r0, r1, z, color=0x99cc66) {
    const geo = new THREE.RingGeometry(r0, r1, 96);
    const mat = new THREE.MeshPhongMaterial({ color, transparent:true, opacity:0.18, side:THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = z; mesh.rotation.x = -Math.PI/2;
    return mesh;
  }
  // >>> CORREÇÃO: usar “run = height / (slopePct/100)” (desenvolvimento horizontal)
  function makeConical(innerR, height, slopePct, baseZ, color=0x99cc66) {
    const steps = 16, group = new THREE.Group();
    const run = height / (slopePct/100); // ex.: 100 m @ 5% = 2000 m
    for (let i=0;i<steps;i++){
      const t0 = i/steps, t1 = (i+1)/steps;
      const r0 = innerR + run*t0;
      const r1 = innerR + run*t1;
      const z  = baseZ + height*t1; // sobe linearmente até “height”
      group.add(ringMesh(r0, r1, z, color));
    }
    return group;
  }
  function pointObstacle(x,y,h,color=0x222222) {
    const geo = new THREE.CylinderGeometry(6,6, Math.max(1,h), 12);
    const mat = new THREE.MeshPhongMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, h/2, y);
    return m;
  }
  function gridTerrain(zGrid, cell, originX, originY, baseZ=0) {
    const group = new THREE.Group();
    const rows = zGrid.length, cols = zGrid[0].length;
    const material = new THREE.MeshBasicMaterial({ wireframe:true, transparent:true, opacity:0.25 });
    for (let r=0;r<rows-1;r++){
      for (let c=0;c<cols-1;c++){
        const x0 = originX + c*cell, y0 = originY + r*cell;
        const h00=zGrid[r][c], h01=zGrid[r][c+1], h10=zGrid[r+1][c], h11=zGrid[r+1][c+1];
        const geo = new THREE.BufferGeometry();
        const verts = new Float32Array([
          x0,      h00+baseZ, y0,
          x0+cell, h01+baseZ, y0,
          x0+cell, h11+baseZ, y0+cell,
          x0,      h00+baseZ, y0,
          x0+cell, h11+baseZ, y0+cell,
          x0,      h10+baseZ, y0+cell
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        geo.computeVertexNormals();
        group.add(new THREE.Mesh(geo, material));
      }
    }
    return group;
  }

  function init3D(container){
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    container.innerHTML=''; container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, 16/9, 1, 200000);
    camera.position.set(1500, 1200, 1500);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.8);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(1000,2000,800);
    scene.add(dir);

    const base = new THREE.Group();
    base.add(makeGrid(8000, 500));
    scene.add(base);

    const surfaces = new THREE.Group();
    surfaces.name = 'surfaces';
    scene.add(surfaces);

    function addSurface(kind, opts) {
      let mesh = null;
      if (kind === 'ihs') {
        mesh = makeDisc(opts.radius, opts.z, 0x6699ff);
      } else if (kind === 'conical') {
        mesh = makeConical(opts.innerRadius, opts.height, opts.slopePct, opts.baseZ, 0x99cc66);
      } else if (kind === 'strip') {
        const sh = flatPolygonToShape(opts.poly);
        mesh = extrudeUp(sh, 0.3, 0x333333);
      } else if (kind === 'approachA' || kind === 'approachB') {
        mesh = makeRamp(opts.poly, opts.h0, opts.slopePct, 0xff9955);
      }
      if (mesh) { mesh.userData.surface = true; surfaces.add(mesh); }
    }
    function addObstacle(x,y,h){ const m = pointObstacle(x,y,h); m.userData.surface = true; surfaces.add(m); }
    function addTerrain(zGrid, cell, originX, originY, baseZ){ const g = gridTerrain(zGrid, cell, originX, originY, baseZ); g.userData.surface = true; surfaces.add(g); }
    function clearSurfaces(){ for (let i=surfaces.children.length-1;i>=0;i--) surfaces.remove(surfaces.children[i]); }
    function setYaw(rad){ surfaces.rotation.y = rad; }

    function setSize(){
      const w = container.clientWidth || container.offsetWidth || 800;
      const h = container.clientHeight || Math.round(w*9/16) || 450;
      renderer.setSize(w,h,false);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    }
    requestAnimationFrame(setSize);
    const ro = new ResizeObserver(()=>setSize());
    ro.observe(container);
    window.addEventListener('resize', setSize);

    function render(){ controls.update(); renderer.render(scene, camera); requestAnimationFrame(render); }
    requestAnimationFrame(render);

    function snapshotPNG(){ return renderer.domElement.toDataURL('image/png'); }
    function zoomBy(factor){
      const v = new THREE.Vector3().subVectors(camera.position, controls.target).multiplyScalar(factor);
      camera.position.copy(new THREE.Vector3().addVectors(controls.target, v));
    }
    function fitToSurfaces(){
      const s = scene.getObjectByName('surfaces'); if (!s) return;
      const box = new THREE.Box3().setFromObject(s);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const dist = sphere.radius / Math.tan((camera.fov * Math.PI / 180) / 2);
      const dir  = new THREE.Vector3(1,0,1).normalize();
      controls.target.copy(sphere.center);
      camera.position.copy(new THREE.Vector3().addVectors(sphere.center, dir.multiplyScalar(dist*1.3)));
      camera.updateProjectionMatrix();
    }

    return {scene, addSurface, addObstacle, addTerrain, clearSurfaces, camera, renderer, controls, snapshotPNG, setYaw, zoomBy, fitToSurfaces};
  }

  window.OLS3D = { init3D };
})();
