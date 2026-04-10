/**
 * PAC-MAN 3D ULTRA — game.js  (FIXED)
 * Fixes:
 *   1. Pac-Man mouth animation: smooth open/close via rotation (no geometry swapping)
 *   2. Wall rendering: building-style extruded structures with windows/details
 *   3. Map parsing: robust whitespace-split so any map width works
 *   4. Ghost AI stability improvements
 */
(function () {
  'use strict';

  /* ════════════════════════════════════════════════════
     CONSTANTS
  ════════════════════════════════════════════════════ */
  var BASE_PACMAN_SPEED    = 3.0;
  var BASE_GHOST_SPEED     = 1.8;
  var PACMAN_RADIUS        = 0.25;
  var GHOST_RADIUS         = 0.32;
  var DOT_RADIUS           = 0.05;
  var MAX_LIVES            = 3;
  var GHOST_SPAWN_INTERVAL = 8;
  var RESPAWN_DELAY        = 3;

  var UP     = new THREE.Vector3(0, 0, 1);
  var LEFT   = new THREE.Vector3(-1, 0, 0);
  var RIGHT  = new THREE.Vector3(1,  0, 0);
  var TOP    = new THREE.Vector3(0,  1, 0);
  var BOTTOM = new THREE.Vector3(0, -1, 0);

  /* ════════════════════════════════════════════════════
     PAC-MAN CUSTOMIZATION STATE
  ════════════════════════════════════════════════════ */
  var _pacColor  = '#FFD700';
  var _pacHat    = 'none';
  var _pacEyes   = 'normal';
  var _pacTrail  = 'none';

  /* ════════════════════════════════════════════════════
     ACHIEVEMENTS
  ════════════════════════════════════════════════════ */
  var ACHIEVEMENTS = [
    { id:'first_dot',    name:'First Bite',       icon:'🍪', desc:'Eat your first dot',              unlocked:false },
    { id:'speed_demon',  name:'Speed Demon',       icon:'💨', desc:'Activate Speed power-up',         unlocked:false },
    { id:'ghost_killer', name:'Ghost Slayer',      icon:'💀', desc:'Eat a ghost with Killer power',   unlocked:false },
    { id:'portal_jump',  name:'Teleporter',        icon:'🌀', desc:'Use a portal',                    unlocked:false },
    { id:'survivor',     name:'Survivor',          icon:'🛡',  desc:'Finish a level without dying',    unlocked:false },
    { id:'score_1000',   name:'Rookie',            icon:'⭐', desc:'Score 1,000 points',              unlocked:false },
    { id:'score_5000',   name:'Veteran',           icon:'🌟', desc:'Score 5,000 points',              unlocked:false },
    { id:'score_10000',  name:'Legend',            icon:'🏆', desc:'Score 10,000 points',             unlocked:false },
    { id:'combo_5',      name:'Combo King',        icon:'🔥', desc:'Reach a 5x combo multiplier',     unlocked:false },
    { id:'level_10',     name:'Singularity Clear', icon:'♾',  desc:'Complete Level 10',               unlocked:false }
  ];

  function loadAchievements() {
    try {
      var saved = JSON.parse(localStorage.getItem('pm3d_ach') || '{}');
      ACHIEVEMENTS.forEach(function(a) { if (saved[a.id]) a.unlocked = true; });
    } catch(e) {}
  }
  function saveAchievements() {
    try {
      var obj = {};
      ACHIEVEMENTS.forEach(function(a) { if (a.unlocked) obj[a.id] = true; });
      localStorage.setItem('pm3d_ach', JSON.stringify(obj));
    } catch(e) {}
  }
  function unlockAchievement(id) {
    var ach = ACHIEVEMENTS.find(function(a) { return a.id === id; });
    if (!ach || ach.unlocked) return;
    ach.unlocked = true;
    saveAchievements();
    showAchievementPopup(ach);
  }
  function showAchievementPopup(ach) {
    var pop = document.getElementById('achievement-popup');
    if (!pop) return;
    document.getElementById('ach-icon').textContent = ach.icon;
    document.getElementById('ach-name').textContent = ach.name;
    pop.style.display = 'flex';
    setTimeout(function() { pop.style.display = 'none'; }, 3500);
  }
  function renderAchievementsGrid() {
    var grid = document.getElementById('achievements-list');
    if (!grid) return;
    grid.innerHTML = '';
    ACHIEVEMENTS.forEach(function(a) {
      var div = document.createElement('div');
      div.className = 'ach-item' + (a.unlocked ? ' unlocked' : '');
      div.innerHTML = '<span class="ach-badge">' + a.icon + '</span><span>' + a.name + '</span>';
      div.title = a.desc;
      grid.appendChild(div);
    });
  }
  function getSessionAchievements() {
    return ACHIEVEMENTS.filter(function(a) { return a.unlocked; });
  }

  /* ════════════════════════════════════════════════════
     HIGH SCORE HELPERS
  ════════════════════════════════════════════════════ */
  function loadScores() {
    try { return JSON.parse(localStorage.getItem('pm3d_hs') || '[]'); } catch(e) { return []; }
  }
  function saveScores(arr) {
    try { localStorage.setItem('pm3d_hs', JSON.stringify(arr)); } catch(e) {}
  }
  function addScore(name, score) {
    var arr = loadScores();
    arr.push({ name: name || 'PAC', score: score });
    arr.sort(function(a, b) { return b.score - a.score; });
    arr = arr.slice(0, 5);
    saveScores(arr);
    return arr;
  }
  function renderHighScores() {
    var list = loadScores();
    var el = document.getElementById('hs-list');
    if (!el) return;
    el.innerHTML = '';
    var defaults = [
      {name:'BLINKY', score:9800},{name:'PINKY',score:7400},
      {name:'INKY',score:5200},{name:'CLYDE',score:3100},{name:'PAC',score:1000}
    ];
    var shown = list.length > 0 ? list : defaults;
    shown.slice(0, 5).forEach(function(s, i) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="hs-rank">'+(i+1)+'</span><span class="hs-name">'+s.name+'</span><span class="hs-score">'+s.score+'</span>';
      el.appendChild(li);
    });
  }

  /* ════════════════════════════════════════════════════
     UI HELPERS
  ════════════════════════════════════════════════════ */
  function show(id) { var el=document.getElementById(id); if(el) el.style.display='flex'; }
  function hide(id) { var el=document.getElementById(id); if(el) el.style.display='none'; }
  function setText(id, txt) { var el=document.getElementById(id); if(el) el.textContent=txt; }

  var _bannerTimer = null;
  function showBanner(msg, color, dur) {
    var el = document.getElementById('event-banner');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || '#FFD700';
    el.style.borderColor = color || '#FFD700';
    el.style.display = 'block';
    if (_bannerTimer) clearTimeout(_bannerTimer);
    _bannerTimer = setTimeout(function() { el.style.display='none'; }, (dur||2500));
  }

  function updateLivesHUD(lives) {
    var box = document.getElementById('lives-box');
    if (!box) return;
    box.innerHTML = '';
    for (var i = 0; i < lives; i++) {
      var s = document.createElement('span');
      s.className = 'life'; s.textContent = '❤';
      box.appendChild(s);
    }
  }

  /* ════════════════════════════════════════════════════
     COMBO SYSTEM
  ════════════════════════════════════════════════════ */
  var _combo = 1, _comboTimer = 0, _COMBO_TIMEOUT = 2.0;

  function updateCombo(delta) {
    if (_combo > 1) {
      _comboTimer -= delta;
      if (_comboTimer <= 0) { _combo=1; hide('combo-box'); }
    }
  }
  function dotEaten() {
    _combo = Math.min(_combo+1, 10);
    _comboTimer = _COMBO_TIMEOUT;
    if (_combo >= 2) { show('combo-box'); setText('combo-val', _combo); }
    if (_combo >= 5) unlockAchievement('combo_5');
    return _combo;
  }

  /* ════════════════════════════════════════════════════
     GHOST BFS AI
  ════════════════════════════════════════════════════ */
  function bfsNextDirection(map, ghost, target) {
    var start = ghost.position.clone().round();
    var goal  = target.clone().round();
    var queue = [{pos: start, firstDir: null}];
    var visited = {};
    while (queue.length > 0) {
      var cur = queue.shift();
      var key = cur.pos.x + ',' + cur.pos.y;
      if (visited[key]) continue;
      visited[key] = true;
      if (cur.pos.x === goal.x && cur.pos.y === goal.y) {
        return cur.firstDir ? cur.firstDir.clone() : ghost.direction.clone();
      }
      if (Object.keys(visited).length > 400) break;
      var dirs = [
        new THREE.Vector3(-1,0,0), new THREE.Vector3(1,0,0),
        new THREE.Vector3(0,1,0),  new THREE.Vector3(0,-1,0)
      ];
      for (var di=0; di<dirs.length; di++) {
        var d = dirs[di];
        var next = cur.pos.clone().add(d);
        var nk = next.x+','+next.y;
        if (!visited[nk] && !isWall(map, next)) {
          queue.push({pos:next, firstDir: cur.firstDir || d});
        }
      }
    }
    return ghost.direction.clone();
  }

  /* ════════════════════════════════════════════════════
     MAP PARSING  (robust: split on any whitespace)
  ════════════════════════════════════════════════════ */
  var _wallGeoCache = null;

  /* Build a detailed building-like wall segment */
  function buildWallMesh(theme, rx, ry) {
    var group = new THREE.Group();

    // Base block (slightly taller than 1 unit for building look)
    var baseH = 1.2;
    var baseGeo = new THREE.BoxGeometry(0.96, 0.96, baseH);
    var baseMat = new THREE.MeshPhongMaterial({
      color:   theme.wallColor,
      emissive: theme.wallEmissive,
      emissiveIntensity: 0.4,
      shininess: 70,
      specular: 0x444444
    });
    var baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.z = (baseH - 1) * 0.5;
    group.add(baseMesh);

    // Rooftop ledge
    var ledgeGeo = new THREE.BoxGeometry(1.0, 1.0, 0.08);
    var ledgeMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(theme.wallColor).offsetHSL(0, 0, 0.15).getHex(),
      emissive: theme.wallEmissive,
      emissiveIntensity: 0.2,
      shininess: 40
    });
    var ledge = new THREE.Mesh(ledgeGeo, ledgeMat);
    ledge.position.z = baseH * 0.5 + 0.04;
    group.add(ledge);

    // Small window panels (decorative, don't block anything)
    var winColor = new THREE.Color(theme.accentColor || 0x88ccff);
    winColor.multiplyScalar(0.5);
    var winMat = new THREE.MeshPhongMaterial({
      color: winColor.getHex(),
      emissive: theme.accentColor || 0x4488ff,
      emissiveIntensity: 0.6,
      shininess: 120,
      transparent: true,
      opacity: 0.85
    });

    // Add 1-2 tiny window quads on the side faces randomly based on position
    var seed = ((rx * 31 + ry * 17) & 0xFF);
    if (seed > 80) {
      var wGeo = new THREE.PlaneGeometry(0.18, 0.18);
      var wx = new THREE.Mesh(wGeo, winMat);
      wx.position.set(0.485, (seed % 3 - 1) * 0.22, 0.18);
      group.add(wx);
    }
    if (seed > 140) {
      var wGeo2 = new THREE.PlaneGeometry(0.18, 0.18);
      var wy = new THREE.Mesh(wGeo2, winMat);
      wy.position.set((seed % 3 - 1) * 0.22, 0.485, 0.25);
      wy.rotation.z = Math.PI / 2;
      group.add(wy);
    }

    // Rooftop antenna on some walls
    if (seed < 40) {
      var antGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.28, 5);
      var antMat = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 80 });
      var ant = new THREE.Mesh(antGeo, antMat);
      ant.position.set((seed % 2 === 0 ? 0.2 : -0.2), (seed % 2 === 0 ? 0.2 : -0.2), baseH * 0.5 + 0.18);
      group.add(ant);
      // Blinking tip
      var tipGeo = new THREE.SphereGeometry(0.03, 5, 5);
      var tipMat = new THREE.MeshPhongMaterial({ color: 0xFF2222, emissive: 0xFF0000, emissiveIntensity: 1.0 });
      var tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.copy(ant.position);
      tip.position.z += 0.16;
      tip._isBlinkTip = true;
      group.add(tip);
    }

    group.isWall = true;
    return group;
  }

  function createMap(scene, mapDef, theme) {
    var map = [];
    var pacmanSpawn = new THREE.Vector3(0,0,0);
    var ghostSpawn  = new THREE.Vector3(0,0,0);
    var numDots = 0;

    var dotGeo    = new THREE.SphereGeometry(DOT_RADIUS, 8, 8);
    var dotMat    = new THREE.MeshPhongMaterial({ color:0xFFFFFF, emissive:0x888888, emissiveIntensity:0.6 });
    var pelletGeo = new THREE.SphereGeometry(DOT_RADIUS * 3.5, 10, 10);
    var pelletMat = new THREE.MeshPhongMaterial({
      color: theme.accentColor || 0xFFFF00,
      emissive: theme.accentColor || 0xFFFF00,
      emissiveIntensity: 0.8
    });

    // Floor plane - large enough
    var floorGeo = new THREE.PlaneGeometry(80, 60);
    var floorMat = new THREE.MeshPhongMaterial({
      color: theme.floorColor,
      emissive: theme.floorColor,
      emissiveIntensity: 0.08,
      shininess: 15
    });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(13, -15, -0.52);
    scene.add(floor);

    // Floor grid lines (subtle)
    var gridMat = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.accentColor || 0x0044ff).multiplyScalar(0.15).getHex(), transparent: true, opacity: 0.3 });

    var left=Infinity, right=-Infinity, top=-Infinity, bottom=Infinity;

    mapDef.forEach(function(row, ry) {
      // robust split: trim and split on whitespace
      var cols = row.trim().split(/\s+/);
      map[ry] = [];
      cols.forEach(function(cell, rx) {
        var wx = rx, wy = -ry;
        if (wx < left)   left   = wx;
        if (wx > right)  right  = wx;
        if (wy > top)    top    = wy;
        if (wy < bottom) bottom = wy;

        if (cell === '#') {
          var wallGroup = buildWallMesh(theme, rx, ry);
          wallGroup.position.set(wx, wy, 0);
          wallGroup.isWall = true;
          scene.add(wallGroup);
          map[ry][rx] = wallGroup;

          // Occasional accent glow
          if (((rx * 13 + ry * 7) & 0xFF) < 20) {
            var edgeLight = new THREE.PointLight(theme.accentColor || 0xFFD700, 0.2, 3);
            edgeLight.position.set(wx, wy, 0.8);
            scene.add(edgeLight);
          }

        } else if (cell === '.') {
          var d = new THREE.Mesh(dotGeo, dotMat);
          d.position.set(wx, wy, 0);
          d.isDot = true;
          scene.add(d);
          map[ry][rx] = d;
          numDots++;
        } else if (cell === 'o') {
          var p = new THREE.Mesh(pelletGeo, pelletMat);
          p.position.set(wx, wy, 0);
          p.isDot = true; p.isPellet = true;
          scene.add(p);
          map[ry][rx] = p;
          numDots++;
        } else if (cell === 'P') {
          pacmanSpawn.set(wx, wy, 0);
          map[ry][rx] = null;
        } else if (cell === 'G') {
          ghostSpawn.set(wx, wy, 0);
          map[ry][rx] = null;
        } else {
          map[ry][rx] = null;
        }
      });
    });

    map.pacmanSpawn = pacmanSpawn;
    map.ghostSpawn  = ghostSpawn;
    map.numDots     = numDots;
    map.left        = left;
    map.right       = right;
    map.top         = top;
    map.bottom      = bottom;
    map.centerX     = (left + right) / 2;
    map.centerY     = (top  + bottom) / 2;

    return map;
  }

  function getAt(map, pos) {
    var x = Math.round(pos.x), y = Math.round(pos.y);
    var ry = -y;
    return (map[ry] && map[ry][x]) || null;
  }
  function isWall(map, pos) {
    var c = getAt(map, pos);
    return c !== null && c.isWall === true;
  }
  function hideAt(map, pos) {
    var x = Math.round(pos.x), y = Math.round(pos.y);
    var ry = -y;
    if (map[ry] && map[ry][x]) map[ry][x].visible = false;
  }

  /* ════════════════════════════════════════════════════
     PAC-MAN  (FIXED smooth mouth animation via pivot rotation)
  ════════════════════════════════════════════════════ */
  function spawnPacman(scene, position) {
    var color = parseInt(_pacColor.replace('#',''), 16);
    var group = new THREE.Group();
    group.isPacman    = true;
    group.position.copy(position);
    group.direction   = new THREE.Vector3(-1, 0, 0);
    group.distanceMoved = 0;

    var mat = new THREE.MeshPhongMaterial({
      color: color,
      emissive: new THREE.Color(color).multiplyScalar(0.25).getHex(),
      emissiveIntensity: 0.4,
      shininess: 120
    });
    group._mat = mat;
    group._color = color;

    /* ── Body: two half-spheres that rotate to open/close mouth ──
       Top half  = fixed upper jaw
       Bot half  = lower jaw that rotates around X axis
    */
    var topGeo = new THREE.SphereGeometry(PACMAN_RADIUS, 20, 14, 0, Math.PI*2, 0, Math.PI/2);
    var topMesh = new THREE.Mesh(topGeo, mat);
    group.add(topMesh);
    group._topJaw = topMesh;

    var botGeo = new THREE.SphereGeometry(PACMAN_RADIUS, 20, 14, 0, Math.PI*2, Math.PI/2, Math.PI/2);
    var botMesh = new THREE.Mesh(botGeo, mat);
    group.add(botMesh);
    group._botJaw = botMesh;

    // Interior mouth disc (dark)
    var mouthGeo = new THREE.CircleGeometry(PACMAN_RADIUS * 0.92, 16);
    var mouthMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
    var mouthDisc = new THREE.Mesh(mouthGeo, mouthMat);
    mouthDisc.rotation.y = Math.PI; // face forward
    group.add(mouthDisc);
    group._mouthDisc = mouthDisc;

    // Eyes
    addPacmanEyes(group, color);
    addPacmanHat(group, color);

    group._trailParticles = [];
    group._trailType = _pacTrail;

    scene.add(group);
    return group;
  }

  /* Animate Pac-Man mouth – called every frame */
  function animatePacman(pac, delta, moving) {
    pac.distanceMoved += delta * (moving ? 1 : 0.3);
    // Mouth angle oscillates between 0 (closed) and MAX_ANGLE (open)
    var MAX_ANGLE = 0.45; // radians ~26°
    var phase = pac.distanceMoved * 6.0; // speed of chomp
    var t = (Math.sin(phase) + 1) * 0.5; // 0-1
    var angle = t * MAX_ANGLE;

    if (pac._topJaw) pac._topJaw.rotation.x =  angle;
    if (pac._botJaw) pac._botJaw.rotation.x = -angle;
    // Mouth disc visible only when open
    if (pac._mouthDisc) pac._mouthDisc.visible = (angle > 0.05);
  }

  function addPacmanEyes(group, color) {
    var eyeConfigs = {
      normal: [{x:-0.10,y:0.12,z:0.20,size:0.04,col:0x111111},{x:0.10,y:0.12,z:0.20,size:0.04,col:0x111111}],
      angry:  [{x:-0.10,y:0.12,z:0.20,size:0.04,col:0xFF0000},{x:0.10,y:0.12,z:0.20,size:0.04,col:0xFF0000}],
      cool:   [{x:-0.08,y:0.10,z:0.21,size:0.05,col:0x0066FF},{x:0.08,y:0.10,z:0.21,size:0.05,col:0x0066FF}],
      sleepy: [{x:-0.10,y:0.10,z:0.20,size:0.035,col:0x333333},{x:0.10,y:0.10,z:0.20,size:0.035,col:0x333333}],
      star:   [{x:-0.10,y:0.12,z:0.20,size:0.05,col:0xFFFF00,em:0xFFFF00},{x:0.10,y:0.12,z:0.20,size:0.05,col:0xFFFF00,em:0xFFFF00}]
    };
    var config = eyeConfigs[_pacEyes] || eyeConfigs.normal;
    config.forEach(function(ec) {
      var eyeGeo = new THREE.SphereGeometry(ec.size, 6, 6);
      var eyeMat = new THREE.MeshPhongMaterial({ color:ec.col, emissive:ec.em||ec.col, emissiveIntensity:0.4 });
      var eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
      eyeMesh.position.set(ec.x, ec.y, ec.z);
      group.add(eyeMesh);
    });
  }

  function addPacmanHat(group, color) {
    var mat = new THREE.MeshPhongMaterial({ color:0xFF0000, emissive:0x440000, emissiveIntensity:0.4 });

    if (_pacHat === 'cap') {
      var brimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.04, 14);
      group.add(Object.assign(new THREE.Mesh(brimGeo, mat), {position: new THREE.Vector3(0.05,0,0.3)}));
      var capGeo  = new THREE.CylinderGeometry(0.15, 0.22, 0.14, 14);
      group.add(Object.assign(new THREE.Mesh(capGeo, mat), {position: new THREE.Vector3(0,0,0.38)}));

    } else if (_pacHat === 'crown') {
      var crownMat = new THREE.MeshPhongMaterial({color:0xFFD700,emissive:0x442200,emissiveIntensity:0.5,shininess:120});
      var ringGeo = new THREE.TorusGeometry(0.20, 0.03, 6, 14);
      var ring = new THREE.Mesh(ringGeo, crownMat);
      ring.position.z = 0.3; ring.rotation.x = Math.PI/2; group.add(ring);
      for (var s=0;s<5;s++) {
        var a = (s/5)*Math.PI*2;
        var sGeo = new THREE.ConeGeometry(0.03,0.10,5);
        var sm = new THREE.Mesh(sGeo, crownMat);
        sm.position.set(Math.cos(a)*0.20, Math.sin(a)*0.20, 0.38);
        group.add(sm);
      }

    } else if (_pacHat === 'wizard') {
      var wMat = new THREE.MeshPhongMaterial({color:0x4400aa,emissive:0x110033,emissiveIntensity:0.4});
      var wCone = new THREE.Mesh(new THREE.ConeGeometry(0.16,0.35,10), wMat);
      wCone.position.set(0,0,0.47); wCone.rotation.x = -Math.PI/2; group.add(wCone);
      var wBrim = new THREE.Mesh(new THREE.TorusGeometry(0.22,0.04,6,14), wMat);
      wBrim.position.set(0,0,0.30); wBrim.rotation.x = Math.PI/2; group.add(wBrim);
      var starGeo = new THREE.OctahedronGeometry(0.04);
      var starM = new THREE.Mesh(starGeo, new THREE.MeshPhongMaterial({color:0xFFFF00,emissive:0xFFFF00,emissiveIntensity:0.8}));
      starM.position.set(0,0,0.64); group.add(starM);

    } else if (_pacHat === 'santa') {
      var sMat = new THREE.MeshPhongMaterial({color:0xCC0000,emissive:0x440000,emissiveIntensity:0.4});
      var sCone = new THREE.Mesh(new THREE.ConeGeometry(0.16,0.28,10), sMat);
      sCone.position.set(0,0,0.42); sCone.rotation.x=-Math.PI/2; group.add(sCone);
      var sBrim = new THREE.Mesh(new THREE.TorusGeometry(0.17,0.04,6,14), new THREE.MeshPhongMaterial({color:0xFFFFFF,emissive:0x888888}));
      sBrim.position.set(0,0,0.30); sBrim.rotation.x=Math.PI/2; group.add(sBrim);
      var pp = new THREE.Mesh(new THREE.SphereGeometry(0.055,8,8), new THREE.MeshPhongMaterial({color:0xFFFFFF,emissive:0x999999}));
      pp.position.set(0,0,0.61); group.add(pp);
    }
  }

  /* ════════════════════════════════════════════════════
     TRAIL PARTICLES
  ════════════════════════════════════════════════════ */
  function spawnTrailParticle(scene, pos, trailType) {
    if (trailType === 'none') return;
    var colors = { sparkle:0xFFFFAA, fire:0xFF6600, ice:0x88DDFF };
    var col = colors[trailType] || 0xFFFF00;
    var geo = new THREE.SphereGeometry(0.04, 4, 4);
    var mat = new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.9 });
    var m = new THREE.Mesh(geo, mat);
    m.position.copy(pos); m.position.z += 0.1;
    m._life = 0.5; m.isTrail = true;
    scene.add(m); return m;
  }
  function updateTrails(scene, delta) {
    scene.children.slice().forEach(function(o) {
      if (!o.isTrail) return;
      o._life -= delta;
      if (o._life <= 0) { scene.remove(o); return; }
      o.material.opacity = o._life * 1.8;
      o.scale.setScalar(o._life * 2);
      o.position.z += delta * 0.5;
    });
  }

  /* ════════════════════════════════════════════════════
     PORTALS
  ════════════════════════════════════════════════════ */
  var _portalCooldown = 0;

  function createPortalMesh(color) {
    var geo = new THREE.TorusGeometry(0.38, 0.1, 10, 28);
    var mat = new THREE.MeshPhongMaterial({ color:color, emissive:color, emissiveIntensity:1.0, transparent:true, opacity:0.9 });
    var m = new THREE.Mesh(geo, mat);
    var inner = new THREE.Mesh(new THREE.TorusGeometry(0.22,0.05,8,20), new THREE.MeshPhongMaterial({color:0xFFFFFF,emissive:0xFFFFFF,emissiveIntensity:0.5}));
    m.add(inner);
    m.isPortal = true;
    m.add(new THREE.PointLight(color, 0.8, 3));
    return m;
  }
  function createFakePortalMesh() {
    var m = createPortalMesh(0xFF2222);
    m.isFakePortal = true; m.isPortal = false; return m;
  }
  function spawnPortals(scene, portalDefs, fakePortalDefs) {
    var portals = [];
    portalDefs.forEach(function(p) {
      var ax=p.a[0], ay=-p.a[1], bx=p.b[0], by=-p.b[1];
      var ma=createPortalMesh(0x00FFFF), mb=createPortalMesh(0x00FFFF);
      ma.position.set(ax,ay,0); mb.position.set(bx,by,0);
      ma.rotation.x=Math.PI/2; mb.rotation.x=Math.PI/2;
      scene.add(ma); scene.add(mb);
      portals.push({a:new THREE.Vector3(ax,ay,0), b:new THREE.Vector3(bx,by,0), meshA:ma, meshB:mb});
    });
    fakePortalDefs.forEach(function(fp) {
      var fx=fp.pos[0], fy=-fp.pos[1];
      var m=createFakePortalMesh();
      m.position.set(fx,fy,0); m.rotation.x=Math.PI/2;
      scene.add(m);
      portals.push({a:new THREE.Vector3(fx,fy,0), b:null, fake:true, meshA:m});
    });
    return portals;
  }
  function animatePortals(portals, delta) {
    portals.forEach(function(p) {
      if (p.meshA) p.meshA.rotation.y += delta*2;
      if (p.meshB) p.meshB.rotation.y += delta*2;
    });
  }
  function checkPortals(pacman, portals, now) {
    if (now < _portalCooldown) return false;
    for (var i=0; i<portals.length; i++) {
      var p = portals[i];
      if (pacman.position.distanceTo(p.a) < 0.55) {
        if (p.fake) return 'fake';
        pacman.position.copy(p.b);
        _portalCooldown = now+1.5;
        unlockAchievement('portal_jump');
        showBanner('🌀 PORTAL!','#00FFFF');
        return 'portal';
      }
      if (p.b && !p.fake && pacman.position.distanceTo(p.b) < 0.55) {
        pacman.position.copy(p.a);
        _portalCooldown = now+1.5;
        unlockAchievement('portal_jump');
        showBanner('🌀 PORTAL!','#00FFFF');
        return 'portal';
      }
    }
    return false;
  }

  /* ════════════════════════════════════════════════════
     LASER BEAMS
  ════════════════════════════════════════════════════ */
  function spawnLasers(scene, laserDefs, map) {
    var lasers = [];
    laserDefs.forEach(function(ld) {
      var mat = new THREE.MeshBasicMaterial({color:0xFF0000,transparent:true,opacity:0.85});
      var width = map.right - map.left + 2;
      var height = Math.abs(map.bottom) + 2;
      var geo, mesh;
      if (ld.axis==='x') {
        geo  = new THREE.BoxGeometry(width, 0.07, 0.07);
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(map.centerX, ld.y, 0.12);
      } else {
        geo  = new THREE.BoxGeometry(0.07, height, 0.07);
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(ld.pos, map.centerY, 0.12);
      }
      mesh.isLaser = true; mesh.laserDef = ld;
      var glow = new THREE.PointLight(0xFF0000,0.6,3);
      glow.position.copy(mesh.position);
      scene.add(glow); mesh._glow = glow;
      scene.add(mesh); lasers.push(mesh);
    });
    return lasers;
  }
  function checkLasers(pacman, lasers) {
    for (var i=0;i<lasers.length;i++) {
      var L=lasers[i]; if (!L.visible) continue;
      var ld=L.laserDef;
      if (ld.axis==='x') { if (Math.abs(pacman.position.y-ld.y)<0.3+PACMAN_RADIUS) return true; }
      else { if (Math.abs(pacman.position.x-ld.pos)<0.3+PACMAN_RADIUS) return true; }
    }
    return false;
  }

  /* ════════════════════════════════════════════════════
     MOVING WALLS
  ════════════════════════════════════════════════════ */
  function spawnMovingWalls(scene, movingWallDefs, theme) {
    var walls = [];
    movingWallDefs.forEach(function(wd) {
      var geo = new THREE.BoxGeometry(1,1,1.2);
      var mat = new THREE.MeshPhongMaterial({
        color:theme.accentColor||0xFF6600, emissive:theme.accentColor||0xFF6600, emissiveIntensity:0.4
      });
      var m = new THREE.Mesh(geo, mat);
      m.isWall=true; m.isMovingWall=true;
      m.position.set(wd.start[0], wd.start[1], 0.1);
      m.mwDef=wd; m.mwT=0; m.mwDir=1;
      scene.add(m); walls.push(m);
    });
    return walls;
  }
  function updateMovingWalls(walls, delta) {
    walls.forEach(function(w) {
      var wd=w.mwDef;
      w.mwT += delta*wd.speed*w.mwDir;
      if (wd.axis==='x') {
        var range=wd.end[0]-wd.start[0];
        if (w.mwT>=1){w.mwT=1;w.mwDir=-1;} if (w.mwT<=0){w.mwT=0;w.mwDir=1;}
        w.position.x = wd.start[0]+range*w.mwT;
      } else {
        var range2=wd.end[1]-wd.start[1];
        if (w.mwT>=1){w.mwT=1;w.mwDir=-1;} if (w.mwT<=0){w.mwT=0;w.mwDir=1;}
        w.position.y = wd.start[1]+range2*w.mwT;
      }
    });
  }
  function checkMovingWallCollision(pacman, movingWalls) {
    for (var i=0;i<movingWalls.length;i++) {
      if (pacman.position.distanceTo(movingWalls[i].position) < PACMAN_RADIUS+0.62) return true;
    }
    return false;
  }

  /* ════════════════════════════════════════════════════
     AAA LIGHTING SETUP
  ════════════════════════════════════════════════════ */
  function createScene(theme) {
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.skyColor || 0x000011);

    var ambient = new THREE.AmbientLight(theme.ambientColor||0x334466, 0.35);
    scene.add(ambient); scene._ambientLight = ambient;

    var hemi = new THREE.HemisphereLight(theme.ambientColor||0x334466, theme.floorColor||0x000000, 0.5);
    scene.add(hemi); scene._hemiLight = hemi;

    var dir = new THREE.DirectionalLight(0xFFFFEE, 0.8);
    dir.position.set(10,15,30);
    dir.target.position.set(13,-15,0);
    scene.add(dir); scene.add(dir.target); scene._dirLight = dir;

    var rim = new THREE.DirectionalLight(theme.accentColor||0x0088ff, 0.3);
    rim.position.set(-10,-20,15);
    scene.add(rim); scene._rimLight = rim;

    var cornerPositions = [[1,-1],[1,-29],[26,-1],[26,-29],[13,-15]];
    scene._accentLights = [];
    cornerPositions.forEach(function(cp) {
      var pl = new THREE.PointLight(theme.accentColor||0x0044ff, 0.4, 14);
      pl.position.set(cp[0],cp[1],3);
      scene.add(pl); scene._accentLights.push(pl);
    });

    scene.fog = new THREE.FogExp2(theme.skyColor||0x000011, 0.015);
    scene._baseFog = new THREE.FogExp2(theme.skyColor||0x000011, 0.015);

    return scene;
  }

  /* ════════════════════════════════════════════════════
     CAMERA / MINIMAP
  ════════════════════════════════════════════════════ */
  function createHudCamera(map) {
    var hw=(map.right-map.left)/2+1, hh=(map.top-map.bottom)/2+1;
    var cam = new THREE.OrthographicCamera(-hw,hw,hh,-hh,1,200);
    cam.position.set(map.centerX,map.centerY,10);
    cam.lookAt(new THREE.Vector3(map.centerX,map.centerY,0));
    return cam;
  }
  function renderMiniMap(renderer, hudCam, scene) {
    var size = Math.min(162, window.innerWidth*0.22);
    renderer.setScissorTest(true);
    renderer.setScissor(10,10,size,size);
    renderer.setViewport(10,10,size,size);
    renderer.render(scene, hudCam);
    renderer.setScissorTest(false);
  }

  /* ════════════════════════════════════════════════════
     GHOST AI (movement)
  ════════════════════════════════════════════════════ */
  var _prevPos  = new THREE.Vector3();
  var _curPos   = new THREE.Vector3();
  var _leftDir  = new THREE.Vector3();
  var _rightDir = new THREE.Vector3();
  var _backDir  = new THREE.Vector3();
  var map_ref   = null;

  function updateGhostAI(ghost, pacmanPos) {
    ghost.frameCount++;
    if (ghost.frameCount % 20 === 0 && ghost.aiType !== 'random') {
      ghost.direction.copy(bfsNextDirection(map_ref, ghost, pacmanPos));
    }
  }

  function moveGhost(ghost, delta, map, ghostSpeed) {
    _prevPos.copy(ghost.position).addScaledVector(ghost.direction, 0.5).round();
    ghost.position.addScaledVector(ghost.direction, delta*ghostSpeed);
    _curPos.copy(ghost.position).addScaledVector(ghost.direction, 0.5).round();
    if (!_curPos.equals(_prevPos)) {
      _leftDir.copy(ghost.direction).applyAxisAngle(UP, Math.PI/2);
      _rightDir.copy(ghost.direction).applyAxisAngle(UP, -Math.PI/2);
      _backDir.copy(ghost.direction).negate();
      var fb = isWall(map, _curPos.copy(ghost.position).addScaledVector(ghost.direction, 0.6));
      var lb = isWall(map, _curPos.copy(ghost.position).add(_leftDir));
      var rb = isWall(map, _curPos.copy(ghost.position).add(_rightDir));
      var options = [];
      if (!fb) options.push(ghost.direction.clone());
      if (!lb) options.push(_leftDir.clone());
      if (!rb) options.push(_rightDir.clone());
      if (options.length===0) options.push(_backDir.clone());
      if (fb || options.length>1) {
        if (ghost.aiType==='random') {
          ghost.direction.copy(options[Math.floor(Math.random()*options.length)]);
        } else if (fb && options.length>0) {
          var open=options.filter(function(o){ return !isWall(map, _curPos.copy(ghost.position).add(o)); });
          if (open.length>0) ghost.direction.copy(open[0]);
        }
        ghost.position.round().addScaledVector(ghost.direction, delta);
      }
    }
  }

  /* ════════════════════════════════════════════════════
     POWER-UP SYSTEM
  ════════════════════════════════════════════════════ */
  var POWER_DURATION = { speed:5, invisible:4, killer:6, glue:5 };
  var _activePower=null, _powerEndTime=0, _powerCharge=0;
  var _CHARGE_PER_DOT=0.04, _showingPowerMenu=false;

  function updatePowerBar() {
    var fill=document.getElementById('power-bar-fill');
    if (!fill) return;
    fill.style.width = (_powerCharge*100)+'%';
    if (_powerCharge>=1) fill.classList.add('full');
    else fill.classList.remove('full');
  }
  function activatePower(type, now) {
    _activePower=type; _powerEndTime=now+POWER_DURATION[type];
    _powerCharge=0; updatePowerBar();
    var labels={speed:'💨 SPEED BOOST!',invisible:'👻 INVISIBLE!',killer:'💀 GHOST KILLER!',glue:'🕸 GHOST GLUE!'};
    var colors={speed:'#00FF88',invisible:'#AA88FF',killer:'#FF4444',glue:'#FFAA00'};
    showBanner(labels[type]||type, colors[type]||'#FFD700', 2000);
    setText('active-power','⚡ '+(labels[type]||type));
    if (type==='speed') unlockAchievement('speed_demon');
  }
  function clearPower() { _activePower=null; setText('active-power',''); }

  /* ════════════════════════════════════════════════════
     EVENTS SCHEDULER
  ════════════════════════════════════════════════════ */
  function createEventScheduler(eventList, levelIdx, scene) {
    var BASE_INTERVAL = 20 - levelIdx*1.8;
    var interval = Math.max(7, BASE_INTERVAL);
    var idx=0, nextEventTime=interval, activeEvent=null, activeEventEnd=0;
    return {
      _ghostBoost: false, _reversed: false,
      update: function(now, scene, pacman) {
        if (activeEvent && now>=activeEventEnd) { this.endEvent(scene,pacman); activeEvent=null; }
        if (!activeEvent && now>=nextEventTime && eventList.length>0) {
          var ev=eventList[idx%eventList.length]; idx++;
          this.startEvent(ev,now,scene,pacman);
          activeEvent=ev; activeEventEnd=now+this.getDuration(ev);
          nextEventTime=activeEventEnd+interval;
        }
      },
      getDuration: function(ev) { return {fog:12,lightsoff:8,ghostspeedup:10,reversed:8}[ev]||8; },
      startEvent: function(ev, now, scene, pacman) {
        if (ev==='fog') { scene.fog=new THREE.FogExp2(0x000000,0.22); showBanner('🌫 FOG!','#AAAAFF'); }
        else if (ev==='lightsoff') {
          if (scene._ambientLight) scene._ambientLight.intensity=0.02;
          if (scene._hemiLight)    scene._hemiLight.intensity=0.02;
          if (scene._dirLight)     scene._dirLight.intensity=0.04;
          if (scene._rimLight)     scene._rimLight.intensity=0;
          showBanner('🔦 LIGHTS OFF!','#222266');
        } else if (ev==='ghostspeedup') { this._ghostBoost=true; showBanner('👻 GHOSTS SPEED UP!','#FF4444'); }
        else if (ev==='reversed') { this._reversed=true; showBanner('🪞 CONTROLS REVERSED!','#FF00FF'); }
      },
      endEvent: function(scene, pacman) {
        scene.fog=scene._baseFog;
        if (scene._ambientLight) scene._ambientLight.intensity=0.35;
        if (scene._hemiLight)    scene._hemiLight.intensity=0.5;
        if (scene._dirLight)     scene._dirLight.intensity=0.8;
        if (scene._rimLight)     scene._rimLight.intensity=0.3;
        this._ghostBoost=false; this._reversed=false;
      }
    };
  }

  /* ════════════════════════════════════════════════════
     KEY STATE
  ════════════════════════════════════════════════════ */
  function createKeyState() {
    var ks={};
    function down(e){ks[e.key.toUpperCase()]=true; ks[e.keyCode]=true;}
    function up(e){ks[e.key.toUpperCase()]=false; ks[e.keyCode]=false;}
    document.addEventListener('keydown',down);
    document.addEventListener('keyup',up);
    return { state:ks, destroy:function(){ document.removeEventListener('keydown',down); document.removeEventListener('keyup',up); } };
  }

  /* ════════════════════════════════════════════════════
     ANIMATION LOOP
  ════════════════════════════════════════════════════ */
  function animationLoop(cb) {
    var prev=performance.now(), id;
    function tick() {
      id=requestAnimationFrame(tick);
      var now=performance.now(), delta=Math.min((now-prev)/1000, 1/30);
      prev=now; cb(delta, now/1000);
    }
    tick();
    return function cancel(){ cancelAnimationFrame(id); };
  }

  /* ════════════════════════════════════════════════════
     RENDERER
  ════════════════════════════════════════════════════ */
  function createRenderer() {
    var r = new THREE.WebGLRenderer({ antialias:true });
    r.setPixelRatio(Math.min(window.devicePixelRatio,2));
    r.setClearColor(0x000000,1);
    r.setSize(window.innerWidth,window.innerHeight);
    document.body.appendChild(r.domElement);
    return r;
  }

  /* ════════════════════════════════════════════════════
     GAME STATE
  ════════════════════════════════════════════════════ */
  var _cancelLoop=null, _renderer=null, _keyHandle=null;
  var _levelIndex=0, _deathAutoTimer=null;

  function cleanupGame() {
    if (_cancelLoop) { _cancelLoop(); _cancelLoop=null; }
    if (_keyHandle)  { _keyHandle.destroy(); _keyHandle=null; }
    if (_renderer)   {
      _renderer.domElement.parentNode && _renderer.domElement.parentNode.removeChild(_renderer.domElement);
      _renderer=null;
    }
    if (_deathAutoTimer) { clearTimeout(_deathAutoTimer); _deathAutoTimer=null; }
    _activePower=null; _powerCharge=0; _showingPowerMenu=false; _combo=1;
    hide('power-menu'); hide('combo-box');
  }

  function startGame() {
    hide('start-screen'); hide('death-screen'); hide('win-screen'); hide('respawn-screen');
    document.getElementById('hud').style.display='flex';
    cleanupGame();
    _portalCooldown=0;
    runGame(_levelIndex);
  }
  function restartGame() { _levelIndex=0; startGame(); }
  function nextLevel()   { _levelIndex=Math.min(_levelIndex+1, LEVELS.length-1); startGame(); }

  /* ════════════════════════════════════════════════════
     MAIN GAME LOOP
  ════════════════════════════════════════════════════ */
  function runGame(levelIdx) {
    var lvlDef      = LEVELS[Math.min(levelIdx, LEVELS.length-1)];
    var theme       = LEVEL_THEMES[Math.min(levelIdx, LEVEL_THEMES.length-1)];
    var pacmanSpeed = BASE_PACMAN_SPEED + levelIdx*0.3;
    var ghostSpeed  = BASE_GHOST_SPEED  + levelIdx*0.3;
    var maxGhosts   = 3 + Math.floor(levelIdx*0.8);

    var lives=MAX_LIVES, score=0, numDotsEaten=0, numGhosts=0;
    var ghostSpawnAt=-GHOST_SPAWN_INTERVAL;
    var won=false, lost=false, dying=false;
    var respawnTimer=0, gameStartTime=null, sessionDeaths=0;

    _powerCharge=0; _activePower=null;
    updatePowerBar(); setText('active-power','');
    setText('level-val', levelIdx+1);
    setText('theme-val', theme.name);
    updateLivesHUD(lives);
    setText('score-val', score);
    _combo=1; hide('combo-box');

    _renderer  = createRenderer();
    _keyHandle = createKeyState();
    var keys   = _keyHandle.state;

    var scene = createScene(theme);
    var map   = createMap(scene, lvlDef.map, theme);
    map_ref   = map;

    var pacman      = spawnPacman(scene, map.pacmanSpawn);
    var portals     = spawnPortals(scene, lvlDef.portals||[], lvlDef.fakePortals||[]);
    var lasers      = spawnLasers(scene, lvlDef.lasers||[], map);
    var movingWalls = spawnMovingWalls(scene, lvlDef.movingWalls||[], theme);
    var evtSched    = createEventScheduler(lvlDef.events||[], levelIdx, scene);
    var _laserPhase = 0;

    var hudCam = createHudCamera(map);
    var camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.up.copy(UP);
    camera.position.copy(map.pacmanSpawn).addScaledVector(UP, 4);
    camera.lookAt(map.pacmanSpawn);

    var camTarget=new THREE.Vector3(), camLookTarget=new THREE.Vector3(), camLookCurrent=new THREE.Vector3();

    var pacLight = new THREE.PointLight(new THREE.Color(_pacColor).getHex(), 1.0, 7);
    scene.add(pacLight);

    var _trailTimer=0;

    window.addEventListener('resize', onResize);
    function onResize() {
      if (!_renderer) return;
      _renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth/window.innerHeight;
      camera.updateProjectionMatrix();
    }

    function onKeyDown(e) {
      if ((e.key===' '||e.keyCode===32) && _powerCharge>=1 && !_showingPowerMenu && !dying && !won) {
        _showingPowerMenu=true;
        document.getElementById('power-menu').style.display='flex';
      }
    }
    document.addEventListener('keydown', onKeyDown);
    var origDestroy = _keyHandle.destroy.bind(_keyHandle);
    _keyHandle.destroy = function() {
      origDestroy();
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };

    /* ── Pac-Man movement ── */
    var _lookAt = new THREE.Vector3();
    function movePacman(delta, reversed) {
      var fwd=reversed?-1:1, turn=reversed?-1:1;
      var moved=false;
      if (keys['W']||keys['ARROWUP'])    { pacman.position.addScaledVector(pacman.direction, fwd*pacmanSpeed*delta); moved=true; }
      if (keys['S']||keys['ARROWDOWN'])  { pacman.position.addScaledVector(pacman.direction,-fwd*pacmanSpeed*delta); moved=true; }
      if (keys['A']||keys['ARROWLEFT'])  { pacman.direction.applyAxisAngle(UP,  turn*Math.PI/2*delta*2.5); }
      if (keys['D']||keys['ARROWRIGHT']) { pacman.direction.applyAxisAngle(UP, -turn*Math.PI/2*delta*2.5); }

      if (_activePower==='speed') { pacman.position.addScaledVector(pacman.direction, fwd*2.2*delta); moved=true; }

      // Wall collisions
      var px=pacman.position.clone(), R=PACMAN_RADIUS;
      if (isWall(map, px.clone().addScaledVector(LEFT,  R))) pacman.position.x = Math.round(pacman.position.x-R)+0.5+R;
      if (isWall(map, px.clone().addScaledVector(RIGHT, R))) pacman.position.x = Math.round(pacman.position.x+R)-0.5-R;
      if (isWall(map, px.clone().addScaledVector(TOP,   R))) pacman.position.y = Math.round(pacman.position.y+R)-0.5-R;
      if (isWall(map, px.clone().addScaledVector(BOTTOM,R))) pacman.position.y = Math.round(pacman.position.y-R)+0.5+R;

      if (checkMovingWallCollision(pacman, movingWalls)) return 'mwdeath';

      // ── FIXED mouth animation (smooth pivot rotation, no geometry swap)
      animatePacman(pacman, delta, moved);

      // Pac-Man rotation to face direction
      if (pacman.direction.x!==0||pacman.direction.y!==0) {
        var angle=Math.atan2(pacman.direction.x, pacman.direction.y);
        pacman.rotation.z=-angle;
      }

      // Dot eating
      var cell=getAt(map, pacman.position);
      if (cell && cell.isDot===true && cell.visible!==false) {
        hideAt(map, pacman.position); numDotsEaten++;
        var mult=dotEaten();
        var pts=(cell.isPellet?50:10)*mult;
        score+=pts; setText('score-val',score);
        _powerCharge=Math.min(1,_powerCharge+_CHARGE_PER_DOT);
        updatePowerBar();
        if (numDotsEaten===1) unlockAchievement('first_dot');
        if (score>=1000)  unlockAchievement('score_1000');
        if (score>=5000)  unlockAchievement('score_5000');
        if (score>=10000) unlockAchievement('score_10000');
      }

      // Invisible opacity
      if (_activePower==='invisible') {
        if (pacman._mat) { pacman._mat.transparent=true; pacman._mat.opacity=0.2; }
      } else {
        if (pacman._mat) { pacman._mat.transparent=false; pacman._mat.opacity=1; }
      }

      // Trail
      if (pacman._trailType!=='none' && moved) {
        _trailTimer+=delta;
        if (_trailTimer>0.06) { spawnTrailParticle(scene,pacman.position.clone(),pacman._trailType); _trailTimer=0; }
      }

      return null;
    }

    /* ── Camera follow ── */
    function updateCamera(delta) {
      camTarget.copy(pacman.position).addScaledVector(UP,2.0).addScaledVector(pacman.direction,-1.5);
      camLookTarget.copy(pacman.position).addScaledVector(pacman.direction,1.8);
      var speed=(lost||won||dying)?2:9;
      camera.position.lerp(camTarget, delta*speed);
      camLookCurrent.lerp(camLookTarget, delta*speed);
      camera.lookAt(camLookCurrent);
      pacLight.position.copy(pacman.position).addScaledVector(UP,0.6);
    }

    /* ── Respawn ── */
    function respawn() {
      hide('respawn-screen');
      pacman.position.copy(map.pacmanSpawn);
      pacman.direction.set(-1,0,0);
      pacman.distanceMoved=0;
      if (pacman._mat) { pacman._mat.transparent=false; pacman._mat.opacity=1; }
      scene.children.slice().forEach(function(o){ if(o.isGhost) scene.remove(o); });
      numGhosts=0; ghostSpawnAt=-GHOST_SPAWN_INTERVAL;
      dying=false; lost=false; _activePower=null; setText('active-power','');
      _combo=1; hide('combo-box');
    }
    function startRespawnCountdown() {
      show('respawn-screen'); respawnTimer=RESPAWN_DELAY;
      setText('respawn-countdown','Respawning in '+Math.ceil(respawnTimer)+'...');
    }
    function triggerDeath(now) {
      if (dying) return;
      dying=true; lives--; sessionDeaths++;
      updateLivesHUD(lives); startRespawnCountdown();
    }

    function dist(a,b){ return a.position.distanceTo(b.position); }
    function fmtTime(s){ var m=Math.floor(s/60),ss=Math.floor(s%60); return (m<10?'0':'')+m+':'+(ss<10?'0':'')+ss; }

    var _wonTime=0;

    /* ═════════════ MAIN UPDATE ═════════════ */
    function update(delta, now) {
      if (gameStartTime===null) gameStartTime=now;
      var elapsed=now-gameStartTime;
      setText('timer-val', fmtTime(elapsed));

      // Laser pulse
      _laserPhase+=delta*3;
      lasers.forEach(function(L){
        var vis=Math.sin(_laserPhase)>-0.3;
        L.visible=vis; if (L._glow) L._glow.visible=vis;
      });

      // Portal animation
      animatePortals(portals, delta);

      // Trail particles
      updateTrails(scene, delta);

      // Combo timeout
      updateCombo(delta);

      // Power timer
      if (_activePower && now>=_powerEndTime) clearPower();

      // Accent lights flicker
      if (scene._accentLights) {
        scene._accentLights.forEach(function(l){
          l.intensity=0.35+Math.sin(now*2+l.position.x)*0.08;
        });
      }

      // Blink rooftop antenna tips
      scene.children.forEach(function(o){
        if (o.isWall && o.children) {
          o.children.forEach(function(child){
            if (child._isBlinkTip) {
              child.material.emissiveIntensity = (Math.sin(now*4+o.position.x)>0)?1.0:0.1;
            }
          });
        }
      });

      /* ── Dying / respawn ── */
      if (dying) {
        respawnTimer-=delta;
        setText('respawn-countdown','Respawning in '+Math.max(0,Math.ceil(respawnTimer))+'...');
        if (respawnTimer<=0) {
          if (lives<=0) {
            dying=false; hide('respawn-screen'); hide('hud');
            setText('final-score','Score: '+score);
            var achHtml=getSessionAchievements().map(function(a){return '<span class="inline-ach">'+a.icon+' '+a.name+'</span>';}).join('');
            var deathAch=document.getElementById('death-achievements');
            if (deathAch) deathAch.innerHTML=achHtml;
            show('death-screen');

            var deathTimer=3;
            setText('death-timer',deathTimer);
            _deathAutoTimer=setInterval(function(){
              deathTimer--;
              setText('death-timer',Math.max(0,deathTimer));
              if (deathTimer<=0){
                clearInterval(_deathAutoTimer); _deathAutoTimer=null;
                goHome();
              }
            },1000);
          } else { respawn(); }
        }
        updateCamera(delta);
        return;
      }

      /* ── Won phase ── */
      if (won) {
        updateCamera(delta);
        if (now-_wonTime>2.5) {
          won=false; hide('hud');
          var timeBonus=Math.max(0,Math.floor(1200-elapsed*3));
          score+=timeBonus;
          setText('win-score','Score: '+score);
          setText('win-bonus','⏱ Time Bonus: +'+timeBonus);
          if (sessionDeaths===0) unlockAchievement('survivor');
          if (levelIdx===9)      unlockAchievement('level_10');
          var winAchHtml=getSessionAchievements().map(function(a){return '<span class="inline-ach">'+a.icon+' '+a.name+'</span>';}).join('');
          var winAch=document.getElementById('win-achievements');
          if (winAch) winAch.innerHTML=winAchHtml;
          show('win-screen');
        }
        return;
      }

      // Events
      evtSched.update(now, scene, pacman);

      // Move Pac-Man
      var dmResult=movePacman(delta, evtSched._reversed);
      if (dmResult==='mwdeath') { showBanner('🧱 CRUSHED!','#FF6600'); triggerDeath(now); return; }

      updateCamera(delta);
      updateMovingWalls(movingWalls, delta);

      // Portal check
      var portalResult=checkPortals(pacman, portals, now);
      if (portalResult==='fake') { showBanner('💥 FAKE PORTAL!','#FF4444'); triggerDeath(now); return; }

      // Laser check
      if (checkLasers(pacman, lasers)) { showBanner('🚀 LASER HIT!','#FF0000'); triggerDeath(now); return; }

      // Ghost spawn
      var spawnInterval=GHOST_SPAWN_INTERVAL/(1+levelIdx*0.18);
      if (numGhosts<maxGhosts && now-ghostSpawnAt>=spawnInterval) {
        spawnGhost(scene, map.ghostSpawn, numGhosts);
        numGhosts++; ghostSpawnAt=now;
      }

      // Ghost update + collision
      var effectiveGhostSpeed=ghostSpeed*(evtSched._ghostBoost?1.85:1);
      scene.children.slice().forEach(function(o) {
        if (!o.isGhost) return;
        updateGhostAI(o, pacman.position);
        var spd=effectiveGhostSpeed;
        if (_activePower==='glue' && dist(pacman,o)<4) spd*=0.25;
        moveGhost(o, delta, map, spd);
        animateGhost(o, delta, false);

        var hitDist=PACMAN_RADIUS+(o._ghostRadius||GHOST_RADIUS)+0.05;
        if (!dying && dist(pacman,o)<hitDist) {
          if (_activePower==='killer') {
            scene.remove(o); score+=200*_combo;
            setText('score-val',score);
            showBanner('💀 GHOST EATEN! +'+(200*_combo),'#FF4444');
            unlockAchievement('ghost_killer');
            numGhosts--;
          } else if (_activePower!=='invisible') {
            triggerDeath(now);
          }
        }
      });

      // Win check
      if (!won && numDotsEaten>=map.numDots) { won=true; _wonTime=now; }
    }

    /* ── Render loop ── */
    _cancelLoop = animationLoop(function(delta, now) {
      update(delta, now);
      _renderer.setViewport(0,0,window.innerWidth,window.innerHeight);
      _renderer.render(scene, camera);
      renderMiniMap(_renderer, hudCam, scene);
    });
  }

  /* ════════════════════════════════════════════════════
     GO HOME
  ════════════════════════════════════════════════════ */
  function goHome() {
    cleanupGame();
    hide('death-screen'); hide('win-screen'); hide('hud'); hide('respawn-screen');
    renderHighScores(); renderAchievementsGrid();
    show('start-screen');
  }

  /* ════════════════════════════════════════════════════
     WIRE UP UI
  ════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function() {
    loadAchievements();
    renderHighScores();
    renderAchievementsGrid();

    document.querySelectorAll('.lvl-btn').forEach(function(b) {
      b.addEventListener('click', function() {
        document.querySelectorAll('.lvl-btn').forEach(function(x){x.classList.remove('active');});
        b.classList.add('active');
        _levelIndex = parseInt(b.dataset.lvl)||0;
      });
    });
    document.querySelectorAll('.acc-color').forEach(function(el) {
      el.addEventListener('click', function() {
        document.querySelectorAll('.acc-color').forEach(function(x){x.classList.remove('active');});
        el.classList.add('active'); _pacColor=el.dataset.color;
      });
    });
    document.querySelectorAll('#pac-hat-select .acc-opt').forEach(function(el) {
      el.addEventListener('click', function() {
        document.querySelectorAll('#pac-hat-select .acc-opt').forEach(function(x){x.classList.remove('active');});
        el.classList.add('active'); _pacHat=el.dataset.hat;
      });
    });
    document.querySelectorAll('#pac-eyes-select .acc-opt').forEach(function(el) {
      el.addEventListener('click', function() {
        document.querySelectorAll('#pac-eyes-select .acc-opt').forEach(function(x){x.classList.remove('active');});
        el.classList.add('active'); _pacEyes=el.dataset.eyes;
      });
    });
    document.querySelectorAll('#pac-trail-select .acc-opt').forEach(function(el) {
      el.addEventListener('click', function() {
        document.querySelectorAll('#pac-trail-select .acc-opt').forEach(function(x){x.classList.remove('active');});
        el.classList.add('active'); _pacTrail=el.dataset.trail;
      });
    });

    var playBtn=document.getElementById('play-btn');
    if (playBtn) playBtn.addEventListener('click', startGame);

    var retryBtn=document.getElementById('retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', function() {
      if (_deathAutoTimer){ clearInterval(_deathAutoTimer); _deathAutoTimer=null; }
      var name=document.getElementById('player-name').value||'PAC';
      var sc=parseInt((document.getElementById('final-score')||{}).textContent.replace('Score: ','')||'0');
      addScore(name,sc); renderHighScores(); restartGame();
    });

    var nextBtn=document.getElementById('next-btn');
    if (nextBtn) nextBtn.addEventListener('click', nextLevel);

    var saveBtn=document.getElementById('save-score-btn');
    if (saveBtn) saveBtn.addEventListener('click', function() {
      var name=document.getElementById('player-name').value||'PAC';
      var sc=parseInt((document.getElementById('final-score')||{}).textContent.replace('Score: ','')||'0');
      addScore(name,sc); renderHighScores();
      document.getElementById('name-input-wrap').style.display='none';
    });

    document.querySelectorAll('.pm-btn').forEach(function(b) {
      b.addEventListener('click', function() {
        hide('power-menu'); _showingPowerMenu=false;
        document.getElementById('power-menu').style.display='none';
        activatePower(b.dataset.power, performance.now()/1000);
      });
    });
  });

})();
