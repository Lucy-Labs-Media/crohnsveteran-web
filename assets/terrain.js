/* Home hero: flight over a dawn horizon (three.js). Loads only on the home page. */
(function () {
  "use strict";
  var canvas = document.getElementById("terrain");
  var hero = document.querySelector(".hero");
  if (!canvas || !hero) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* Scroll progress through the hero drives the camera and the hero text fade */
  var heroScroll = 0;
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY || 0;
      var s = Math.min(Math.max(y / hero.offsetHeight, 0), 1);
      hero.style.setProperty("--hs", s.toFixed(3));
      heroScroll = s;
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  s.async = true;
  s.onload = function () { try { initTerrain(); } catch (err) { /* CSS sky remains as fallback */ } };
  document.head.appendChild(s);

  function initTerrain() {
    var THREE = window.THREE;
    if (!THREE) return;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
    } catch (e) { return; }

    var small = window.matchMedia("(max-width: 760px)").matches;
    var PR = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    renderer.setPixelRatio(PR);
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
    var look = new THREE.Vector3();

    var COLS = small ? 110 : 220, ROWS = small ? 160 : 230;
    var W = small ? 40 : 76, D = 62;
    var pos = new Float32Array(COLS * ROWS * 3), i = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        pos[i++] = (c / (COLS - 1) - 0.5) * W;
        pos[i++] = 0;
        pos[i++] = 3 - (r / (ROWS - 1)) * D;
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    var uniforms = {
      uTime: { value: 0 },
      uPR: { value: PR },
      uLow: { value: new THREE.Color("#7C5BD6") },
      uHigh: { value: new THREE.Color("#DCCEFF") },
      uDawn: { value: new THREE.Color("#FFC29E") }
    };

    var vert = [
      "uniform float uTime;",
      "uniform float uPR;",
      "varying float vElev;",
      "varying float vDepth;",
      "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }",
      "float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);",
      "  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y); }",
      "float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int k = 0; k < 5; k++){ v += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }",
      "void main(){",
      "  vec3 p = position;",
      "  vec2 q = vec2(p.x*0.11, (p.z - uTime)*0.11);",
      "  float h = fbm(q);",
      "  float ridge = smoothstep(1.5, 12.0, abs(p.x));",
      "  float elev = pow(h, 1.8) * (0.6 + ridge*3.2);",
      "  p.y = elev*2.4 - 1.2;",
      "  vec4 mv = modelViewMatrix * vec4(p, 1.0);",
      "  gl_Position = projectionMatrix * mv;",
      "  float depth = -mv.z;",
      "  gl_PointSize = uPR * clamp(22.0/depth, 1.0, 4.2);",
      "  vElev = clamp(elev, 0.0, 1.4);",
      "  vDepth = depth;",
      "}"
    ].join("\n");

    var frag = [
      "uniform vec3 uLow;",
      "uniform vec3 uHigh;",
      "uniform vec3 uDawn;",
      "varying float vElev;",
      "varying float vDepth;",
      "void main(){",
      "  vec2 c = gl_PointCoord - 0.5;",
      "  float d = length(c);",
      "  if (d > 0.5) discard;",
      "  float soft = smoothstep(0.5, 0.05, d);",
      "  vec3 col = mix(uLow, uHigh, smoothstep(0.1, 1.1, vElev));",
      "  float far = smoothstep(16.0, 52.0, vDepth);",
      "  col = mix(col, uDawn, far*0.75);",
      "  float fadeFar = 1.0 - smoothstep(42.0, 60.0, vDepth);",
      "  float fadeNear = smoothstep(0.8, 4.0, vDepth);",
      "  float a = soft * fadeFar * fadeNear * (0.5 + smoothstep(0.0, 1.2, vElev)*0.5);",
      "  gl_FragColor = vec4(col, a);",
      "}"
    ].join("\n");

    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    function resize() {
      var w = hero.clientWidth, h = hero.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (reduceMotion) renderStatic();
    }

    var px = 0, py = 0, tx = 0, ty = 0, travel = 0, last = performance.now(), raf = 0, running = false, shown = false;

    function place(sc) {
      camera.position.set(px * 1.3, 1.6 + sc * 1.4 - py * 0.35, 4);
      look.set(px * 0.5, -0.4 + sc * 7, -20);
      camera.lookAt(look);
    }
    function reveal() { if (!shown) { shown = true; canvas.classList.add("is-live"); } }
    function renderStatic() { place(0); renderer.render(scene, camera); reveal(); }

    function frame(now) {
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      travel += dt * (1.1 + heroScroll * 2.4);
      uniforms.uTime.value = travel;
      px += (tx - px) * 0.04;
      py += (ty - py) * 0.04;
      place(heroScroll);
      renderer.render(scene, camera);
      reveal();
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running || reduceMotion) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    if ("ResizeObserver" in window) { new ResizeObserver(resize).observe(hero); }
    else { window.addEventListener("resize", resize); }
    resize();

    if (reduceMotion) { renderStatic(); return; }

    if (finePointer) {
      window.addEventListener("pointermove", function (e) {
        tx = (e.clientX / window.innerWidth - 0.5) * 2;
        ty = (e.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });
    }

    var heroVisible = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        heroVisible = entries[0].isIntersecting;
        if (heroVisible && !document.hidden) start(); else stop();
      }).observe(hero);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else if (heroVisible) start();
    });
    start();
  }
})();
