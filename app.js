(function () {
  var TERM = {};
  TERMS.forEach(function (t) { TERM[t.id] = t; });

  var WELCOME = {
    group: "TRN4211",
    en: "General cargo ship",
    zh: "雜貨船",
    def: "It has a large and clear open cargo carrying space. Break Bulk Cargo is loaded / unloaded in a very time-consuming process.",
    note: "貨艙大而空敞，艙口裝有水密艙蓋，並設二層甲板（分隔貨物並改善穩性）、甲板起重機或吊桿。壓載艙用以保證吃水及螺旋槳全浸，艏尖艙與艉尖艙用以調整縱傾，雙層底則分成艙櫃。",
    model: "拖曳可旋轉船體。滾輪用以縮放。右鍵拖曳可平移。點選船上部件，或點選左側名稱。Cutaway 切開貨艙。Directions 顯示 port、starboard、bow、quarter。",
    source: "00_術語表_中英定義.md · General Cargo Ship；00_溫習清單.md · general cargo ship 特徵"
  };

  var HALF = 60;
  var WL = 7;
  var pickables = [];
  var hatchCovers = [];
  var mats = {};
  var selected = null;
  var hovered = null;
  var cutaway = false;
  var directions = false;
  var focusT = 0;
  var dragging = false;
  var drag = null;

  var state = { yaw: 0.95, pitch: 0.52, dist: 210, target: new THREE.Vector3(0, 4, 0) };
  var goal = {
    yaw: state.yaw,
    pitch: state.pitch,
    dist: state.dist,
    target: state.target.clone()
  };

  var stage = document.getElementById("stage");
  var canvas = document.getElementById("c");
  var labelLayer = document.getElementById("labels");
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x8ea4b8, 1);
  renderer.localClippingEnabled = true;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8ea4b8, 340, 980);
  var camera = new THREE.PerspectiveCamera(34, 1, 0.4, 1200);
  var clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 500);
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();

  var hemi = new THREE.HemisphereLight(0xd5e4f2, 0x6a5a48, 0.75);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff3dd, 1.15);
  sun.position.set(48, 72, 36);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 220;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.28));

  function halfBeam(z) {
    var zn = (z + HALF) / (HALF * 2);
    var k = 1;
    if (zn > 0.76) {
      var u = Math.min(1, (zn - 0.76) / 0.24);
      k = Math.pow(Math.cos(u * Math.PI / 2), 0.75);
    } else if (zn < 0.2) {
      var v = (0.2 - zn) / 0.2;
      k = 1 - 0.26 * v;
    }
    return Math.max(0.5, 9 * k);
  }

  function deckY(z) {
    var zn = z / HALF;
    return 10 + 1.45 * zn * zn;
  }

  function keelLift(z) {
    if (z < 44) return 0;
    var u = (z - 44) / (HALF - 44);
    return u * u * 3.4;
  }

  function sectionXY(z, h, H) {
    var hb = halfBeam(z);
    var lift = keelLift(z);
    var deck = deckY(z);
    var camber = 0.22;
    var bilgeR = Math.min(1.7, Math.max(0.12, hb * 0.42));
    var flat = Math.max(0.08, hb - bilgeR);
    var edgeY = deck - camber;
    var u = h / H;
    var x;
    var y;
    if (u <= 0.16) {
      var t = u / 0.16;
      x = hb * t;
      y = deck - camber * Math.pow(x / hb, 2);
      return [x, y];
    }
    if (u <= 0.58) {
      var t2 = (u - 0.16) / 0.42;
      x = hb;
      y = edgeY + (lift + bilgeR - edgeY) * t2;
      if (z > 34 && y > WL) {
        var fu = (z - 34) / 26;
        var fv = Math.min(1, (y - WL) / 4);
        x += 1.15 * fu * fu * fv;
      }
      return [x, y];
    }
    if (u <= 0.8) {
      var t3 = (u - 0.58) / 0.22;
      var theta = -t3 * Math.PI / 2;
      x = flat + Math.cos(theta) * bilgeR;
      y = lift + bilgeR + Math.sin(theta) * bilgeR;
      return [x, y];
    }
    var t4 = (u - 0.8) / 0.2;
    return [flat * (1 - t4), lift];
  }

  function hullRGB(y) {
    if (y < WL - 0.45) return [0.48, 0.16, 0.13];
    if (y < WL + 0.2) return [0.1, 0.11, 0.12];
    return [0.17, 0.24, 0.32];
  }

  function buildShell(z0, z1, segments, offset) {
    var H = 10;
    var ring = H * 2;
    var positions = [];
    var colors = [];
    var s;
    var a;
    for (s = 0; s < segments; s++) {
      var z = z0 + (z1 - z0) * (s / (segments - 1));
      for (a = 0; a < ring; a++) {
        var h;
        var sgn;
        if (a <= H) {
          h = a;
          sgn = 1;
        } else {
          h = ring - a;
          sgn = -1;
        }
        var xy = sectionXY(z, h, H);
        var x = xy[0] * sgn;
        if (offset) x += (x === 0 ? sgn : Math.sign(x)) * offset;
        var y = xy[1];
        positions.push(x, y, z);
        var rgb = hullRGB(y);
        colors.push(rgb[0], rgb[1], rgb[2]);
      }
    }
    var indices = [];
    for (s = 0; s < segments - 1; s++) {
      for (a = 0; a < ring; a++) {
        var b = (a + 1) % ring;
        var i0 = s * ring + a;
        var i1 = s * ring + b;
        var i2 = (s + 1) * ring + b;
        var i3 = (s + 1) * ring + a;
        indices.push(i0, i1, i3, i1, i2, i3);
      }
    }
    function addCap(station) {
      var cx = 0;
      var cy = 0;
      var cz = 0;
      var i;
      for (i = 0; i < ring; i++) {
        var vi = station * ring + i;
        cx += positions[vi * 3];
        cy += positions[vi * 3 + 1];
        cz += positions[vi * 3 + 2];
      }
      var center = positions.length / 3;
      positions.push(cx / ring, cy / ring, cz / ring);
      var rgb = hullRGB(cy / ring);
      colors.push(rgb[0], rgb[1], rgb[2]);
      for (i = 0; i < ring; i++) {
        var iA = station * ring + i;
        var iB = station * ring + ((i + 1) % ring);
        if (station === 0) indices.push(center, iA, iB);
        else indices.push(center, iB, iA);
      }
    }
    if (!offset) {
      addCap(0);
      addCap(segments - 1);
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function mat(name, color, opts) {
    if (mats[name]) return mats[name];
    opts = opts || {};
    var clip = !!opts.clip;
    var ghost = !!opts.ghost;
    var baseEmissive = opts.emissive || 0;
    var spec = {
      color: color,
      roughness: opts.roughness == null ? 0.68 : opts.roughness,
      metalness: opts.metalness == null ? 0.08 : opts.metalness
    };
    if (opts.transparent) spec.transparent = true;
    if (opts.opacity != null) spec.opacity = opts.opacity;
    if (opts.depthWrite === false) spec.depthWrite = false;
    if (opts.map) spec.map = opts.map;
    if (opts.side) spec.side = opts.side;
    if (opts.vertexColors) spec.vertexColors = opts.vertexColors;
    if (opts.emissive) spec.emissive = opts.emissive;
    if (opts.emissiveIntensity != null) spec.emissiveIntensity = opts.emissiveIntensity;
    var material = new THREE.MeshStandardMaterial(spec);
    if (clip) material.clippingPlanes = [clipPlane];
    material.userData.ghost = ghost;
    material.userData.baseEmissive = baseEmissive;
    if (ghost) {
      material.transparent = true;
      material.opacity = 0;
      material.depthWrite = false;
    }
    mats[name] = material;
    return material;
  }

  function track(mesh, term, mode, tags) {
    mesh.userData.term = term;
    mesh.userData.mode = mode || "always";
    mesh.userData.tags = tags || [];
    var ghost = mesh.material && mesh.material.userData && mesh.material.userData.ghost;
    mesh.castShadow = !ghost;
    mesh.receiveShadow = !ghost;
    pickables.push(mesh);
    scene.add(mesh);
    return mesh;
  }

  function addBox(sx, sy, sz, x, y, z, material, term, mode, tags) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    return track(mesh, term, mode, tags);
  }

  function paintHull() {
    var hullMat = new THREE.MeshStandardMaterial({
      vertexColors: THREE.VertexColors,
      roughness: 0.74,
      metalness: 0.06,
      side: THREE.DoubleSide
    });
    hullMat.clippingPlanes = [clipPlane];
    hullMat.userData.ghost = false;
    hullMat.userData.baseEmissive = 0;
    var hull = new THREE.Mesh(buildShell(-HALF, HALF, 72, 0), hullMat);
    hull.castShadow = true;
    hull.receiveShadow = true;
    track(hull, "hull", "always");

    var bowMat = mat("bow-ghost", 0xe2b15c, { ghost: true });
    track(new THREE.Mesh(buildShell(16, HALF, 28, 0.28), bowMat), "bow", "always", ["on-the-bow"]);
    var quarterMat = mat("quarter-ghost", 0xe2b15c, { ghost: true });
    track(new THREE.Mesh(buildShell(-HALF, -16, 28, 0.28), quarterMat), "quarter", "always", ["on-the-quarter"]);
  }

  function addBulb() {
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), mat("bulb", 0x7a2e24, { roughness: 0.6 }));
    bulb.scale.set(2.5, 1.7, 4.4);
    bulb.position.set(0, 2.55, 57.5);
    track(bulb, "hull");
  }

  function addKeelAndBilge() {
    addBox(1.15, 0.42, 100, 0, -0.12, -2, mat("keel", 0x4a241c, { roughness: 0.8 }), "keel");
    addBox(0.28, 0.62, 44, 8.55, 1.15, 0, mat("bilge", 0x5c4038), "bilge-keel");
    addBox(0.28, 0.62, 44, -8.55, 1.15, 0, mat("bilge", 0x5c4038), "bilge-keel");
    var foot = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 12), mat("foot", 0x6e3028));
    foot.scale.set(1.1, 0.8, 1.6);
    foot.position.set(0, 1.7, 52.5);
    track(foot, "forefoot");
  }

  function addEnds() {
    addBox(0.55, 8.2, 1.1, 0, 8.4, 61.1, mat("stem", 0x243244, { clip: true }), "stem");
    addBox(13.2, 10.4, 0.45, 0, 5.6, -60.5, mat("stern", 0x243244, { clip: true }), "stern");
    addBox(0.12, 5.5, 0.12, 0, 14.2, 62.2, mat("staff", 0xd7dde4), "jack-staff");
    addBox(0.12, 6.2, 0.12, 0, 16.4, -62.2, mat("staff", 0xd7dde4), "ensign-staff");
  }

  function addCastles() {
    addBox(12.4, 2.5, 20, 0, 12.3, 47, mat("castle", 0x3f5148, { clip: true, roughness: 0.9 }), "forecastle");
    addBox(15.2, 2.6, 28, 0, 12.35, -44, mat("castle", 0x3f5148, { clip: true, roughness: 0.9 }), "poop");
    addBox(15.4, 0.16, 52, 0, 10.22, 2, mat("deck", 0x5d6d5c, { clip: true, roughness: 0.94 }), "main-deck", "always", ["weather-deck"]);
    addBox(16, 0.45, 52, 0, 10.55, 2, mat("waist", 0xe2b15c, { ghost: true }), "waist", "select");
  }

  function addHouse() {
    var white = mat("house", 0xe7eef3, { clip: true, roughness: 0.55, metalness: 0.04 });
    addBox(11.5, 4.6, 16, 0, 15.6, -44, white, "superstructure");
    addBox(9.2, 2.8, 12, 0, 19.2, -43, white, "superstructure");
    addBox(14.2, 2.1, 7.2, 0, 21.6, -41.5, white, "bridge");
    addBox(12.6, 0.7, 0.25, 0, 21.7, -37.8, mat("glass", 0x17324a, { clip: true, metalness: 0.2, roughness: 0.2 }), "bridge");
    var funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 6.2, 16), mat("funnel", 0x243044, { roughness: 0.5 }));
    funnel.position.set(0, 22.2, -50.5);
    track(funnel, "funnel");
    addBox(2.2, 0.45, 2.2, 0, 25.4, -50.5, mat("funnel-cap", 0x8e2f2a), "funnel");
    var boatMat = mat("boat", 0xf7f4ee, { clip: true, roughness: 0.45 });
    [-1, 1].forEach(function (sgn) {
      var boat = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), boatMat);
      boat.scale.set(0.85, 0.7, 2.1);
      boat.position.set(sgn * 6.3, 18.15, -44);
      track(boat, "boat-deck");
    });
    addBox(14, 0.18, 6, 0, 17.7, -44, mat("boat-deck", 0xd5ddd8, { clip: true }), "boat-deck");
  }

  function addBulwarks() {
    var plate = mat("bulwark", 0x314155, { clip: true, roughness: 0.8 });
    var hole = mat("freeing", 0x12161c, { roughness: 1 });
    function run(z0, z1, xMul) {
      var z;
      for (z = z0; z <= z1; z += 4) {
        var y = deckY(z) + 0.35;
        var x = xMul * (halfBeam(Math.max(-50, Math.min(50, z))) - 0.15);
        addBox(0.16, 1.15, 3.6, x, y, z, plate, "bulwark");
        if (Math.abs(z) % 8 < 4) {
          addBox(0.2, 0.38, 1.25, x + xMul * 0.12, y - 0.38, z, hole, "freeing-port");
        }
      }
    }
    run(-24, 30, 1);
    run(-24, 30, -1);
  }

  function addHatches() {
    var hatches = [
      { z: 24, len: 8.5 },
      { z: 10, len: 8.5 },
      { z: -6, len: 8.5 },
      { z: -22, len: 8.5 }
    ];
    var width = 8;
    var coamH = 0.85;
    var deck = 10.28;
    hatches.forEach(function (h) {
      addBox(width - 0.5, 0.35, h.len - 0.5, 0, deck - 0.05, h.z, mat("opening", 0x1b140f), "hatch");
      var cover = addBox(width + 0.15, 0.26, h.len + 0.15, 0, deck + coamH + 0.08, h.z, mat("cover", 0x8e9694, { roughness: 0.82 }), "hatch-cover");
      cover.userData.restY = cover.position.y;
      hatchCovers.push(cover);
      addBox(0.26, coamH, h.len, -width / 2, deck + coamH / 2, h.z, mat("coaming", 0xd5dbd8, { clip: true }), "coaming");
      addBox(0.26, coamH, h.len, width / 2, deck + coamH / 2, h.z, mat("coaming", 0xd5dbd8, { clip: true }), "coaming");
      addBox(width, coamH, 0.26, 0, deck + coamH / 2, h.z - h.len / 2, mat("ledge", 0xc3cac7, { clip: true }), "head-ledge");
      addBox(width, coamH, 0.26, 0, deck + coamH / 2, h.z + h.len / 2, mat("ledge", 0xc3cac7, { clip: true }), "head-ledge");
      addBox(width - 0.8, 5.0, h.len - 0.7, 0, 4.55, h.z, mat("hold", 0xc4a574, { clip: true, roughness: 1, side: THREE.DoubleSide }), "hold", "cutaway");
      addBox(width - 0.35, 0.85, h.len - 0.35, 0, 7.5, h.z, mat("tween", 0xf3ead8, { clip: true, roughness: 0.9, side: THREE.DoubleSide }), "tween-deck", "cutaway");
      addBox(width - 1.05, 1.7, h.len - 1.05, 0, 8.85, h.z, mat("hold-upper", 0xd8c3a0, { clip: true, roughness: 1, side: THREE.DoubleSide }), "hold", "cutaway");
    });
    [-14, 2, 17, 30, -28].forEach(function (z) {
      addBox(13.5, 7.4, 0.22, 0, 5.8, z, mat("bulk", 0xd7dee6, { clip: true, roughness: 0.7, side: THREE.DoubleSide }), "bulkhead", "cutaway");
    });
  }

  function addTanks() {
    addBox(14.5, 1.65, 86, 0, 1.15, -2, mat("db", 0x2f6d62, { clip: true, roughness: 0.85, side: THREE.DoubleSide }), "double-bottom", "cutaway", ["ballast"]);
    addBox(8, 6.2, 10, 0, 4.6, 50, mat("peak", 0x2c6e90, { clip: true, roughness: 0.7, side: THREE.DoubleSide }), "fore-peak", "cutaway", ["ballast"]);
    addBox(10, 5.4, 9, 0, 4.2, -54, mat("peak", 0x2c6e90, { clip: true, roughness: 0.7, side: THREE.DoubleSide }), "aft-peak", "cutaway", ["ballast"]);
    addBox(12, 6.2, 12, 0, 5.4, -40, mat("er", 0x8a5a3c, { clip: true, roughness: 0.8, side: THREE.DoubleSide }), "engine-room", "cutaway");
    var engine = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 4.2, 12), mat("engine", 0x5c463c, { clip: true }));
    engine.position.set(0, 4.6, -40);
    track(engine, "engine-room", "cutaway");
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 14, 10), mat("shaft", 0xb9b3a4, { clip: true, metalness: 0.45, roughness: 0.35 }));
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 2.45, -52);
    track(shaft, "propeller", "cutaway");
  }

  function addGear() {
    var yellow = mat("crane", 0xe0a11b, { roughness: 0.42, metalness: 0.22 });
    var cab = mat("cab", 0x2a3038, { roughness: 0.4 });
    [16, -14].forEach(function (z) {
      addBox(1.7, 0.45, 1.7, 0, 10.55, z, yellow, "crane");
      addBox(1.05, 4.4, 1.05, 0, 12.9, z, yellow, "crane");
      addBox(1.55, 1.25, 1.55, 0.15, 15.35, z, cab, "crane");
      var jib = addBox(0.32, 0.32, 7.5, 0, 16.1, z + 2.6, yellow, "crane");
      jib.rotation.x = -0.45;
    });
    addBox(0.72, 11.5, 0.72, 0, 16.1, 30, mat("derrick", 0xddd6c8, { roughness: 0.6 }), "derrick");
    var boom = addBox(0.38, 0.38, 10, 0, 13.6, 35.5, mat("derrick", 0xddd6c8, { roughness: 0.6 }), "derrick");
    boom.rotation.x = 0.42;
    var hook = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat("hook", 0x22262c, { metalness: 0.4 }));
    hook.position.set(0, 11.6, 39.6);
    track(hook, "derrick");
    addBox(0.45, 14, 0.45, 0, 20.2, 48, mat("mast", 0xf2f5f7, { roughness: 0.45 }), "mast");
    addBox(4.2, 0.12, 0.12, 0, 24.5, 48, mat("mast", 0xf2f5f7, { roughness: 0.45 }), "mast");

    var gang = addBox(8.5, 0.12, 0.95, -13.2, 9.15, 6, mat("gang", 0xc2ad8e, { roughness: 0.8 }), "gangway");
    gang.rotation.z = 0.42;
    var ladder = addBox(11, 0.1, 0.8, -14.5, 8.6, -30, mat("ladder", 0xd5dbe3, { metalness: 0.25, roughness: 0.4 }), "accommodation-ladder");
    ladder.rotation.z = 0.55;
  }

  function addAnchor() {
    [-1, 1].forEach(function (sgn) {
      addBox(0.7, 1.5, 0.35, sgn * 2.3, 9.2, 55.5, mat("anchor", 0x2b3138, { metalness: 0.5, roughness: 0.4 }), "anchor");
      addBox(1.5, 0.28, 0.28, sgn * 2.3, 8.5, 55.5, mat("anchor", 0x2b3138, { metalness: 0.5, roughness: 0.4 }), "anchor");
      var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 2.8, 12), mat("hawse", 0x14181c));
      pipe.position.set(sgn * 2.5, 8.4, 56.6);
      pipe.rotation.x = 1.15;
      pipe.rotation.z = sgn * 0.4;
      track(pipe, "hawsepipe");
    });
  }

  function addPropulsion() {
    var bronze = mat("prop", 0xc6a15a, { metalness: 0.62, roughness: 0.32 });
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 14), bronze);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(0, 2.5, -63.4);
    track(hub, "propeller");
    var i;
    for (i = 0; i < 4; i++) {
      var blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.35, 0.72), bronze);
      blade.position.set(0, 2.5, -63.4);
      blade.rotation.z = (i * Math.PI) / 2 + 0.3;
      track(blade, "propeller");
    }
    var tail = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.4, 10), bronze);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 2.5, -61.6);
    track(tail, "propeller");
    addBox(0.28, 4.4, 1.7, 0, 2.7, -66.1, mat("rudder", 0x8d9398, { metalness: 0.35, roughness: 0.4 }), "rudder");
    addBox(0.38, 5.2, 0.38, 0, 4.2, -65.2, mat("post", 0x5e666c, { metalness: 0.3 }), "rudder-post");
  }

  function canvasTex(draw) {
    var c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    draw(c.getContext("2d"), c);
    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function addMarks() {
    var z;
    for (z = -56; z <= 56; z += 4) {
      [-1, 1].forEach(function (sgn) {
        var x = sgn * (halfBeam(z) + 0.22);
        addBox(0.12, 0.16, 3.4, x, WL, z, mat("wl", 0xf4f7f2, { roughness: 0.4 }), "waterline");
      });
    }
    addBox(0.12, 6.2, 0.12, halfBeam(48) + 0.35, 4.2, 48, mat("dim", 0xf0d48a), "draught");
    addBox(0.8, 0.08, 0.08, halfBeam(48) + 0.7, WL, 48, mat("dim", 0xf0d48a), "draught");
    addBox(0.8, 0.08, 0.08, halfBeam(48) + 0.7, 1.2, 48, mat("dim", 0xf0d48a), "draught");
    addBox(0.12, 3.3, 0.12, -(halfBeam(0) + 0.4), 8.55, 0, mat("fb", 0xf0d48a), "freeboard");
    addBox(0.7, 0.08, 0.08, -(halfBeam(0) + 0.75), WL, 0, mat("fb", 0xf0d48a), "freeboard");
    addBox(0.7, 0.08, 0.08, -(halfBeam(0) + 0.75), 10.15, 0, mat("fb", 0xf0d48a), "freeboard");

    var marks = canvasTex(function (g) {
      g.clearRect(0, 0, 256, 256);
      g.fillStyle = "#f7f9fb";
      g.font = "bold 48px Georgia";
      g.textAlign = "center";
      ["10", "8", "6", "4"].forEach(function (n, i) {
        g.fillText(n, 128, 48 + i * 58);
      });
    });
    var markMat = mat("draft-tex", 0xffffff, { map: marks, transparent: true, roughness: 1, depthWrite: false });
    [[46, 1], [46, -1], [-52, 1], [-52, -1], [-8, 1], [-8, -1]].forEach(function (pair) {
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 5.6), markMat);
      var sgn = pair[1];
      plane.position.set(sgn * (halfBeam(pair[0]) + 0.18), 7, pair[0]);
      plane.rotation.y = sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
      track(plane, "draught-marks");
    });

    var disc = canvasTex(function (g) {
      g.clearRect(0, 0, 256, 256);
      g.strokeStyle = "#f7f9fb";
      g.lineWidth = 14;
      g.beginPath();
      g.arc(128, 128, 70, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(28, 128);
      g.lineTo(228, 128);
      g.stroke();
    });
    var plimsollMat = mat("plimsoll", 0xffffff, { map: disc, transparent: true, roughness: 1, depthWrite: false });
    [-1, 1].forEach(function (sgn) {
      var plane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), plimsollMat);
      plane.position.set(sgn * (halfBeam(6) + 0.16), 8.15, 6);
      plane.rotation.y = sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
      track(plane, "load-line");
      addBox(0.08, 0.12, 1.5, sgn * (halfBeam(6) + 0.2), 9.7, 6, mat("deckline", 0xf7f9fb), "deck-line");
    });

    addBox(2.4, 0.28, 0.7, 0, 10.85, 0, mat("camber", 0xf0c36a), "camber", "select");
    addBox(2.2, 0.16, 0.7, -4.2, 10.62, 0, mat("camber", 0xf0c36a), "camber", "select");
    addBox(2.2, 0.16, 0.7, 4.2, 10.62, 0, mat("camber", 0xf0c36a), "camber", "select");
    [-50, -30, -10, 10, 30, 48].forEach(function (z) {
      addBox(0.2, 0.2, 3.2, -(halfBeam(z) - 0.8), deckY(z) + 0.15, z, mat("sheer", 0xf0c36a), "sheer", "select");
    });
    [40, 48, 54].forEach(function (z) {
      [-1, 1].forEach(function (sgn) {
        addBox(0.35, 1.4, 2.2, sgn * (halfBeam(z) + 0.45), 9.2, z, mat("flare", 0xf0c36a), "flare", "select");
      });
    });
  }

  function addDirections() {
    function wash(sgn, term, color) {
      var z;
      for (z = -54; z <= 54; z += 6) {
        addBox(0.28, 0.32, 5, sgn * (halfBeam(z) + 0.5), deckY(z) + 0.85, z, mat(term + "-wash", color, { ghost: true }), term, "directions");
      }
      var light = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), mat(term + "-light", color, {
        emissive: color,
        emissiveIntensity: 0.9,
        roughness: 0.35
      }));
      light.position.set(sgn * 1.8, 12.8, 58.5);
      track(light, term, "directions");
    }
    // Bow is +Z. Facing +Z, the right hand is −X, so starboard is −X and port is +X.
    wash(1, "port", 0xc0392b);
    wash(-1, "starboard", 0x1e8f45);
    addBox(0.22, 0.22, 8, 0, 15.2, 18, mat("fwd", 0xf3e2a8, { emissive: 0xf3e2a8, emissiveIntensity: 0.4 }), "forward", "directions");
    addBox(0.7, 0.18, 1.1, 0, 15.2, 22.4, mat("fwd", 0xf3e2a8, { emissive: 0xf3e2a8, emissiveIntensity: 0.4 }), "forward", "directions");
    addBox(0.22, 0.22, 8, 0, 15.2, -8, mat("aft", 0xf3e2a8, { emissive: 0xf3e2a8, emissiveIntensity: 0.4 }), "aft", "directions");
    addBox(0.7, 0.18, 1.1, 0, 15.2, -12.4, mat("aft", 0xf3e2a8, { emissive: 0xf3e2a8, emissiveIntensity: 0.4 }), "aft", "directions");
    addBox(0.2, 2.2, 0.2, 0, 11.2, 0, mat("amid", 0xf7f9fb, { emissive: 0xf7f9fb, emissiveIntensity: 0.3 }), "amidships", "directions");
    addBox(1.4, 0.12, 0.12, -2.2, 8, 52, mat("rel", 0xf7f9fb), "ahead", "directions");
    addBox(1.4, 0.12, 0.12, -2.2, 8, -58, mat("rel", 0xf7f9fb), "astern", "directions");
    addBox(0.12, 0.12, 1.4, -16, 8, 0, mat("rel", 0xf7f9fb), "abeam", "directions");
    addBox(0.12, 0.12, 1.4, 16, 8, 0, mat("rel", 0xf7f9fb), "abeam", "directions");
  }

  var waterMesh = null;
  function addWater() {
    var water = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshStandardMaterial({
        color: 0x1a5674,
        transparent: true,
        opacity: 0.55,
        roughness: 0.18,
        metalness: 0.08,
        depthWrite: false
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WL;
    water.receiveShadow = true;
    scene.add(water);
    waterMesh = water;
  }

  paintHull();
  addBulb();
  addKeelAndBilge();
  addEnds();
  addCastles();
  addHouse();
  addBulwarks();
  addHatches();
  addTanks();
  addGear();
  addAnchor();
  addPropulsion();
  addMarks();
  addDirections();
  addWater();

  var LABEL_POS = [
    { id: "port", x: 16, y: 13, z: 4 },
    { id: "starboard", x: -16, y: 13, z: 4 },
    { id: "bow", x: 0, y: 15, z: 64 },
    { id: "quarter", x: -12, y: 12, z: -42 },
    { id: "forward", x: 0, y: 16.4, z: 20 },
    { id: "aft", x: 0, y: 16.4, z: -10 },
    { id: "ahead", x: 0, y: 9, z: 74 },
    { id: "astern", x: 0, y: 9, z: -74 },
    { id: "abeam", x: -20, y: 9, z: 0 },
    { id: "on-the-bow", x: -11, y: 10, z: 50 },
    { id: "on-the-quarter", x: 11, y: 10, z: -40 },
    { id: "amidships", x: 0, y: 13.2, z: 0 }
  ];
  var labelEls = {};
  LABEL_POS.forEach(function (item) {
    var el = document.createElement("div");
    el.className = "label";
    el.textContent = TERM[item.id].en;
    labelLayer.appendChild(el);
    labelEls[item.id] = el;
  });
  var labelVec = new THREE.Vector3();

  function meshMatches(mesh, id) {
    if (!id || !mesh) return false;
    return mesh.userData.term === id || mesh.userData.tags.indexOf(id) !== -1;
  }

  function isShown(mesh) {
    var mode = mesh.userData.mode;
    var on = meshMatches(mesh, selected);
    if (mode === "cutaway") return cutaway || on;
    if (mode === "directions") return directions || on;
    if (mode === "select") return on;
    return true;
  }

  function applyVisibility() {
    pickables.forEach(function (mesh) {
      mesh.visible = isShown(mesh);
    });
  }

  function applyHighlight() {
    var seen = [];
    pickables.forEach(function (mesh) {
      var material = mesh.material;
      if (!material || seen.indexOf(material) !== -1) return;
      seen.push(material);
      var related = pickables.filter(function (p) { return p.material === material; });
      var on = related.some(function (p) { return meshMatches(p, selected); });
      var hover = related.some(function (p) { return p === hovered; });
      if (material.emissive) {
        if (on || hover) {
          material.emissive.setHex(0xd89a3a);
          material.emissiveIntensity = on ? 0.55 : 0.25;
        } else {
          material.emissive.setHex(material.userData.baseEmissive || 0);
          material.emissiveIntensity = material.userData.baseEmissive ? 0.85 : 0;
        }
      }
      if (material.userData.ghost) {
        var directional = related.some(function (p) { return p.userData.mode === "directions"; });
        if (directional) material.opacity = on ? 0.82 : 0.5;
        else material.opacity = on ? 0.32 : hover ? 0.16 : 0;
      }
    });
  }

  function updateCamera() {
    var cp = Math.cos(state.pitch);
    camera.position.set(
      state.target.x + state.dist * cp * Math.sin(state.yaw),
      state.target.y + state.dist * Math.sin(state.pitch),
      state.target.z + state.dist * cp * Math.cos(state.yaw)
    );
    camera.lookAt(state.target);
  }

  function approachAngle(cur, next, t) {
    var d = next - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return cur + d * t;
  }

  function focusOn(id) {
    var box = new THREE.Box3();
    var n = 0;
    pickables.forEach(function (mesh) {
      if (!meshMatches(mesh, id)) return;
      var prev = mesh.visible;
      mesh.visible = true;
      box.expandByObject(mesh);
      mesh.visible = prev;
      n += 1;
    });
    if (!n || box.isEmpty()) return;
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3()).length();
    goal.target.copy(center);
    goal.dist = Math.max(40, Math.min(220, size * 1.85));
    goal.pitch = 0.58;
    if (center.z > 28) goal.yaw = 0.45;
    else if (center.z < -28) goal.yaw = 2.55;
    else goal.yaw = center.x >= 0 ? 1.05 : -1.05;
    if (TERM[id] && TERM[id].cutaway) {
      goal.yaw = Math.PI / 2;
      goal.pitch = 0.24;
      goal.dist = Math.max(36, Math.min(62, size * 0.95));
      goal.target.set(0, Math.max(4.2, Math.min(7.2, center.y)), center.z);
    }
    snapGoal();
  }

  function snapGoal() {
    state.target.copy(goal.target);
    state.dist = goal.dist;
    state.yaw = goal.yaw;
    state.pitch = goal.pitch;
    focusT = 0;
    updateCamera();
    renderer.render(scene, camera);
  }

  function renderDetail(id) {
    var data = id ? TERM[id] : WELCOME;
    document.getElementById("d-group").textContent = data.group;
    document.getElementById("d-en").textContent = data.en;
    document.getElementById("d-zh").textContent = data.zh;
    setBlock("d-def-wrap", "d-def", data.def);
    setBlock("d-note-wrap", "d-note", data.note);
    setBlock("d-model-wrap", "d-model", data.model);
    document.getElementById("d-source").textContent = data.source || "";
  }

  function setBlock(wrapId, textId, value) {
    var wrap = document.getElementById(wrapId);
    if (!value) {
      wrap.hidden = true;
      document.getElementById(textId).textContent = "";
      return;
    }
    wrap.hidden = false;
    document.getElementById(textId).textContent = value;
  }

  function renderList() {
    var q = document.getElementById("q").value.trim().toLowerCase();
    var root = document.getElementById("groups");
    root.innerHTML = "";
    ["Directions", "Hull", "Decks", "Cargo", "Gear", "Marks"].forEach(function (group) {
      var items = TERMS.filter(function (t) {
        if (t.group !== group) return false;
        if (!q) return true;
        return (t.en + " " + t.zh + " " + t.id).toLowerCase().indexOf(q) !== -1;
      });
      if (!items.length) return;
      var section = document.createElement("section");
      section.className = "group";
      var heading = document.createElement("h2");
      heading.textContent = group;
      section.appendChild(heading);
      items.forEach(function (t) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "term";
        if (selected === t.id) button.setAttribute("aria-current", "true");
        var en = document.createElement("span");
        en.className = "en";
        en.textContent = t.en;
        var zh = document.createElement("span");
        zh.className = "zh";
        zh.textContent = t.zh;
        button.appendChild(en);
        button.appendChild(zh);
        button.addEventListener("click", function () { select(t.id); });
        section.appendChild(button);
      });
      root.appendChild(section);
    });
  }

  function select(id) {
    selected = id;
    var term = TERM[id];
    if (term && term.cutaway) setCutaway(true, true);
    else if (cutaway) setCutaway(false, true);
    if (term && term.directions) setDirections(true, true);
    else if (directions) setDirections(false, true);
    focusOn(id);
    renderDetail(id);
    renderList();
    applyVisibility();
    applyHighlight();
    renderer.render(scene, camera);
  }

  function placeCovers() {
    hatchCovers.forEach(function (cover) {
      cover.position.x = cutaway ? 11.5 : 0;
      cover.position.y = cutaway ? 13.4 : cover.userData.restY;
    });
  }

  function setCutaway(on, keepSelection) {
    cutaway = on;
    clipPlane.constant = on ? 0.15 : 500;
    if (waterMesh) waterMesh.material.opacity = on ? 0.08 : 0.55;
    placeCovers();
    document.getElementById("cutaway").setAttribute("aria-pressed", on ? "true" : "false");
    if (on && !keepSelection) {
      goal.yaw = Math.PI / 2;
      goal.pitch = 0.24;
      goal.dist = 62;
      goal.target.set(0, 6, 2);
      snapGoal();
    }
    if (!keepSelection) {
      applyVisibility();
      applyHighlight();
    }
  }

  function setDirections(on, keepSelection) {
    directions = on;
    document.getElementById("directions").setAttribute("aria-pressed", on ? "true" : "false");
    if (!keepSelection) {
      applyVisibility();
      applyHighlight();
    }
  }

  function resize() {
    var w = stage.clientWidth || 1;
    var h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function raycast(event) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var visible = pickables.filter(function (mesh) { return mesh.visible; });
    var hits = raycaster.intersectObjects(visible, false);
    return hits.length ? hits[0].object : null;
  }

  function pan(dx, dy) {
    var right = new THREE.Vector3();
    var up = new THREE.Vector3();
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    state.target.addScaledVector(right, -dx * state.dist * 0.0011);
    state.target.addScaledVector(up, dy * state.dist * 0.0011);
    goal.target.copy(state.target);
  }

  canvas.addEventListener("pointerdown", function (event) {
    dragging = true;
    drag = { x: event.clientX, y: event.clientY, ox: event.clientX, oy: event.clientY, button: event.button };
    focusT = 0;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", function (event) {
    var moved = drag ? Math.hypot(event.clientX - drag.ox, event.clientY - drag.oy) : 99;
    var button = drag ? drag.button : 0;
    dragging = false;
    drag = null;
    if (button === 0 && moved < 5) {
      var hit = raycast(event);
      if (hit && hit.userData.term) select(hit.userData.term);
    }
  });
  canvas.addEventListener("pointermove", function (event) {
    if (!dragging || !drag) {
      var hit = raycast(event);
      var next = hit && hit.userData.term ? hit : null;
      if (next !== hovered) {
        hovered = next;
        canvas.style.cursor = next ? "pointer" : "grab";
        applyHighlight();
      }
      return;
    }
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (event.buttons === 2 || drag.button === 2) pan(dx, dy);
    else {
      state.yaw -= dx * 0.005;
      state.pitch = Math.max(-0.2, Math.min(1.15, state.pitch + dy * 0.004));
      goal.yaw = state.yaw;
      goal.pitch = state.pitch;
    }
  });
  canvas.addEventListener("wheel", function (event) {
    event.preventDefault();
    state.dist = Math.max(16, Math.min(170, state.dist * Math.exp(event.deltaY * 0.0012)));
    goal.dist = state.dist;
    focusT = 0;
  }, { passive: false });
  canvas.addEventListener("contextmenu", function (event) { event.preventDefault(); });

  document.getElementById("cutaway").addEventListener("click", function () {
    setCutaway(!cutaway, false);
  });
  document.getElementById("directions").addEventListener("click", function () {
    setDirections(!directions, false);
  });
  document.getElementById("reset").addEventListener("click", function () {
    selected = null;
    hovered = null;
    setCutaway(false, true);
    setDirections(false, true);
    goal.target.set(0, 4, 0);
    goal.dist = 210;
    goal.yaw = 0.95;
    goal.pitch = 0.52;
    focusT = 1;
    renderDetail(null);
    renderList();
    applyVisibility();
    applyHighlight();
  });
  document.getElementById("q").addEventListener("input", renderList);
  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") document.getElementById("reset").click();
  });
  window.addEventListener("resize", resize);

  function placeLabels() {
    var width = stage.clientWidth;
    var height = stage.clientHeight;
    LABEL_POS.forEach(function (item) {
      var el = labelEls[item.id];
      var show = directions || selected === item.id;
      if (!show) {
        el.style.display = "none";
        return;
      }
      labelVec.set(item.x, item.y, item.z).project(camera);
      if (labelVec.z > 1) {
        el.style.display = "none";
        return;
      }
      el.style.display = "block";
      el.style.transform = "translate(-50%, -120%) translate(" + ((labelVec.x * 0.5 + 0.5) * width) + "px, " + ((-labelVec.y * 0.5 + 0.5) * height) + "px)";
    });
  }

  function frame() {
    requestAnimationFrame(frame);
    if (focusT > 0 && !dragging) {
      state.target.lerp(goal.target, 0.12);
      state.dist += (goal.dist - state.dist) * 0.12;
      state.yaw = approachAngle(state.yaw, goal.yaw, 0.1);
      state.pitch += (goal.pitch - state.pitch) * 0.1;
      focusT *= 0.9;
      if (focusT < 0.02) focusT = 0;
    }
    updateCamera();
    renderer.render(scene, camera);
    placeLabels();
  }

  resize();
  renderDetail(null);
  renderList();
  applyVisibility();
  applyHighlight();
  updateCamera();
  frame();

  window.__ship = { select: select, TERM: TERM, pickables: pickables };
})();
