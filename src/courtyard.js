import * as THREE from 'three';
import { FLARE_ORIGIN, FLARE_ANGLE } from './architecture.js';

/**
 * Custom animated Mediterranean plunge-pool water shader with realistic
 * turquoise absorption, subtle caustic shimmer, and Fresnel sky reflection.
 */
function createPoolWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(0x1f4e48) },
      uShallowColor: { value: new THREE.Color(0x467e76) },
      uSkyColor: { value: new THREE.Color(0xdbe7ec) },
      uSunDir: { value: new THREE.Vector3(0.65, 0.62, 0.25).normalize() },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec3 p = position;
        float w1 = sin(p.x * 5.2 + uTime * 1.4) * cos(p.y * 4.6 - uTime * 1.1) * 0.005;
        float w2 = sin((p.x + p.y) * 9.5 - uTime * 1.9) * 0.0025;
        p.z += w1 + w2;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uSkyColor;
      uniform vec3 uSunDir;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vec2 q = vWorldPos.xz * 3.6;
        float nx = cos(q.x + uTime * 1.5) * 0.07 + cos(q.x * 2.3 - q.y * 1.7 - uTime * 2.1) * 0.05;
        float nz = sin(q.y - uTime * 1.3) * 0.07 + sin(q.y * 2.6 + q.x * 1.4 + uTime * 1.8) * 0.05;
        vec3 N = normalize(vec3(nx, 1.0, nz));

        vec3 V = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.6);

        // Edge-to-center turquoise depth gradient + subtle wave shimmer
        float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float depthMix = smoothstep(0.0, 0.35, edge);
        float caustic = 0.5 + 0.5 * sin(q.x * 2.2 + sin(q.y * 2.0 + uTime * 1.6));
        vec3 waterBase = mix(uShallowColor, uDeepColor, depthMix) + vec3(0.05, 0.08, 0.07) * caustic * 0.45;

        // Soft specular sun glint
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 90.0) * 0.55;

        vec3 col = mix(waterBase, uSkyColor, clamp(fresnel * 0.72 + 0.12, 0.0, 0.85)) + vec3(1.0, 0.97, 0.9) * spec;
        gl_FragColor = vec4(col, 0.94);
      }
    `,
    transparent: true,
  });
}

/**
 * Sculpted ribbed Mediterranean terracotta amphora planter via LatheGeometry.
 */
function createTerracottaAmphora(radiusMax, height, openTop, mat) {
  const pts = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * height;
    // Classic rounded belly tapering at base and neck with rolled rim lip
    let r;
    if (t < 0.08) {
      r = radiusMax * (0.52 + (t / 0.08) * 0.14);
    } else if (t < 0.62) {
      const u = (t - 0.08) / 0.54;
      r = radiusMax * (0.66 + Math.sin(u * Math.PI * 0.78) * 0.34);
    } else if (t < 0.92) {
      const u = (t - 0.62) / 0.30;
      r = radiusMax * (0.98 - u * 0.24);
    } else {
      const u = (t - 0.92) / 0.08;
      r = radiusMax * (0.74 + Math.sin(u * Math.PI) * 0.065);
    }
    // Subtle wheel-thrown horizontal ribs
    r += Math.sin(t * Math.PI * 18) * 0.0045;
    pts.push(new THREE.Vector2(Math.max(0.02, r), y));
  }

  if (openTop) {
    pts.push(new THREE.Vector2(pts[pts.length - 1].x - 0.032, height));
    pts.push(new THREE.Vector2(pts[pts.length - 1].x - 0.035, height - 0.08));
  }

  const geo = new THREE.LatheGeometry(pts, 36);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Sculpted 3D Bird of Paradise (Strelitzia nicolai) with arched stems & paddle leaves.
 */
function createStrelitziaPlant(leafMat) {
  const plant = new THREE.Group();

  // Create curved paddle leaf geometry once and clone with organic transforms
  const createPaddleLeaf = (len, wid, arch) => {
    const segY = 16;
    const segX = 6;
    const geo = new THREE.PlaneGeometry(wid, len, segX, segY);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const ly = pos.getY(i) + len * 0.5; // 0 at base -> len at tip
      const t = THREE.MathUtils.clamp(ly / len, 0, 1);
      // Paddle silhouette: narrow petiole base -> broad mid-upper blade -> rounded tip
      const profile = Math.pow(Math.max(0, Math.sin(Math.pow(t, 0.65) * Math.PI)), 0.72);
      const nx = lx * (0.14 + 0.86 * profile);
      // V-fold trough along central midrib + graceful outward arch
      const vFold = Math.abs(nx / (wid * 0.5 + 0.001)) * 0.035 * profile;
      const zArch = -Math.pow(t, 1.85) * arch + vFold;
      pos.setXYZ(i, nx, ly, zArch);
    }
    geo.computeVertexNormals();
    return geo;
  };

  const configs = [
    { h: 0.42, len: 0.88, wid: 0.30, arch: 0.22, rotY: 0.15, tiltX: 0.22, tiltZ: -0.10 },
    { h: 0.48, len: 0.96, wid: 0.33, arch: 0.20, rotY: 0.75, tiltX: 0.15, tiltZ: 0.08 },
    { h: 0.38, len: 0.78, wid: 0.28, arch: 0.28, rotY: -0.55, tiltX: 0.32, tiltZ: -0.15 },
    { h: 0.45, len: 0.84, wid: 0.29, arch: 0.25, rotY: 1.55, tiltX: 0.28, tiltZ: 0.05 },
    { h: 0.35, len: 0.72, wid: 0.26, arch: 0.30, rotY: 2.35, tiltX: 0.36, tiltZ: -0.06 },
    { h: 0.40, len: 0.76, wid: 0.27, arch: 0.26, rotY: -1.45, tiltX: 0.34, tiltZ: 0.12 },
    { h: 0.30, len: 0.62, wid: 0.24, arch: 0.28, rotY: -2.55, tiltX: 0.42, tiltZ: 0.0 },
    { h: 0.52, len: 0.92, wid: 0.31, arch: 0.16, rotY: -0.15, tiltX: 0.09, tiltZ: 0.04 },
  ];

  const stemMat = new THREE.MeshStandardMaterial({ color: 0x2e4a2b, roughness: 0.55 });

  for (const cfg of configs) {
    const frond = new THREE.Group();
    frond.rotation.y = cfg.rotY;

    const stemCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, cfg.h * 0.55, -0.04),
      new THREE.Vector3(0, cfg.h, -0.11)
    );
    const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 8, 0.015, 7, false), stemMat);
    stem.castShadow = true;
    frond.add(stem);

    const blade = new THREE.Mesh(createPaddleLeaf(cfg.len, cfg.wid, cfg.arch), leafMat);
    blade.position.set(0, cfg.h - 0.02, -0.11);
    blade.rotation.x = -cfg.tiltX;
    blade.rotation.z = cfg.tiltZ;
    blade.castShadow = true;
    blade.receiveShadow = true;
    frond.add(blade);

    plant.add(frond);
  }

  return plant;
}

/**
 * Lush cascading 3D Bougainvillea vine along the top crest & right corner
 * of the Mallorcan dry-stone courtyard wall using high-performance InstancedMesh.
 */
function createBougainvilleaCascade(mats) {
  const group = new THREE.Group();

  // Subtle folded bract petal cluster geometry (compact organic papery bracts)
  const petalPlane = new THREE.CircleGeometry(0.026, 6);
  const pos = petalPlane.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.abs(x) * 0.45);
  }
  petalPlane.computeVertexNormals();

  // Deterministic pseudo-random helper so foliage layout is rich & consistent
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Generate anchor clusters:
  // 1) Cascading drape across the upper stone wall (z: -0.25..2.45, y: 1.95..2.85)
  // 2) Vertical flowering column climbing down the right corner (z: -0.25..0.52, y: 0.72..2.35)
  const clusterPoints = [];

  for (let i = 0; i < 480; i++) {
    const z = -0.3 + rand() * 2.85;
    // Lower hang on left & right, arched in middle matching reference photo!
    const archDrop = 0.34 * Math.sin(((z + 0.3) / 2.85) * Math.PI);
    const yMax = 2.92;
    const yMin = 1.96 + archDrop - (z < 0.58 ? (0.58 - z) * 1.55 : 0);
    const y = yMin + Math.pow(rand(), 0.75) * (yMax - yMin);
    const xOffset = 0.05 + rand() * 0.28;
    clusterPoints.push(new THREE.Vector3(xOffset, y, z));
  }

  // Extra dense vertical cascade on the right corner
  for (let i = 0; i < 320; i++) {
    const t = rand();
    const y = 0.76 + t * 1.72;
    const spread = 0.22 + t * 0.38;
    const z = -0.26 + rand() * spread;
    const xOffset = 0.07 + rand() * 0.30;
    clusterPoints.push(new THREE.Vector3(xOffset, y, z));
  }

  // Woody climbing stems on the right corner
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4738, roughness: 0.9 });
  for (let s = 0; s < 3; s++) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, 0.0, -0.08 + s * 0.07),
      new THREE.Vector3(0.09, 0.7, 0.02 + s * 0.05),
      new THREE.Vector3(0.12, 1.45, -0.04 + s * 0.09),
      new THREE.Vector3(0.14, 2.25, 0.12 + s * 0.12),
    ]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.018 - s * 0.003, 6, false), trunkMat);
    stem.castShadow = true;
    group.add(stem);
  }

  // Distribute bracts across 3 rich magenta/fuchsia shades + deep-green vine leaves
  const bractMats = [
    mats.bougainvilleaMagenta,
    mats.bougainvilleaPink,
    mats.bougainvilleaDeep,
  ];
  const perShade = Math.ceil((clusterPoints.length * 3) / 3);
  const instBracts = bractMats.map((m) => {
    const im = new THREE.InstancedMesh(petalPlane, m, perShade + 40);
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  });
  const counts = [0, 0, 0];

  const instLeaves = new THREE.InstancedMesh(petalPlane, mats.vineLeaf, clusterPoints.length * 2);
  instLeaves.castShadow = false;
  instLeaves.receiveShadow = true;
  let leafIdx = 0;

  const dummy = new THREE.Object3D();

  for (const pt of clusterPoints) {
    // 2 green leaves per cluster
    for (let l = 0; l < 2; l++) {
      dummy.position.set(
        pt.x - 0.03 + (rand() - 0.5) * 0.11,
        pt.y + (rand() - 0.5) * 0.11,
        pt.z + (rand() - 0.5) * 0.11
      );
      dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      const sc = 0.85 + rand() * 0.55;
      dummy.scale.set(sc, sc * 1.15, sc);
      dummy.updateMatrix();
      instLeaves.setMatrixAt(leafIdx++, dummy.matrix);
    }

    // 3 vibrant papery magenta bracts per cluster
    for (let b = 0; b < 3; b++) {
      const shade = Math.floor(rand() * 3);
      if (counts[shade] >= instBracts[shade].count) continue;
      dummy.position.set(
        pt.x + (rand() - 0.35) * 0.13,
        pt.y + (rand() - 0.5) * 0.13,
        pt.z + (rand() - 0.5) * 0.13
      );
      dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      const sc = 0.78 + rand() * 0.65;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      instBracts[shade].setMatrixAt(counts[shade]++, dummy.matrix);
    }
  }

  instLeaves.count = leafIdx;
  instLeaves.instanceMatrix.needsUpdate = true;
  group.add(instLeaves);

  for (let s = 0; s < 3; s++) {
    instBracts[s].count = counts[s];
    instBracts[s].instanceMatrix.needsUpdate = true;
    group.add(instBracts[s]);
  }

  return group;
}

export function buildCourtyard(scene, mats, walkableMeshes) {
  // Align courtyard terrace with the flared courtyard window bay for clean geometry & walkability
  const courtyard = new THREE.Group();
  courtyard.position.copy(FLARE_ORIGIN);
  courtyard.rotation.y = FLARE_ANGLE;

  const PATIO_Y = 0.51;

  // 1. Outdoor Cream Microcement Terrace Floor (x_local = -0.48..-3.85, z_local = -1.2..4.6)
  const patioSlab = new THREE.Mesh(
    new THREE.BoxGeometry(3.55, 0.54, 5.8),
    mats.patioMicrocement
  );
  patioSlab.position.set(-2.22, PATIO_Y - 0.27, 1.65);
  patioSlab.userData.walkable = true;
  patioSlab.receiveShadow = true;
  walkableMeshes.push(patioSlab);
  courtyard.add(patioSlab);

  // 2. Mallorcan Dry-Stone Masonry Back Wall & Side Return Walls
  // Back wall facing the window opening at x_local = -3.45
  const stoneBackWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 3.65, 5.8),
    mats.courtyardStone
  );
  stoneBackWall.position.set(-3.65, PATIO_Y + 1.65, 1.65);
  stoneBackWall.castShadow = true;
  stoneBackWall.receiveShadow = true;
  courtyard.add(stoneBackWall);

  // Right return stone wall (z_local = -0.65) — ends cleanly outside exterior wall (x_local <= -0.70)
  const stoneRightWall = new THREE.Mesh(
    new THREE.BoxGeometry(2.95, 3.65, 0.45),
    mats.courtyardStone
  );
  stoneRightWall.position.set(-2.22, PATIO_Y + 1.65, -0.68);
  stoneRightWall.castShadow = true;
  stoneRightWall.receiveShadow = true;
  courtyard.add(stoneRightWall);

  // High pergola/parapet gobo above head height sculpting the diagonal sun/shade across the stone wall
  const shadowWing = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.35, 1.9),
    mats.limeWall
  );
  shadowWing.position.set(-2.1, 3.85, 0.05);
  shadowWing.castShadow = true;
  courtyard.add(shadowWing);

  // Left enclosing courtyard wall (z_local = +4.35, out of initial frame, encloses patio when walking out)
  const stoneLeftWall = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 3.3, 0.4),
    mats.courtyardStone
  );
  stoneLeftWall.position.set(-2.05, PATIO_Y + 1.5, 4.38);
  stoneLeftWall.castShadow = true;
  stoneLeftWall.receiveShadow = true;
  courtyard.add(stoneLeftWall);

  // 3. Raised Microcement Plunge Pool (Alberca)
  // Positioned at x_local = -1.78..-3.42, z_local = 0.22..2.65, rim height = PATIO_Y + 0.50m
  const poolGroup = new THREE.Group();
  const poolH = 0.50;
  const poolTopY = PATIO_Y + poolH;
  const wallT = 0.20;

  // Front coping wall (facing window)
  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, poolH, 2.48), mats.poolCoping);
  frontWall.position.set(-1.82, PATIO_Y + poolH * 0.5, 1.46);
  // Right coping wall (visible return edge in photo at x = 225..275, y = 218..295!)
  const rightCoping = new THREE.Mesh(new THREE.BoxGeometry(1.65, poolH, wallT), mats.poolCoping);
  rightCoping.position.set(-2.62, PATIO_Y + poolH * 0.5, 0.32);
  // Left coping wall
  const leftCoping = new THREE.Mesh(new THREE.BoxGeometry(1.65, poolH, wallT), mats.poolCoping);
  leftCoping.position.set(-2.62, PATIO_Y + poolH * 0.5, 2.60);
  // Back coping ledge against stone wall
  const backCoping = new THREE.Mesh(new THREE.BoxGeometry(wallT, poolH, 2.48), mats.poolCoping);
  backCoping.position.set(-3.34, PATIO_Y + poolH * 0.5, 1.46);
  // Inner turquoise basin floor & walls
  const basinFloor = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.08, 2.12), mats.poolBasin);
  basinFloor.position.set(-2.58, PATIO_Y + 0.06, 1.46);

  for (const m of [frontWall, rightCoping, leftCoping, backCoping, basinFloor]) {
    m.castShadow = true;
    m.receiveShadow = true;
    poolGroup.add(m);
  }

  // Animated turquoise rippling water surface (lightweight 14x18 mesh)
  const waterMat = createPoolWaterMaterial();
  const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 2.08, 14, 18), waterMat);
  waterMesh.rotation.x = -Math.PI * 0.5;
  waterMesh.position.set(-2.58, poolTopY - 0.055, 1.46);
  poolGroup.add(waterMesh);

  courtyard.add(poolGroup);

  // 4. Two Rustic Ribbed Terracotta Amphora Planters + Bird of Paradise (Strelitzia)
  const tallPot = createTerracottaAmphora(0.26, 0.56, true, mats.terracotta);
  tallPot.position.set(-1.44, PATIO_Y, 1.66);
  courtyard.add(tallPot);

  const tallPotAO = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.68), mats.contactShadow);
  tallPotAO.rotation.x = -Math.PI * 0.5;
  tallPotAO.position.set(-1.44, PATIO_Y + 0.004, 1.66);
  courtyard.add(tallPotAO);

  // Dark potting soil disc inside tall pot
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.04, 14),
    new THREE.MeshStandardMaterial({ color: 0x2c221b, roughness: 0.95 })
  );
  soil.position.set(-1.44, PATIO_Y + 0.49, 1.66);
  courtyard.add(soil);

  // Lush 3D Bird of Paradise emerging from the taller terracotta pot
  const strelitzia = createStrelitziaPlant(mats.leafTropical);
  strelitzia.position.set(-1.44, PATIO_Y + 0.48, 1.66);
  courtyard.add(strelitzia);

  // Shorter rounded companion terracotta amphora pot right beside it
  const shortPot = createTerracottaAmphora(0.21, 0.43, true, mats.terracotta);
  shortPot.position.set(-1.32, PATIO_Y, 1.24);
  courtyard.add(shortPot);

  const shortPotAO = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), mats.contactShadow);
  shortPotAO.rotation.x = -Math.PI * 0.5;
  shortPotAO.position.set(-1.32, PATIO_Y + 0.004, 1.24);
  courtyard.add(shortPotAO);

  // 5. Vibrant Magenta Bougainvillea Climbing Vine across upper dry-stone wall & right corner
  const bougainvillea = createBougainvilleaCascade(mats);
  bougainvillea.position.set(-3.42, PATIO_Y, 0.0);
  courtyard.add(bougainvillea);

  scene.add(courtyard);

  return {
    courtyard,
    update(elapsed) {
      waterMat.uniforms.uTime.value = elapsed;
    },
  };
}
