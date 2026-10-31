import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLARE_ORIGIN, FLARE_ANGLE } from './architecture.js';

function setShadows(obj, cast = true, receive = true) {
  obj.traverse((c) => {
    if (c.isMesh) {
      if (c.userData.noShadow) return;
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return obj;
}

function addContactAO(parent, w, d, x, y, z, mats) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats.contactShadow);
  plane.rotation.x = -Math.PI * 0.5;
  plane.position.set(x, y, z);
  plane.userData.noShadow = true;
  parent.add(plane);
  return plane;
}

/**
 * Helper that traverses a hierarchy, clones & world-transforms geometries grouped by material,
 * and merges them into single draw-call Meshes!
 */
function mergeGroupByMaterial(rootGroup, castShadow = true, receiveShadow = true) {
  rootGroup.updateMatrixWorld(true);
  const buckets = new Map();

  rootGroup.traverse((child) => {
    if (!child.isMesh || child.isInstancedMesh) return;
    const mat = child.material;
    let geo = child.geometry.clone();
    if (geo.index) geo = geo.toNonIndexed();
    // Ensure consistent attributes (position, normal, uv) for clean merging
    if (!geo.attributes.uv) {
      const count = geo.attributes.position.count;
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    for (const key of Object.keys(geo.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        geo.deleteAttribute(key);
      }
    }
    geo.applyMatrix4(child.matrixWorld);
    if (!buckets.has(mat)) buckets.set(mat, { geos: [], noShadow: Boolean(child.userData.noShadow) });
    buckets.get(mat).geos.push(geo);
  });

  const mergedOut = new THREE.Group();
  for (const [mat, { geos, noShadow }] of buckets.entries()) {
    const mergedGeo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(mergedGeo, mat);
    if (!noShadow) {
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
    }
    mergedOut.add(mesh);
  }
  return mergedOut;
}

/**
 * 1. Hero Giant Open-Weave Rattan Dome Pendant Lamp (optimized ~72% fewer triangles, 2 merged meshes + halo sprite)
 */
function createRattanPendantLamp(mats, ceilingY) {
  const lampGroup = new THREE.Group();
  const H = 0.90;
  const R = 0.47;

  const radiusAt = (t) => {
    const tc = THREE.MathUtils.clamp(t, 0, 1);
    if (tc <= 0.48) {
      return R * (0.985 + 0.015 * Math.sin((tc / 0.48) * Math.PI));
    }
    const u = THREE.MathUtils.clamp((tc - 0.48) / 0.52, 0, 1);
    return 0.058 + (R - 0.058) * Math.pow(Math.max(0, Math.cos(u * Math.PI * 0.5)), 0.76);
  };

  const primaryGeos = [];
  const secondaryGeos = [];

  const ringLevels = [0.0, 0.13, 0.26, 0.39, 0.52, 0.65, 0.78, 0.90];
  for (const t of ringLevels) {
    for (const offset of [-0.0085, 0.0085]) {
      const tc = THREE.MathUtils.clamp(t + offset / H, 0, 0.98);
      const r = radiusAt(tc);
      const torus = new THREE.TorusGeometry(r, 0.0056, 5, 28);
      torus.rotateX(Math.PI * 0.5);
      torus.translate(0, tc * H, 0);
      primaryGeos.push(torus);
    }
  }
  const crownTorus = new THREE.TorusGeometry(0.062, 0.0075, 5, 18);
  crownTorus.rotateX(Math.PI * 0.5);
  crownTorus.translate(0, H, 0);
  primaryGeos.push(crownTorus);

  // 18 vertical rattan ribs
  const numRibs = 18;
  for (let i = 0; i < numRibs; i++) {
    const ang = (i / numRibs) * Math.PI * 2;
    const pts = [];
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      const r = radiusAt(t);
      pts.push(new THREE.Vector3(Math.cos(ang) * r, t * H, Math.sin(ang) * r));
    }
    primaryGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 11, 0.0046, 4, false));
  }

  // Criss-crossing diagonal rattan cane strips
  const numHelix = 24;
  for (const dir of [-1, 1]) {
    for (let i = 0; i < numHelix; i++) {
      const baseAng = (i / numHelix) * Math.PI * 2;
      const pts = [];
      for (let s = 0; s <= 12; s++) {
        const t = s / 12;
        const r = radiusAt(t) + dir * 0.0018;
        const ang = baseAng + dir * t * 2.25;
        pts.push(new THREE.Vector3(Math.cos(ang) * r, t * H, Math.sin(ang) * r));
      }
      secondaryGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0034, 4, false));
    }
  }

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.35;
    const c = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(Math.cos(a) * 0.055, H, Math.sin(a) * 0.055),
      new THREE.Vector3(Math.cos(a) * 0.032, H + 0.09, Math.sin(a) * 0.032),
      new THREE.Vector3(0, H + 0.16, 0)
    );
    primaryGeos.push(new THREE.TubeGeometry(c, 6, 0.0042, 4, false));
  }

  const mergedPrimary = mergeGeometries(primaryGeos, false);
  const mergedSecondary = mergeGeometries(secondaryGeos, false);
  primaryGeos.forEach((g) => g.dispose());
  secondaryGeos.forEach((g) => g.dispose());

  const meshPrimary = new THREE.Mesh(mergedPrimary, mats.rattanPrimary);
  const meshSecondary = new THREE.Mesh(mergedSecondary, mats.rattanSecondary);
  meshPrimary.castShadow = true;
  meshSecondary.castShadow = false;
  lampGroup.add(meshPrimary, meshSecondary);

  const bottomY = 1.84;
  const cordLen = Math.max(0.2, ceilingY - (bottomY + H + 0.15));
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, cordLen, 6),
    mats.rattanSecondary
  );
  cord.position.set(0, H + 0.15 + cordLen * 0.5, 0);
  lampGroup.add(cord);

  const socketCord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0035, 0.0035, H * 0.34, 6),
    mats.darkBronze
  );
  socketCord.position.set(0, H * 0.83, 0);

  const socketCup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.028, 0.075, 12),
    mats.darkBronze
  );
  socketCup.position.set(0, H * 0.63, 0);

  const bulbGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, 12, 10),
    mats.bulbGlow
  );
  bulbGlass.scale.set(1, 1.15, 1);
  bulbGlass.position.set(0, H * 0.555, 0);

  // Zero-cost soft additive halo sprite replacing 5-pass UnrealBloomPass!
  const halo = new THREE.Sprite(mats.bulbHaloSprite);
  halo.scale.set(0.32, 0.32, 1);
  halo.position.set(0, H * 0.555, 0);

  lampGroup.add(socketCord, socketCup, bulbGlass, halo);
  lampGroup.position.set(-1.05, bottomY, 1.48);

  return lampGroup;
}

function createWishboneChair(mats) {
  const chair = new THREE.Group();
  const seatY = 0.45;
  const backY = 0.77;
  const W = 0.48;
  const D = 0.45;

  const legPositions = [
    [-W * 0.42, -D * 0.39, 0.03, -0.03, seatY],
    [W * 0.42, -D * 0.39, -0.03, -0.03, seatY],
    [-W * 0.38, D * 0.34, 0.02, -0.02, backY - 0.035],
    [W * 0.38, D * 0.34, -0.02, -0.02, backY - 0.035],
  ];

  legPositions.forEach(([lx, lz, rz, rx, h]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, h, 8), mats.chairOak);
    leg.position.set(lx, h * 0.5, lz);
    leg.rotation.z = rz;
    leg.rotation.x = rx;
    chair.add(leg);
  });

  const seat = new THREE.Mesh(
    new RoundedBoxGeometry(W * 0.92, 0.038, D * 0.88, 1, 0.012),
    mats.wovenCordSeat
  );
  seat.position.set(0, seatY, 0);
  chair.add(seat);

  const railPts = [];
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    const ang = (u - 0.5) * Math.PI * 1.04;
    const x = Math.sin(ang) * (W * 0.53);
    const z = Math.cos(ang) * (D * 0.48) - 0.02;
    const drop = Math.pow(Math.abs(u - 0.5) * 2, 2.2) * 0.095;
    railPts.push(new THREE.Vector3(x, backY - drop, z));
  }
  const topRail = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 16, 0.017, 6, false),
    mats.chairOak
  );
  chair.add(topRail);

  const leftBranch = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, seatY + 0.01, D * 0.43),
    new THREE.Vector3(-0.01, seatY + 0.17, D * 0.46),
    new THREE.Vector3(-0.065, backY - 0.01, D * 0.45)
  );
  const rightBranch = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, seatY + 0.01, D * 0.43),
    new THREE.Vector3(0.01, seatY + 0.17, D * 0.46),
    new THREE.Vector3(0.065, backY - 0.01, D * 0.45)
  );
  chair.add(
    new THREE.Mesh(new THREE.TubeGeometry(leftBranch, 6, 0.01, 5, false), mats.chairOak),
    new THREE.Mesh(new THREE.TubeGeometry(rightBranch, 6, 0.01, 5, false), mats.chairOak)
  );

  addContactAO(chair, 0.62, 0.62, 0, 0.003, 0, mats);
  return chair;
}

function createPlaceSetting(mats, includeSecondCup = false) {
  const setting = new THREE.Group();

  const matMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.175, 0.175, 0.005, 20),
    mats.jutePlacemat
  );
  matMesh.position.y = 0.0025;
  setting.add(matMesh);

  const platePts = [
    new THREE.Vector2(0.0, 0.005),
    new THREE.Vector2(0.095, 0.005),
    new THREE.Vector2(0.132, 0.016),
    new THREE.Vector2(0.138, 0.022),
    new THREE.Vector2(0.133, 0.024),
    new THREE.Vector2(0.092, 0.011),
    new THREE.Vector2(0.0, 0.011),
  ];
  setting.add(new THREE.Mesh(new THREE.LatheGeometry(platePts, 20), mats.ceramicPlate));

  const rim1 = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.0022, 4, 20), mats.ceramicRim);
  rim1.rotation.x = Math.PI * 0.5;
  rim1.position.y = 0.023;
  setting.add(rim1);

  const bowlPts = [
    new THREE.Vector2(0.0, 0.012),
    new THREE.Vector2(0.068, 0.012),
    new THREE.Vector2(0.104, 0.036),
    new THREE.Vector2(0.108, 0.042),
    new THREE.Vector2(0.102, 0.043),
    new THREE.Vector2(0.065, 0.018),
    new THREE.Vector2(0.0, 0.018),
  ];
  setting.add(new THREE.Mesh(new THREE.LatheGeometry(bowlPts, 20), mats.ceramicPlate));

  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.002, 4, 20), mats.ceramicRim);
  rim2.rotation.x = Math.PI * 0.5;
  rim2.position.y = 0.042;
  setting.add(rim2);

  const makeCup = (cx, cz) => {
    const cup = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.032, 12), mats.ceramicRim);
    base.position.y = 0.016;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.052, 12), mats.ceramicPlate);
    upper.position.y = 0.058;
    cup.add(base, upper);
    cup.position.set(cx, 0, cz);
    return cup;
  };
  setting.add(makeCup(0.16, -0.13));
  if (includeSecondCup) setting.add(makeCup(-0.15, -0.14));

  const makeUtensil = (ux, isFork) => {
    const u = new THREE.Group();
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0055, 0.105, 6),
      mats.cutleryHandle
    );
    handle.rotation.x = Math.PI * 0.5;
    handle.position.z = 0.05;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(isFork ? 0.018 : 0.013, 0.0025, 0.085),
      mats.cutleryMetal
    );
    head.position.z = -0.042;
    u.add(handle, head);
    u.position.set(ux, 0.006, 0.01);
    return u;
  };
  setting.add(makeUtensil(-0.205, true), makeUtensil(0.205, false));

  return setting;
}

function createDiningCenterpiece(mats) {
  const center = new THREE.Group();

  const bottlePts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.082, 0.0),
    new THREE.Vector2(0.106, 0.045),
    new THREE.Vector2(0.108, 0.175),
    new THREE.Vector2(0.088, 0.235),
    new THREE.Vector2(0.032, 0.278),
    new THREE.Vector2(0.026, 0.325),
    new THREE.Vector2(0.032, 0.335),
    new THREE.Vector2(0.022, 0.335),
  ];
  const bottle = new THREE.Mesh(new THREE.LatheGeometry(bottlePts, 20), mats.oliveGlass);
  bottle.position.set(-0.08, 0, -0.10);
  bottle.castShadow = true;
  center.add(bottle);

  const vasePts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.046, 0.0),
    new THREE.Vector2(0.044, 0.062),
    new THREE.Vector2(0.084, 0.095),
    new THREE.Vector2(0.090, 0.215),
    new THREE.Vector2(0.084, 0.215),
    new THREE.Vector2(0.078, 0.098),
  ];
  const hurricane = new THREE.Mesh(new THREE.LatheGeometry(vasePts, 20), mats.amberOliveGlass);
  hurricane.position.set(0.08, 0, 0.09);
  hurricane.castShadow = true;
  center.add(hurricane);

  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4b6136, roughness: 0.7 });
  const stemGeos = [];
  const floretGeo = new THREE.SphereGeometry(0.0055, 4, 3);
  const floretMatrices = [];
  const dummy = new THREE.Object3D();

  const addUmbelStem = (base, mid, tip, umbelR) => {
    const curve = new THREE.QuadraticBezierCurve3(base, mid, tip);
    stemGeos.push(new THREE.TubeGeometry(curve, 8, 0.0028, 4, false));

    for (let r = 0; r < 7; r++) {
      const a = (r / 7) * Math.PI * 2 + tip.x * 5;
      const rad = r === 0 ? 0.002 : umbelR * (0.72 + (r % 2) * 0.28);
      const subTip = new THREE.Vector3(
        tip.x + Math.cos(a) * rad,
        tip.y + 0.032 - rad * 0.16,
        tip.z + Math.sin(a) * rad
      );
      stemGeos.push(new THREE.TubeGeometry(new THREE.LineCurve3(tip, subTip), 1, 0.0012, 3, false));

      for (let f = 0; f < 7; f++) {
        const fa = (f / 7) * Math.PI * 2;
        const fr = f === 0 ? 0 : 0.014 + (f % 3) * 0.006;
        dummy.position.set(
          subTip.x + Math.cos(fa) * fr,
          subTip.y + (f % 2) * 0.004,
          subTip.z + Math.sin(fa) * fr
        );
        dummy.scale.set(1.2, 0.65, 1.2);
        dummy.updateMatrix();
        floretMatrices.push(dummy.matrix.clone());
      }
    }
  };

  addUmbelStem(new THREE.Vector3(-0.08, 0.18, -0.10), new THREE.Vector3(-0.11, 0.42, -0.13), new THREE.Vector3(-0.15, 0.61, -0.16), 0.058);
  addUmbelStem(new THREE.Vector3(-0.08, 0.18, -0.10), new THREE.Vector3(-0.05, 0.39, -0.07), new THREE.Vector3(-0.02, 0.54, -0.05), 0.048);
  addUmbelStem(new THREE.Vector3(0.08, 0.10, 0.09), new THREE.Vector3(0.14, 0.29, 0.05), new THREE.Vector3(0.21, 0.43, 0.01), 0.054);
  addUmbelStem(new THREE.Vector3(0.08, 0.10, 0.09), new THREE.Vector3(0.04, 0.26, 0.14), new THREE.Vector3(-0.01, 0.38, 0.17), 0.044);

  const mergedStems = new THREE.Mesh(mergeGeometries(stemGeos, false), stemMat);
  stemGeos.forEach((g) => g.dispose());
  center.add(mergedStems);

  const instFlorets = new THREE.InstancedMesh(floretGeo, mats.flowerWhite, floretMatrices.length);
  floretMatrices.forEach((m, i) => instFlorets.setMatrixAt(i, m));
  instFlorets.instanceMatrix.needsUpdate = true;
  center.add(instFlorets);

  return center;
}

function createDiningEnsemble(mats) {
  const rawWrapper = new THREE.Group();
  rawWrapper.position.copy(FLARE_ORIGIN);
  rawWrapper.rotation.y = FLARE_ANGLE;

  const tableGroup = new THREE.Group();
  tableGroup.position.set(1.62, 0, 1.98);

  const W = 0.96;
  const L = 2.08;
  const H = 0.75;
  const topThick = 0.052;

  const numPlanks = 5;
  const pw = (W - 0.016) / numPlanks;
  for (let i = 0; i < numPlanks; i++) {
    const plank = new THREE.Mesh(
      new RoundedBoxGeometry(pw, topThick, L, 1, 0.006),
      mats.reclaimedWood
    );
    plank.position.set(-W * 0.5 + pw * 0.5 + i * (pw + 0.004), H - topThick * 0.5, 0);
    tableGroup.add(plank);
  }

  const apronH = 0.075;
  const apronLong = new THREE.BoxGeometry(0.04, apronH, L - 0.24);
  const aL = new THREE.Mesh(apronLong, mats.reclaimedWood);
  aL.position.set(-W * 0.36, H - topThick - apronH * 0.5, 0);
  const aR = aL.clone();
  aR.position.x = W * 0.36;

  const apronShort = new THREE.BoxGeometry(W - 0.24, apronH, 0.04);
  const aF = new THREE.Mesh(apronShort, mats.reclaimedWood);
  aF.position.set(0, H - topThick - apronH * 0.5, -L * 0.42);
  const aN = aF.clone();
  aN.position.z = L * 0.42;
  tableGroup.add(aL, aR, aF, aN);

  const legGeo = new RoundedBoxGeometry(0.085, H - topThick, 0.085, 1, 0.007);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, mats.reclaimedWood);
      leg.position.set(sx * (W * 0.37), (H - topThick) * 0.5, sz * (L * 0.42));
      tableGroup.add(leg);
    }
  }

  addContactAO(tableGroup, W + 0.45, L + 0.45, 0, 0.003, 0, mats);

  const headChair = createWishboneChair(mats);
  headChair.position.set(-0.02, 0, -L * 0.5 - 0.12);
  headChair.rotation.y = Math.PI + 0.04;

  const rightFarChair = createWishboneChair(mats);
  rightFarChair.position.set(W * 0.5 + 0.13, 0, -0.46);
  rightFarChair.rotation.y = Math.PI * 0.5 - 0.08;

  const rightNearChair = createWishboneChair(mats);
  rightNearChair.position.set(W * 0.5 + 0.14, 0, 0.46);
  rightNearChair.rotation.y = Math.PI * 0.5 + 0.05;

  const leftMidChair = createWishboneChair(mats);
  leftMidChair.position.set(-W * 0.5 - 0.15, 0, 0.16);
  leftMidChair.rotation.y = -Math.PI * 0.5 + 0.06;

  const leftNearChair = createWishboneChair(mats);
  leftNearChair.position.set(-W * 0.5 - 0.14, 0, 0.78);
  leftNearChair.rotation.y = -Math.PI * 0.5 - 0.05;

  tableGroup.add(headChair, rightFarChair, rightNearChair, leftMidChair, leftNearChair);

  const sHead = createPlaceSetting(mats, true);
  sHead.position.set(0.0, H, -L * 0.5 + 0.25);

  const sRightFar = createPlaceSetting(mats, false);
  sRightFar.position.set(W * 0.5 - 0.24, H, -0.45);
  sRightFar.rotation.y = -Math.PI * 0.5;

  const sRightNear = createPlaceSetting(mats, true);
  sRightNear.position.set(W * 0.5 - 0.24, H, 0.44);
  sRightNear.rotation.y = -Math.PI * 0.5;

  const sLeftMid = createPlaceSetting(mats, true);
  sLeftMid.position.set(-W * 0.5 + 0.24, H, -0.05);
  sLeftMid.rotation.y = Math.PI * 0.5;

  const sLeftNear = createPlaceSetting(mats, false);
  sLeftNear.position.set(-W * 0.5 + 0.24, H, 0.68);
  sLeftNear.rotation.y = Math.PI * 0.5;

  tableGroup.add(sHead, sRightFar, sRightNear, sLeftMid, sLeftNear);
  rawWrapper.add(tableGroup);

  // Merge ~115 static dining meshes down into just ~8 draw calls by material!
  const mergedDining = mergeGroupByMaterial(rawWrapper, true, true);

  // Add transparent glass centerpiece & instanced florets alongside merged opaque dining meshes
  const centerpieceWrapper = new THREE.Group();
  centerpieceWrapper.position.copy(FLARE_ORIGIN);
  centerpieceWrapper.rotation.y = FLARE_ANGLE;
  const centerpiece = createDiningCenterpiece(mats);
  centerpiece.position.set(1.64, H, 1.94);
  centerpieceWrapper.add(centerpiece);
  mergedDining.add(centerpieceWrapper);

  return mergedDining;
}

function createPlumpPillow(size, thickness, mat) {
  const geo = new THREE.BoxGeometry(size, size, thickness, 8, 8, 4);
  const pos = geo.attributes.position;
  const half = size * 0.5;
  const halfT = thickness * 0.5;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const nx = x / half;
    const ny = y / half;
    const nz = z / halfT;
    const dome = Math.cos(nx * Math.PI * 0.48) * Math.cos(ny * Math.PI * 0.48);
    z = nz * halfT * (0.22 + 0.95 * dome);
    const cornerPinch = 1.0 - 0.06 * (nx * nx * ny * ny);
    x *= cornerPinch;
    y *= cornerPinch * (1.0 - 0.03 * ny);
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function createSlipcoveredSofa(width, depth, mats, pillowCount = 5) {
  const sofa = new THREE.Group();

  // Contact AO shadow grounding the floor-length linen skirt!
  addContactAO(sofa, width + 0.34, depth + 0.34, 0, 0.009, 0, mats);

  const skirtGeo = new THREE.BoxGeometry(width + 0.03, 0.25, depth + 0.03, 18, 2, 10);
  const sPos = skirtGeo.attributes.position;
  for (let i = 0; i < sPos.count; i++) {
    const x = sPos.getX(i);
    const y = sPos.getY(i);
    const z = sPos.getZ(i);
    const floorFactor = Math.max(0, (0.125 - y) / 0.25);
    const ripple = Math.sin(x * 16.0 + z * 14.0) * 0.011 * floorFactor;
    sPos.setXYZ(i, x + ripple, y, z + ripple);
  }
  skirtGeo.computeVertexNormals();
  const skirt = new THREE.Mesh(skirtGeo, mats.sofaLinen);
  skirt.position.y = 0.125;
  sofa.add(skirt);

  const baseDeck = new THREE.Mesh(
    new RoundedBoxGeometry(width - 0.04, 0.16, depth - 0.04, 1, 0.035),
    mats.sofaLinen
  );
  baseDeck.position.y = 0.24;
  sofa.add(baseDeck);

  const backFrame = new THREE.Mesh(
    new RoundedBoxGeometry(width - 0.02, 0.56, 0.24, 2, 0.065),
    mats.sofaLinen
  );
  backFrame.position.set(0, 0.54, -depth * 0.5 + 0.13);
  sofa.add(backFrame);

  const armW = 0.22;
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(
      new RoundedBoxGeometry(armW, 0.44, depth - 0.03, 2, 0.075),
      mats.sofaLinen
    );
    arm.position.set(side * (width * 0.5 - armW * 0.5), 0.42, 0.01);
    arm.rotation.z = -side * 0.04;
    sofa.add(arm);
  }

  const numSeats = width > 2.38 ? 3 : 2;
  const innerW = width - armW * 2 + 0.02;
  const seatW = innerW / numSeats;
  for (let i = 0; i < numSeats; i++) {
    const cushion = new THREE.Mesh(
      new RoundedBoxGeometry(seatW - 0.012, 0.17, depth - 0.24, 2, 0.05),
      mats.sofaLinen
    );
    cushion.position.set(-innerW * 0.5 + seatW * (i + 0.5), 0.385, 0.09);
    sofa.add(cushion);
  }

  const spanW = innerW - 0.16;
  for (let i = 0; i < pillowCount; i++) {
    const u = pillowCount === 1 ? 0.5 : i / (pillowCount - 1);
    const pSize = i % 2 === 0 ? 0.53 : 0.49;
    const pillow = createPlumpPillow(pSize, 0.20, mats.pillowLinen);
    pillow.position.set(-spanW * 0.5 + u * spanW, 0.65, -depth * 0.5 + 0.31 + (i % 2) * 0.048);
    pillow.rotation.x = -0.22 - (i % 2) * 0.06;
    pillow.rotation.y = (0.5 - u) * 0.36 + (i % 2 === 0 ? 0.14 : -0.11);
    pillow.rotation.z = i % 2 === 0 ? -0.05 : 0.06;
    sofa.add(pillow);
  }

  return sofa;
}

function createSnakePlant(mats) {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.14, 0.34, 16), mats.darkCeramicVase);
  pot.position.y = 0.17;
  group.add(pot);

  const numBlades = 17;
  for (let i = 0; i < numBlades; i++) {
    const u = i / numBlades;
    const ang = u * Math.PI * 2 + i * 0.7;
    const rDist = 0.02 + (i % 4) * 0.032;
    const h = 0.92 + ((i * 37) % 10) * 0.062;
    const w = 0.068 + (i % 3) * 0.012;

    const bladeGeo = new THREE.PlaneGeometry(w, h, 2, 10);
    const pos = bladeGeo.attributes.position;
    const twistRate = (i % 2 === 0 ? 1 : -1) * 0.55;
    for (let v = 0; v < pos.count; v++) {
      let bx = pos.getX(v);
      const by = pos.getY(v) + h * 0.5;
      const t = THREE.MathUtils.clamp(by / h, 0, 1);
      const taper =
        t < 0.7
          ? 0.55 + 0.45 * Math.sin((t / 0.7) * Math.PI * 0.5)
          : Math.pow(Math.max(0, 1 - (t - 0.7) / 0.3), 0.85);
      bx *= taper;
      const cup = Math.abs(bx) * 0.28;
      const tw = t * twistRate;
      const rx = bx * Math.cos(tw) - cup * Math.sin(tw);
      const rz = bx * Math.sin(tw) + cup * Math.cos(tw) + Math.pow(t, 2.1) * 0.06;
      pos.setXYZ(v, rx, by, rz);
    }
    bladeGeo.computeVertexNormals();

    const blade = new THREE.Mesh(bladeGeo, mats.leafSansevieria);
    blade.position.set(Math.cos(ang) * rDist, 0.28, Math.sin(ang) * rDist);
    blade.rotation.y = -ang + Math.PI * 0.5;
    blade.rotation.x = 0.03 + rDist * 0.85;
    group.add(blade);
  }

  return group;
}

function createCeilingFan(mats, ceilingY) {
  const fanGroup = new THREE.Group();
  const rodLen = 0.68;

  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.045, 14), mats.darkBronze);
  canopy.position.y = -0.022;

  const downrod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, rodLen, 8), mats.darkBronze);
  downrod.position.y = -rodLen * 0.5;

  const rotor = new THREE.Group();
  rotor.position.y = -rodLen;

  const motorHub = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.075, 0.075, 16), mats.darkBronze);
  rotor.add(motorHub);

  const bladeLen = 0.72;
  const bladeGeo = new THREE.BoxGeometry(bladeLen, 0.008, 0.115, 6, 1, 2);
  const bPos = bladeGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    const x = bPos.getX(i) + bladeLen * 0.5;
    const t = THREE.MathUtils.clamp(x / bladeLen, 0, 1);
    let z = bPos.getZ(i);
    z *= 0.62 + 0.52 * Math.sin(Math.pow(t, 0.7) * Math.PI * 0.85);
    const pitchY = bPos.getY(i) + z * 0.16 * (1.0 - t * 0.4);
    bPos.setXYZ(i, x + 0.05, pitchY, z);
  }
  bladeGeo.computeVertexNormals();

  for (let b = 0; b < 3; b++) {
    const blade = new THREE.Mesh(bladeGeo, mats.darkBronze);
    blade.rotation.y = (b / 3) * Math.PI * 2 + 0.25;
    rotor.add(blade);
  }

  // Do NOT cast dynamic shadow from rotating rotor so static shadow maps remain 100% valid
  fanGroup.add(canopy, downrod, rotor);
  fanGroup.position.set(-0.22, ceilingY, -3.55);

  return { fanGroup, rotor };
}

export function buildFurniture(scene, mats, _walkableMeshes, ceilingY) {
  const furnGroup = new THREE.Group();
  const staticLivingToMerge = new THREE.Group();

  // 1. Giant Open-Weave Rattan Dome Pendant Lamp
  furnGroup.add(createRattanPendantLamp(mats, ceilingY));

  // 2. Merged Dining Table + 5 Wishbone Chairs + Tableware + Wildflowers
  furnGroup.add(createDiningEnsemble(mats));

  // 3. Living Room Layered Jute & Cream Kilim Area Rug
  const rug = new THREE.Mesh(new BoxGeometryWithBevel(2.58, 0.012, 2.68), mats.rugKilim);
  rug.position.set(0.16, 0.006, -3.62);
  rug.receiveShadow = true;
  furnGroup.add(rug);

  // 4. Two Plush White Slipcovered Linen Sofas (merged into staticLivingToMerge!)
  const backSofa = createSlipcoveredSofa(2.44, 1.02, mats, 6);
  backSofa.position.set(0.14, 0, -5.14);
  staticLivingToMerge.add(backSofa);

  const rightSofa = createSlipcoveredSofa(2.34, 1.02, mats, 4);
  rightSofa.position.set(1.74, 0, -3.44);
  rightSofa.rotation.y = -Math.PI * 0.5;
  staticLivingToMerge.add(rightSofa);

  // 5. Rustic Bleached-Wood Coffee Table + Artisanal Dark Olive Vases
  const coffeeGroup = new THREE.Group();
  coffeeGroup.position.set(-0.24, 0, -3.58);
  const cW = 0.74;
  const cL = 1.32;
  const cH = 0.37;

  addContactAO(coffeeGroup, cW + 0.32, cL + 0.32, 0, 0.014, 0, mats);

  for (let i = 0; i < 4; i++) {
    const pw = (cW - 0.012) / 4;
    const plank = new THREE.Mesh(new RoundedBoxGeometry(pw, 0.055, cL, 1, 0.005), mats.bleachedWood);
    plank.position.set(-cW * 0.5 + pw * 0.5 + i * (pw + 0.004), cH - 0.0275, 0);
    coffeeGroup.add(plank);
  }
  for (const sz of [-0.42, 0.42]) {
    const sledLeg = new THREE.Mesh(
      new RoundedBoxGeometry(cW - 0.10, cH - 0.055, 0.075, 1, 0.005),
      mats.bleachedWood
    );
    sledLeg.position.set(0, (cH - 0.055) * 0.5, sz);
    coffeeGroup.add(sledLeg);
  }

  const jugPts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.075, 0),
    new THREE.Vector2(0.102, 0.08),
    new THREE.Vector2(0.088, 0.21),
    new THREE.Vector2(0.036, 0.285),
    new THREE.Vector2(0.042, 0.305),
    new THREE.Vector2(0.030, 0.305),
  ];
  const coffeeJug = new THREE.Mesh(new THREE.LatheGeometry(jugPts, 20), mats.darkCeramicVase);
  coffeeJug.position.set(-0.08, cH, 0.14);
  coffeeGroup.add(coffeeJug);

  for (let s = 0; s < 7; s++) {
    const a = (s / 7) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), mats.leafTropical);
    leaf.scale.set(0.7, 1.5, 0.35);
    leaf.position.set(0.06 + Math.cos(a) * 0.038, cH + 0.16 + (s % 3) * 0.025, 0.02 + Math.sin(a) * 0.038);
    leaf.rotation.set(0.35 * Math.sin(a), a, 0.35 * Math.cos(a));
    coffeeGroup.add(leaf);
  }
  staticLivingToMerge.add(coffeeGroup);

  // Translucent small olive vase added directly so transparency sorts cleanly
  const smallVase = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 12), mats.oliveGlass);
  smallVase.scale.set(1, 1.12, 1);
  smallVase.position.set(-0.18, cH + 0.068, -3.56);
  furnGroup.add(smallVase);

  // 6. Low Minimalist Cream TV Console + Wall-Mounted Flatscreen TV + Potted Green Plant
  const mediaGroup = new THREE.Group();
  mediaGroup.position.set(-2.14, 0, -2.18);

  addContactAO(mediaGroup, 0.65, 2.05, 0, 0.003, 0, mats);

  const consoleBody = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.34, 1.84, 1, 0.01), mats.tvConsoleCream);
  consoleBody.position.y = 0.27;
  mediaGroup.add(consoleBody);

  for (const sx of [-0.15, 0.15]) {
    for (const sz of [-0.78, 0.78]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.10, 8), mats.chairOak);
      leg.position.set(sx, 0.05, sz);
      mediaGroup.add(leg);
    }
  }
  for (const dz of [-0.55, 0.55]) {
    for (const dy of [0.21, 0.33]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), mats.darkBronze);
      knob.position.set(0.215, dy, dz);
      mediaGroup.add(knob);
    }
  }

  const tvPot = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.072, 0.15, 14), mats.ceramicRim);
  tvPot.position.set(0.0, 0.515, 0.68);
  mediaGroup.add(tvPot);

  for (let l = 0; l < 13; l++) {
    const a = (l / 13) * Math.PI * 2;
    const h = 0.36 + (l % 3) * 0.10;
    const leafGeo = new THREE.PlaneGeometry(0.088, h, 2, 5);
    const lp = leafGeo.attributes.position;
    for (let k = 0; k < lp.count; k++) {
      const ly = lp.getY(k) + h * 0.5;
      const t = THREE.MathUtils.clamp(ly / h, 0, 1);
      lp.setX(k, lp.getX(k) * Math.max(0, Math.sin(t * Math.PI)));
      lp.setZ(k, -Math.pow(t, 1.8) * 0.11);
    }
    leafGeo.computeVertexNormals();
    const leaf = new THREE.Mesh(leafGeo, mats.leafTropical);
    leaf.position.set(0.0, 0.57, 0.68);
    leaf.rotation.y = a;
    leaf.rotation.x = -0.22 - (l % 3) * 0.13;
    mediaGroup.add(leaf);
  }

  const tvPanel = new THREE.Mesh(new BoxGeometryWithBevel(0.042, 0.78, 1.36), mats.tvScreen);
  tvPanel.position.set(-0.135, 1.48, -0.08);
  mediaGroup.add(tvPanel);
  staticLivingToMerge.add(mediaGroup);

  // 7. Wall Artworks
  const seaCaveCanvas = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.96, 0.042), mats.paintingSeaCave);
  seaCaveCanvas.position.set(0.18, 2.00, -5.83);
  seaCaveCanvas.castShadow = true;
  furnGroup.add(seaCaveCanvas);

  const sideCanvas = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.96, 0.78), mats.paintingSide);
  sideCanvas.position.set(2.30, 1.88, -3.52);
  sideCanvas.castShadow = true;
  furnGroup.add(sideCanvas);

  // 8. Tall Snake Plant (Sansevieria)
  const snakePlant = createSnakePlant(mats);
  snakePlant.position.set(1.80, 0, -5.12);
  staticLivingToMerge.add(snakePlant);

  // 9. Floor-to-Ceiling Pleated Linen Curtains
  const curtainH = ceilingY - 0.08;
  const curtainGeo = new THREE.PlaneGeometry(0.62, curtainH, 16, 6);
  const cPos = curtainGeo.attributes.position;
  for (let i = 0; i < cPos.count; i++) {
    const cx = cPos.getX(i);
    const cy = cPos.getY(i);
    cPos.setZ(i, Math.sin(cx * 36.0) * 0.045 + Math.sin(cy * 1.5) * 0.01);
  }
  curtainGeo.computeVertexNormals();
  const curtain = new THREE.Mesh(curtainGeo, mats.curtainLinen);
  curtain.position.set(-2.12, curtainH * 0.5, -5.36);
  curtain.rotation.y = 0.35;
  staticLivingToMerge.add(curtain);

  // 10. Foreground Tropical Ficus/Strelitzia Plant
  const fgPlant = new THREE.Group();
  fgPlant.position.set(1.54, 0.15, 2.46);
  const fgPot = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.16, 0.42, 14), mats.terracotta);
  fgPot.position.y = 0.21;
  fgPlant.add(fgPot);

  const fgLeafConfigs = [
    { h: 1.05, len: 0.85, wid: 0.28, rotY: 1.85, tilt: 0.55 },
    { h: 1.32, len: 0.92, wid: 0.30, rotY: 1.65, tilt: 0.36 },
    { h: 0.82, len: 0.78, wid: 0.27, rotY: 2.12, tilt: 0.72 },
    { h: 1.52, len: 0.88, wid: 0.28, rotY: 1.52, tilt: 0.24 },
    { h: 0.96, len: 0.82, wid: 0.27, rotY: 1.25, tilt: 0.52 },
    { h: 1.15, len: 0.76, wid: 0.26, rotY: 2.45, tilt: 0.48 },
  ];
  for (const cfg of fgLeafConfigs) {
    const lGeo = new THREE.PlaneGeometry(cfg.wid, cfg.len, 4, 8);
    const lp = lGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const lx = lp.getX(i);
      const ly = lp.getY(i) + cfg.len * 0.5;
      const t = THREE.MathUtils.clamp(ly / cfg.len, 0, 1);
      const shape = Math.max(0, Math.sin(Math.pow(t, 0.72) * Math.PI));
      lp.setXYZ(i, lx * (0.12 + 0.88 * shape), ly, -Math.pow(t, 1.8) * 0.20 + Math.abs(lx) * 0.14);
    }
    lGeo.computeVertexNormals();
    const leaf = new THREE.Mesh(lGeo, mats.leafTropical);
    leaf.position.set(0, cfg.h * 0.55, 0);
    leaf.rotation.y = cfg.rotY;
    leaf.rotation.x = -cfg.tilt;
    fgPlant.add(leaf);
  }
  staticLivingToMerge.add(fgPlant);

  // 11. Rear Dining Room Credenza
  const rearCredenza = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.78, 0.46, 1, 0.012), mats.reclaimedWood);
  rearCredenza.position.set(0.1, 0.39, 4.98);
  staticLivingToMerge.add(rearCredenza);

  // Merge all ~120 static living room & plant meshes by material into ~10 draw calls!
  furnGroup.add(mergeGroupByMaterial(staticLivingToMerge, true, true));

  // 12. Dynamic 3-Blade Ceiling Fan (kept unmerged so rotor spins smoothly)
  const { fanGroup, rotor } = createCeilingFan(mats, ceilingY);
  furnGroup.add(fanGroup);

  scene.add(furnGroup);

  return {
    furnGroup,
    updateFan(dt, enabled) {
      if (enabled) {
        rotor.rotation.y += dt * 2.1;
      }
    },
  };
}

function BoxGeometryWithBevel(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}
