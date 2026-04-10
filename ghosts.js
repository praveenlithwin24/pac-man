/**
 * PAC-MAN 3D ULTRA — ghosts.js
 * 8 unique ghost types with detailed 3D geometry, personality-based AI,
 * animated bodies, glowing eyes, tentacles, and special accessories.
 */

/* ══════════════════════════════════════════════════
   GHOST TYPE DEFINITIONS
══════════════════════════════════════════════════ */
var GHOST_TYPES = [
  {
    name: 'BLINKY',
    color: 0xFF2222,
    emissive: 0x440000,
    ai: 'bfs',          // direct chaser
    eyeColor: 0xFFFFFF,
    pupilColor: 0x0000FF,
    accessory: 'horns', // little devil horns
    scale: 1.1
  },
  {
    name: 'PINKY',
    color: 0xFF88CC,
    emissive: 0x440033,
    ai: 'ambush',       // tries to get ahead
    eyeColor: 0xFFFFFF,
    pupilColor: 0x0000FF,
    accessory: 'bow',   // cute bow
    scale: 1.0
  },
  {
    name: 'INKY',
    color: 0x00CCFF,
    emissive: 0x003344,
    ai: 'flank',        // flanks from left
    eyeColor: 0xFFFFFF,
    pupilColor: 0x0000FF,
    accessory: 'antenna',
    scale: 0.95
  },
  {
    name: 'CLYDE',
    color: 0xFF8800,
    emissive: 0x331500,
    ai: 'random',       // unpredictable
    eyeColor: 0xFFFFFF,
    pupilColor: 0x0000FF,
    accessory: 'hat',
    scale: 1.15
  },
  {
    name: 'SPECTER',
    color: 0xAA00FF,
    emissive: 0x220033,
    ai: 'bfs',
    eyeColor: 0xFF00FF,
    pupilColor: 0xFFFFFF,
    accessory: 'crown',
    scale: 1.0
  },
  {
    name: 'PHANTOM',
    color: 0x00FF88,
    emissive: 0x003322,
    ai: 'random',
    eyeColor: 0x00FF00,
    pupilColor: 0x003300,
    accessory: 'cape',
    scale: 1.05
  },
  {
    name: 'WRAITH',
    color: 0xFFFFFF,
    emissive: 0x222222,
    ai: 'bfs',
    eyeColor: 0xFF0000,
    pupilColor: 0x880000,
    accessory: 'cloak',
    scale: 0.9
  },
  {
    name: 'DREAD',
    color: 0x222222,
    emissive: 0x111111,
    ai: 'random',
    eyeColor: 0xFF4400,
    pupilColor: 0xFF0000,
    accessory: 'spikes',
    scale: 1.2
  }
];

/* ══════════════════════════════════════════════════
   GEOMETRY CACHE
══════════════════════════════════════════════════ */
var _ghostGeometryCache = {};

/* ══════════════════════════════════════════════════
   BUILD GHOST BODY (Detailed)
══════════════════════════════════════════════════ */
function buildGhostBody(type) {
  var group = new THREE.Group();
  var radius = 0.28;

  // ── Main body: hemisphere + box ──
  var bodyTop = new THREE.SphereGeometry(radius, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  var bodyTopMesh = new THREE.Mesh(
    bodyTop,
    new THREE.MeshPhongMaterial({
      color: type.color,
      emissive: type.emissive,
      emissiveIntensity: 0.4,
      shininess: 80
    })
  );
  group.add(bodyTopMesh);

  // Middle torso cylinder
  var torsoGeo = new THREE.CylinderGeometry(radius, radius * 1.05, radius * 0.6, 16);
  var torsoMesh = new THREE.Mesh(torsoGeo, new THREE.MeshPhongMaterial({
    color: type.color, emissive: type.emissive, emissiveIntensity: 0.3, shininess: 60
  }));
  torsoMesh.position.y = -radius * 0.25;
  group.add(torsoMesh);

  // Skirt: wavy bottom with sinusoidal bumps (3 bumps)
  var skirtPts = [];
  for (var i = 0; i <= 12; i++) {
    var t = i / 12;
    var wave = Math.abs(Math.sin(t * Math.PI * 3)) * 0.06;
    skirtPts.push(new THREE.Vector2(radius * 1.05 - t * 0.05 + wave, -t * radius * 0.5));
  }
  var skirtGeo = new THREE.LatheGeometry(skirtPts, 16);
  var skirtMesh = new THREE.Mesh(skirtGeo, new THREE.MeshPhongMaterial({
    color: type.color, emissive: type.emissive, emissiveIntensity: 0.3,
    side: THREE.DoubleSide, shininess: 40
  }));
  skirtMesh.position.y = -radius * 0.55;
  group.add(skirtMesh);

  // ── Eyes ──
  var eyeOffsets = [
    { x: -radius * 0.38, y: radius * 0.05, z: radius * 0.85 },
    { x:  radius * 0.38, y: radius * 0.05, z: radius * 0.85 }
  ];
  eyeOffsets.forEach(function(eo) {
    // White of eye
    var eyeGeo = new THREE.SphereGeometry(radius * 0.22, 8, 8);
    var eyeMesh = new THREE.Mesh(eyeGeo, new THREE.MeshPhongMaterial({
      color: type.eyeColor, emissive: type.eyeColor, emissiveIntensity: 0.5
    }));
    eyeMesh.position.set(eo.x, eo.y, eo.z);
    group.add(eyeMesh);

    // Pupil
    var pupilGeo = new THREE.SphereGeometry(radius * 0.12, 6, 6);
    var pupilMesh = new THREE.Mesh(pupilGeo, new THREE.MeshPhongMaterial({
      color: type.pupilColor, emissive: type.pupilColor, emissiveIntensity: 0.3
    }));
    pupilMesh.position.set(eo.x * 0.95, eo.y - 0.01, eo.z * 1.02);
    group.add(pupilMesh);

    // Eye glow light (small)
    var eyeLight = new THREE.PointLight(type.eyeColor, 0.3, 1.5);
    eyeLight.position.set(eo.x, eo.y, eo.z);
    group.add(eyeLight);
  });

  // ── Accessory ──
  addAccessory(group, type, radius);

  // ── Scale ──
  group.scale.setScalar(type.scale || 1.0);

  return group;
}

/* ══════════════════════════════════════════════════
   ACCESSORIES
══════════════════════════════════════════════════ */
function addAccessory(group, type, radius) {
  switch (type.accessory) {

    case 'horns': {
      // Two small cone horns
      [-1, 1].forEach(function(side) {
        var hornGeo = new THREE.ConeGeometry(0.04, 0.12, 6);
        var hornMesh = new THREE.Mesh(hornGeo, new THREE.MeshPhongMaterial({
          color: 0xFF0000, emissive: 0x440000, emissiveIntensity: 0.5
        }));
        hornMesh.position.set(side * radius * 0.55, radius * 1.1, 0);
        hornMesh.rotation.z = side * 0.2;
        group.add(hornMesh);
      });
      break;
    }

    case 'bow': {
      // Two small torus-like bow wings
      var bowMat = new THREE.MeshPhongMaterial({ color: 0xFF4488, emissive: 0x440022, emissiveIntensity: 0.4 });
      [-1, 1].forEach(function(side) {
        var bowGeo = new THREE.TorusGeometry(0.07, 0.025, 6, 12);
        var bowMesh = new THREE.Mesh(bowGeo, bowMat);
        bowMesh.position.set(side * radius * 0.55, radius * 0.9, radius * 0.1);
        bowMesh.rotation.y = side * Math.PI / 4;
        group.add(bowMesh);
      });
      // Bow center knot
      var knotGeo = new THREE.SphereGeometry(0.035, 6, 6);
      var knotMesh = new THREE.Mesh(knotGeo, bowMat);
      knotMesh.position.set(0, radius * 0.9, radius * 0.1);
      group.add(knotMesh);
      break;
    }

    case 'antenna': {
      // Tall thin antenna with ball on top
      var stickGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6);
      var stickMesh = new THREE.Mesh(stickGeo, new THREE.MeshPhongMaterial({
        color: 0x888888, metalness: 0.8
      }));
      stickMesh.position.set(0, radius * 1.2, 0);
      group.add(stickMesh);

      var ballGeo = new THREE.SphereGeometry(0.04, 8, 8);
      var ballMesh = new THREE.Mesh(ballGeo, new THREE.MeshPhongMaterial({
        color: 0x00FFFF, emissive: 0x00FFFF, emissiveIntensity: 0.8
      }));
      ballMesh.position.set(0, radius * 1.38, 0);
      group.add(ballMesh);

      // Ball glow
      var ballLight = new THREE.PointLight(0x00FFFF, 0.5, 2);
      ballLight.position.set(0, radius * 1.38, 0);
      group.add(ballLight);
      break;
    }

    case 'hat': {
      // Cowboy-style hat brim (flat torus) + tall cylinder
      var brimGeo = new THREE.TorusGeometry(radius * 0.75, 0.04, 6, 18);
      var brimMesh = new THREE.Mesh(brimGeo, new THREE.MeshPhongMaterial({
        color: 0x8B4513, emissive: 0x221100
      }));
      brimMesh.rotation.x = Math.PI / 2;
      brimMesh.position.set(0, radius * 0.85, 0);
      group.add(brimMesh);

      var topGeo = new THREE.CylinderGeometry(radius * 0.35, radius * 0.4, radius * 0.55, 10);
      var topMesh = new THREE.Mesh(topGeo, new THREE.MeshPhongMaterial({
        color: 0x5D2E0C, emissive: 0x110800
      }));
      topMesh.position.set(0, radius * 1.2, 0);
      group.add(topMesh);
      break;
    }

    case 'crown': {
      // Gold crown with 5 spikes
      var crownMat = new THREE.MeshPhongMaterial({ color: 0xFFD700, emissive: 0x442200, emissiveIntensity: 0.5, shininess: 120 });
      var crownRingGeo = new THREE.TorusGeometry(radius * 0.55, 0.035, 6, 16);
      var crownRing = new THREE.Mesh(crownRingGeo, crownMat);
      crownRing.rotation.x = Math.PI / 2;
      crownRing.position.set(0, radius * 0.85, 0);
      group.add(crownRing);

      for (var s = 0; s < 5; s++) {
        var angle = (s / 5) * Math.PI * 2;
        var spikeGeo = new THREE.ConeGeometry(0.035, 0.11, 5);
        var spikeMesh = new THREE.Mesh(spikeGeo, crownMat);
        spikeMesh.position.set(
          Math.cos(angle) * radius * 0.55,
          radius * 1.0,
          Math.sin(angle) * radius * 0.55
        );
        group.add(spikeMesh);
      }

      // Crown glow
      var crownLight = new THREE.PointLight(0xFFD700, 0.4, 1.8);
      crownLight.position.set(0, radius * 1.0, 0);
      group.add(crownLight);
      break;
    }

    case 'cape': {
      // Thin dark cape behind ghost
      var capePts = [];
      for (var ci = 0; ci <= 8; ci++) {
        var ct = ci / 8;
        capePts.push(new THREE.Vector2(radius * 0.4 + ct * radius * 0.3, -ct * radius * 0.8));
      }
      var capeGeo = new THREE.LatheGeometry(capePts, 3);
      var capeMesh = new THREE.Mesh(capeGeo, new THREE.MeshPhongMaterial({
        color: 0x220033, emissive: 0x110022, side: THREE.DoubleSide
      }));
      capeMesh.position.set(0, 0, -radius * 0.5);
      capeMesh.rotation.x = 0.3;
      group.add(capeMesh);
      break;
    }

    case 'cloak': {
      // Darker, longer cloak
      var clkPts = [];
      for (var ki = 0; ki <= 10; ki++) {
        var kt = ki / 10;
        clkPts.push(new THREE.Vector2(radius * 1.05 - kt * 0.02, -kt * radius * 0.7));
      }
      var clkGeo = new THREE.LatheGeometry(clkPts, 16);
      var clkMesh = new THREE.Mesh(clkGeo, new THREE.MeshPhongMaterial({
        color: 0x111111, emissive: 0x050505, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide
      }));
      clkMesh.position.y = -0.05;
      group.add(clkMesh);
      break;
    }

    case 'spikes': {
      // Ring of 8 spikes around body equator
      var spkMat = new THREE.MeshPhongMaterial({ color: 0xFF4400, emissive: 0x441100, emissiveIntensity: 0.5 });
      for (var si = 0; si < 8; si++) {
        var sa = (si / 8) * Math.PI * 2;
        var spkGeo = new THREE.ConeGeometry(0.04, 0.15, 5);
        var spkMesh = new THREE.Mesh(spkGeo, spkMat);
        spkMesh.position.set(
          Math.cos(sa) * radius * 1.1,
          0,
          Math.sin(sa) * radius * 1.1
        );
        spkMesh.rotation.z = Math.cos(sa) * Math.PI / 2;
        spkMesh.rotation.x = -Math.sin(sa) * Math.PI / 2;
        group.add(spkMesh);
      }
      break;
    }
  }
}

/* ══════════════════════════════════════════════════
   SPAWN GHOST (public API)
══════════════════════════════════════════════════ */
function spawnGhost(scene, position, index) {
  var typeInfo = GHOST_TYPES[index % GHOST_TYPES.length];
  var group = buildGhostBody(typeInfo);

  group.isGhost    = true;
  group.ghostType  = typeInfo;
  group.aiType     = typeInfo.ai;
  group.frameCount = 0;
  group.bobPhase   = Math.random() * Math.PI * 2;
  group.bobSpeed   = 2 + Math.random();
  group.direction  = new THREE.Vector3(1, 0, 0);
  group.position.copy(position);

  // Store for collision radius (used in game.js)
  group._ghostRadius = 0.28 * (typeInfo.scale || 1.0);

  scene.add(group);
  return group;
}

/* ══════════════════════════════════════════════════
   ANIMATE GHOST (call each frame)
══════════════════════════════════════════════════ */
function animateGhost(ghost, delta, scared) {
  // Bob up and down
  ghost.bobPhase += delta * ghost.bobSpeed;
  ghost.position.z = Math.sin(ghost.bobPhase) * 0.04;

  // Face direction of movement
  if (ghost.direction && (ghost.direction.x !== 0 || ghost.direction.y !== 0)) {
    var targetAngle = Math.atan2(ghost.direction.x, ghost.direction.y);
    ghost.rotation.z = -targetAngle;
  }

  // Scared state: flash blue
  if (scared) {
    ghost.children.forEach(function(child) {
      if (child.material && child.material.color) {
        var t = (Math.sin(Date.now() * 0.01) + 1) * 0.5;
        child.material.color.setHex(t > 0.5 ? 0x0000FF : 0xFFFFFF);
        child.material.emissive && child.material.emissive.setHex(0x000033);
      }
    });
  }
}
