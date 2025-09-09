
// public/modules/ols-3d.js
(function(){
  function init3D(container){
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

    function addSurface(s, color, elev0, tab){
      const shape = new THREE.Shape();
      const pts = [s.inner[0], s.inner[1], s.outer[1], s.outer[0]].map(p => new THREE.Vector2(p[0], p[1]));
      shape.moveTo(pts[0].x, pts[0].y);
      for(let i=1;i<pts.length;i++) shape.lineTo(pts[i].x, pts[i].y);
      shape.lineTo(pts[0].x, pts[0].y);
      const len = Math.hypot(s.outerCenter[0]-s.innerCenter[0], s.outerCenter[1]-s.innerCenter[1]);
      const slope = (s.type==='Take-off climb') ? tab.takeoffParams(window._lastParams.code).slope
                  : (s.type==='Approach') ? tab.approachParams(window._lastParams.code, window._lastParams.klass).slope1
                  : (s.type==='Inner approach' ? (tab.innerApproach(window._lastParams.code, window._lastParams.klass)||{}).slope : 0.02);
      const height = len * slope;
      const geom = new THREE.ExtrudeGeometry(shape, {depth: height, bevelEnabled:false});
      const mat = new THREE.MeshLambertMaterial({color, transparent:true, opacity:0.35});
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = -Math.PI/2;
      mesh.position.z = elev0||0;
      mesh.userData.surface = true;
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

    function clearSurfaces(){
      scene.children = scene.children.filter(o => !(o.userData && o.userData.surface));
    }

    function render(){ controls.update(); renderer.render(scene, camera); requestAnimationFrame(render); }
    requestAnimationFrame(render);

    return {scene, addSurface, addObstacle, clearSurfaces, camera, renderer};
  }
  window.OLS3D = { init3D };
})();
