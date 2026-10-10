(function () {
  var TERM = {};
  TERMS.forEach(function (t) { TERM[t.id] = t; });

  var WELCOME = {
    group: "TRN4211",
    en: "Hatch and watertight door",
    zh: "艙口與水密門",
    def: "",
    note: "左側為水密門，右側為艙口一角。艙口、艙蓋、圍板與端樑在雜貨船頁已可點選；此頁將接合處放大。",
    model: "拖曳可旋轉。滾輪用以縮放。右鍵拖曳可平移。在圖上點選只會標示該部件，鏡頭與角度保持不動。點選左側名稱，鏡頭才會移近該處。",
    source: "00_術語表_中英定義.md · 艙口與水密門"
  };

  var GROUPS = ["Watertight door", "Hatchway"];
  var HOME = { yaw: 0.7, pitch: 0.5, x: -0.35, y: 1.15, z: 0.35 };
  var pickables = [];
  var mats = {};
  var selected = null;
  var hovered = null;
  var flight = null;
  var dragging = false;
  var drag = null;

  var state = { yaw: HOME.yaw, pitch: HOME.pitch, dist: 7.4, target: new THREE.Vector3(HOME.x, HOME.y, HOME.z) };
  var goal = {
    yaw: state.yaw,
    pitch: state.pitch,
    dist: state.dist,
    target: state.target.clone()
  };

  var stage = document.getElementById("stage");
  var canvas = document.getElementById("c");
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x8ea4b8, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(36, 1, 0.05, 80);
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();

  scene.add(new THREE.HemisphereLight(0xd5e4f2, 0x6a5a48, 0.85));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  var sun = new THREE.DirectionalLight(0xfff3dd, 1.05);
  sun.position.set(4, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 24;
  scene.add(sun);

  function mat(name, color) {
    if (mats[name]) return mats[name];
    var material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.55,
      metalness: 0.18
    });
    material.userData.baseEmissive = 0;
    mats[name] = material;
    return material;
  }

  function track(mesh, term) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (term) {
      mesh.userData.term = term;
      pickables.push(mesh);
    }
    return mesh;
  }

  function addBox(sx, sy, sz, x, y, z, material, term, parent) {
    var mesh = track(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material), term);
    mesh.position.set(x, y, z);
    (parent || scene).add(mesh);
    return mesh;
  }

  function addCyl(rTop, rBot, h, x, y, z, material, term, parent) {
    var mesh = track(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 16), material), term);
    mesh.position.set(x, y, z);
    (parent || scene).add(mesh);
    return mesh;
  }

  function addDog(parent, x, y, z, along) {
    var brass = mat("dog", 0xc8922a);
    addCyl(0.045, 0.045, 0.05, x, y, z, brass, "dog", parent);
    if (along === "y") addBox(0.04, 0.22, 0.035, x, y + 0.08, z + 0.03, brass, "dog", parent);
    else if (along === "x") addBox(0.22, 0.04, 0.035, x + 0.08, y, z + 0.03, brass, "dog", parent);
    else addBox(0.035, 0.04, 0.22, x, y, z + 0.1, brass, "dog", parent);
  }

  function addDoor() {
    var root = new THREE.Group();
    root.position.set(-2.55, 0, 0);
    scene.add(root);

    var frameMat = mat("frame", 0x314556);
    var doorMat = mat("door-leaf", 0x8ea0ae);
    addBox(1.78, 0.14, 0.2, 0, 0.07, 0, frameMat, "frame", root);
    addBox(1.78, 0.14, 0.2, 0, 2.2, 0, frameMat, "frame", root);
    addBox(0.14, 1.99, 0.2, -0.82, 1.135, 0, frameMat, "frame", root);
    addBox(0.14, 1.99, 0.2, 0.82, 1.135, 0, frameMat, "frame", root);

    var hingeMat = mat("hinge", 0xd7b56a);
    [0.42, 1.14, 1.86].forEach(function (y) {
      addCyl(0.05, 0.05, 0.2, -0.73, y, 0.1, hingeMat, "hinge", root);
      addBox(0.12, 0.16, 0.03, -0.8, y, 0.12, hingeMat, "hinge", root);
    });

    var leaf = new THREE.Group();
    leaf.position.set(-0.73, 0, 0.04);
    leaf.rotation.y = -1.05;
    root.add(leaf);
    addBox(1.4, 1.9, 0.07, 0.7, 1.135, 0, doorMat, null, leaf);

    var h = 0.85;
    var positions = new Float32Array([
      0, -h, -0.05,
      0, -h, 0.05,
      0.16, -h, 0,
      0, h, -0.05,
      0, h, 0.05,
      0.16, h, 0
    ]);
    var wedgeGeo = new THREE.BufferGeometry();
    wedgeGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    wedgeGeo.setIndex([
      0, 2, 1,
      3, 4, 5,
      0, 3, 5, 0, 5, 2,
      1, 2, 5, 1, 5, 4,
      0, 1, 4, 0, 4, 3
    ]);
    wedgeGeo.computeVertexNormals();
    var wedge = track(new THREE.Mesh(wedgeGeo, mat("wedge", 0x8a5a32)), "wedge");
    wedge.position.set(1.4, 1.135, 0);
    leaf.add(wedge);

    addDog(leaf, 1.28, 1.72, 0.05, "x");
    addDog(leaf, 1.28, 0.55, 0.05, "x");
    addDog(leaf, 0.7, 1.98, 0.05, "z");
    addDog(leaf, 0.7, 0.28, 0.05, "z");

    var hole = addCyl(0.2, 0.2, 0.04, 0.72, 1.48, 0.02, mat("manhole-hole", 0x1c2833), "escape-manhole", leaf);
    hole.rotation.x = Math.PI / 2;
    var coverPivot = new THREE.Group();
    coverPivot.position.set(0.52, 1.48, 0.07);
    coverPivot.rotation.y = -0.85;
    leaf.add(coverPivot);
    var cover = addCyl(0.2, 0.2, 0.04, 0.2, 0, 0, mat("manhole-cover", 0xd5dde6), "escape-manhole", coverPivot);
    cover.rotation.x = Math.PI / 2;
    var clip = mat("manhole-clip", 0xc8922a);
    addBox(0.08, 0.045, 0.07, 0.36, 0.05, 0, clip, "escape-manhole", coverPivot);
    addBox(0.08, 0.045, 0.07, 0.72, 1.28, -0.06, clip, "escape-manhole", leaf);
  }

  function addWingNut(x, y, z) {
    var brass = mat("wing-nut", 0xd7b56a);
    addCyl(0.03, 0.03, 0.14, x, y, z, brass, "wing-nut");
    addBox(0.2, 0.028, 0.055, x, y + 0.07, z, brass, "wing-nut");
    addBox(0.055, 0.028, 0.2, x, y + 0.07, z, brass, "wing-nut");
  }

  function addHatch() {
    var ox = 0.85;
    var deck = mat("deck", 0xcbb892);
    var coverMat = mat("cover", 0x6e7c88);
    addBox(1.15, 0.08, 2.15, ox - 0.64, 0.96, 0.72, deck, null);
    addBox(2.15, 0.08, 0.72, ox + 0.85, 0.96, -0.42, deck, null);
    addBox(1.55, 0.02, 1.45, ox + 0.9, 0.42, 0.78, mat("hold", 0x243140), null);

    addBox(0.08, 0.5, 1.7, ox, 1.2, 0.85, mat("coaming", 0x3c4e60), "coaming");
    addBox(1.72, 0.42, 0.08, ox + 0.86, 1.22, 0, mat("head-ledge", 0x516070), "head-ledge");
    addBox(1.6, 0.16, 0.16, ox + 0.9, 0.93, 0, mat("beam", 0x8d7344), "beam");
    addBox(1.6, 0.16, 0.16, ox + 0.9, 0.93, 0.85, mat("beam", 0x8d7344), "beam");
    addBox(0.12, 0.14, 0.85, ox + 0.55, 0.93, 0.42, mat("carling", 0xa68450), "carling");
    addBox(0.12, 0.14, 0.85, ox + 1.25, 0.93, 0.42, mat("carling", 0xa68450), "carling");

    addBox(1.35, 0.07, 0.62, ox + 0.75, 1.48, 1.15, coverMat, null);
    addWingNut(ox + 0.12, 1.58, 0.98);
    addWingNut(ox + 0.12, 1.58, 1.32);

    var clip = mat("double-clip", 0xb7c4ce);
    addBox(0.07, 0.32, 0.07, ox + 0.75, 1.48, 0.82, clip, "double-clip");
    addBox(0.2, 0.045, 0.07, ox + 0.75, 1.66, 0.82, clip, "double-clip");
    addBox(0.2, 0.045, 0.07, ox + 0.75, 1.3, 0.82, clip, "double-clip");

    addDog(scene, ox + 1.28, 1.58, 1.0, "z");
    addDog(scene, ox + 1.28, 1.58, 1.32, "z");
  }

  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshStandardMaterial({ color: 0xd5dde4, roughness: 0.92, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  addDoor();
  addHatch();

  function meshMatches(mesh, id) {
    return !!id && mesh.userData.term === id;
  }

  var flashColor = new THREE.Color(0xffd27a);

  function ensureBase(material) {
    var data = material.userData;
    if (data.baseColor) return;
    data.baseColor = material.color.clone();
    data.baseEmissiveColor = material.emissive.clone();
    data.baseIntensity = material.emissiveIntensity;
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
      material.userData.hot = on ? "on" : hover ? "hover" : "";
    });
    pulseHighlight(performance.now());
  }

  function pulseHighlight(now) {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var wave = reduce ? 0.78 : (Math.sin(now * 0.0025) + 1) / 2;
    var seen = [];
    pickables.forEach(function (mesh) {
      var material = mesh.material;
      if (!material || !material.color || seen.indexOf(material) !== -1) return;
      seen.push(material);
      ensureBase(material);
      var hot = material.userData.hot;
      if (hot === "on") {
        material.color.copy(material.userData.baseColor).lerp(flashColor, 0.16 + wave * 0.78);
        material.emissive.setHex(0xffb020);
        material.emissiveIntensity = 0.12 + wave * 1.85;
      } else if (hot === "hover") {
        material.color.copy(material.userData.baseColor).lerp(flashColor, 0.34);
        material.emissive.setHex(0xe0a24a);
        material.emissiveIntensity = 0.5;
      } else {
        material.color.copy(material.userData.baseColor);
        material.emissive.copy(material.userData.baseEmissiveColor);
        material.emissiveIntensity = material.userData.baseIntensity;
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

  function yawDelta(from, to) {
    var d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function beginFlight() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.target.copy(goal.target);
      state.dist = goal.dist;
      state.yaw = goal.yaw;
      state.pitch = goal.pitch;
      flight = null;
      updateCamera();
      return;
    }
    var delta = yawDelta(state.yaw, goal.yaw);
    var travel = Math.max(
      Math.abs(delta) / 1.4,
      Math.abs(goal.pitch - state.pitch) / 0.6,
      Math.abs(goal.dist - state.dist) / 8,
      state.target.distanceTo(goal.target) / 3
    );
    flight = {
      t0: performance.now(),
      dur: 320 + 680 * Math.min(1, travel),
      fromTarget: state.target.clone(),
      fromDist: state.dist,
      fromYaw: state.yaw,
      yawDelta: delta,
      fromPitch: state.pitch
    };
  }

  function stepFlight(now) {
    if (!flight) return;
    var t = Math.min(1, (now - flight.t0) / flight.dur);
    var e = 1 - Math.pow(1 - t, 3);
    state.target.lerpVectors(flight.fromTarget, goal.target, e);
    state.dist = flight.fromDist + (goal.dist - flight.fromDist) * e;
    state.yaw = flight.fromYaw + flight.yawDelta * e;
    state.pitch = flight.fromPitch + (goal.pitch - flight.fromPitch) * e;
    if (t >= 1) flight = null;
  }

  function focusOn(id) {
    var box = new THREE.Box3();
    var n = 0;
    pickables.forEach(function (mesh) {
      if (!meshMatches(mesh, id)) return;
      box.expandByObject(mesh);
      n += 1;
    });
    if (!n || box.isEmpty()) return;
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3()).length();
    goal.target.copy(center);
    goal.dist = Math.max(1.35, Math.min(10.5, size * 1.65));
    var hatch = id === "coaming" || id === "head-ledge" || id === "beam" || id === "carling" || id === "wing-nut" || id === "double-clip";
    if (id === "dog" || size > 2.2) {
      goal.pitch = 0.62;
      goal.yaw = 0.78;
      goal.dist = Math.max(goal.dist, 6.2);
    } else if (hatch) {
      goal.pitch = 0.72;
      goal.yaw = 0.85;
    } else {
      goal.pitch = 0.28;
      goal.yaw = 0.45;
    }
    beginFlight();
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
    var name = document.getElementById("detail-name");
    if (name) name.textContent = id ? data.zh : "";
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
    GROUPS.forEach(function (group) {
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
        button.addEventListener("click", function () { select(t.id, true); });
        section.appendChild(button);
      });
      root.appendChild(section);
    });
  }

  function select(id, fly) {
    selected = id;
    if (fly) {
      focusOn(id);
      if (window.matchMedia("(max-width: 860px)").matches) setSheet("");
    } else flight = null;
    renderDetail(id);
    renderList();
    applyHighlight();
    renderer.render(scene, camera);
  }

  function fitDist() {
    var aspect = (stage.clientWidth || 1) / Math.max(1, stage.clientHeight || 1);
    var tan = Math.tan((36 * Math.PI / 180) / 2);
    return Math.max(7.2, Math.min(24, 4.3 / (tan * aspect)));
  }

  function resize() {
    var w = stage.clientWidth || 1;
    var h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!selected && !dragging && !flight) {
      var dist = fitDist();
      state.dist = dist;
      goal.dist = dist;
    }
  }

  function raycast(event) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(pickables, false);
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

  var pointers = {};
  var pinch = null;
  var pinched = false;

  function pointerIds() {
    return Object.keys(pointers);
  }

  function rememberPinch() {
    var ids = pointerIds();
    if (ids.length < 2) {
      pinch = null;
      return;
    }
    var a = pointers[ids[0]];
    var b = pointers[ids[1]];
    pinch = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      camDist: state.dist
    };
    pinched = true;
    dragging = false;
  }

  canvas.addEventListener("pointerdown", function (event) {
    pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    flight = null;
    canvas.setPointerCapture(event.pointerId);
    if (pointerIds().length >= 2) rememberPinch();
    else {
      dragging = true;
      drag = {
        x: event.clientX,
        y: event.clientY,
        ox: event.clientX,
        oy: event.clientY,
        button: event.button,
        type: event.pointerType
      };
    }
  });

  function endPointer(event) {
    if (!pointers[event.pointerId]) return;
    var moved = drag ? Math.hypot(event.clientX - drag.ox, event.clientY - drag.oy) : 99;
    var button = drag ? drag.button : 0;
    var type = drag ? drag.type : "";
    var wasPinch = pinched;
    delete pointers[event.pointerId];
    if (pointerIds().length >= 2) rememberPinch();
    else pinch = null;
    if (pointerIds().length === 0) {
      dragging = false;
      drag = null;
      pinched = false;
      var limit = type === "touch" ? 16 : 5;
      if (!wasPinch && button === 0 && moved < limit) {
        var hit = raycast(event);
        if (hit && hit.userData.term) select(hit.userData.term, false);
      }
    }
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointermove", function (event) {
    if (!pointers[event.pointerId]) {
      var hit = raycast(event);
      var next = hit && hit.userData.term ? hit : null;
      if (next !== hovered) {
        hovered = next;
        canvas.style.cursor = next ? "pointer" : "grab";
        applyHighlight();
      }
      return;
    }
    pointers[event.pointerId].x = event.clientX;
    pointers[event.pointerId].y = event.clientY;
    if (pinch && pointerIds().length >= 2) {
      var ids = pointerIds();
      var a = pointers[ids[0]];
      var b = pointers[ids[1]];
      var dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      var cx = (a.x + b.x) / 2;
      var cy = (a.y + b.y) / 2;
      state.dist = Math.max(1.2, Math.min(24, pinch.camDist * (pinch.dist / dist)));
      goal.dist = state.dist;
      pan(cx - pinch.cx, cy - pinch.cy);
      pinch.dist = dist;
      pinch.cx = cx;
      pinch.cy = cy;
      pinch.camDist = state.dist;
      return;
    }
    if (!dragging || !drag) return;
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (event.buttons === 2 || drag.button === 2) pan(dx, dy);
    else {
      state.yaw -= dx * 0.005;
      state.pitch = Math.max(-0.15, Math.min(1.25, state.pitch + dy * 0.004));
      goal.yaw = state.yaw;
      goal.pitch = state.pitch;
    }
  });
  canvas.addEventListener("wheel", function (event) {
    event.preventDefault();
    state.dist = Math.max(1.2, Math.min(24, state.dist * Math.exp(event.deltaY * 0.0012)));
    goal.dist = state.dist;
    flight = null;
  }, { passive: false });
  canvas.addEventListener("contextmenu", function (event) { event.preventDefault(); });

  document.getElementById("reset").addEventListener("click", function () {
    selected = null;
    hovered = null;
    goal.target.set(HOME.x, HOME.y, HOME.z);
    goal.dist = fitDist();
    goal.yaw = HOME.yaw;
    goal.pitch = HOME.pitch;
    beginFlight();
    renderDetail(null);
    renderList();
    applyHighlight();
  });
  document.getElementById("q").addEventListener("input", renderList);

  function setSheet(which) {
    document.body.classList.toggle("show-list", which === "list");
    document.body.classList.toggle("show-detail", which === "detail");
    document.getElementById("open-list").setAttribute("aria-expanded", which === "list" ? "true" : "false");
    document.getElementById("open-detail").setAttribute("aria-expanded", which === "detail" ? "true" : "false");
  }
  document.getElementById("open-list").addEventListener("click", function () {
    setSheet(document.body.classList.contains("show-list") ? "" : "list");
  });
  document.getElementById("open-detail").addEventListener("click", function () {
    setSheet(document.body.classList.contains("show-detail") ? "" : "detail");
  });
  document.getElementById("sheet-scrim").addEventListener("click", function () {
    setSheet("");
  });
  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") document.getElementById("reset").click();
  });
  window.addEventListener("resize", resize);

  function frame() {
    requestAnimationFrame(frame);
    var now = performance.now();
    stepFlight(now);
    pulseHighlight(now);
    updateCamera();
    renderer.render(scene, camera);
  }

  resize();
  renderDetail(null);
  renderList();
  applyHighlight();
  updateCamera();
  frame();
})();
