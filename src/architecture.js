import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const FLARE_ORIGIN = new THREE.Vector3(-2.36, 0, 0.22);
export const FLARE_ANGLE = -THREE.MathUtils.degToRad(24.5);

function markWalkable(mesh) {
  mesh.userData.walkable = true;
  return mesh;
}

/**
 * Merges all non-walkable static architectural meshes by (material, castShadow) into single draw calls,
 * while preserving walkable floor/step meshes intact for fast downward raycasting.
 */
function optimizeArchitectureGroup(archGroup, walkableMeshes, mats) {
  archGroup.updateMatrixWorld(true);
  const buckets = new Map();
  const bucketList = [];

  archGroup.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData.walkable) {
      child.castShadow = !child.userData.noCastShadow;
      child.receiveShadow = true;
      return;
    }

    let geo = child.geometry.clone();
    if (geo.index) geo = geo.toNonIndexed();
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

    // Uniform world-space plaster UVs so thin piers, lintels & long walls never stretch
    if (child.material === mats.limeWall) {
      const pos = geo.attributes.position;
      const nrm = geo.attributes.normal;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const ax = Math.abs(nrm.getX(i));
        const ay = Math.abs(nrm.getY(i));
        const az = Math.abs(nrm.getZ(i));
        if (ay > ax && ay > az) {
          uv.setXY(i, x * 0.14, z * 0.23);
        } else if (ax >= az) {
          uv.setXY(i, z * 0.14, y * 0.23);
        } else {
          uv.setXY(i, x * 0.14, y * 0.23);
        }
      }
    }

    const noCast = Boolean(child.userData.noCastShadow);
    let subMap = buckets.get(child.material);
    if (!subMap) {
      subMap = new Map();
      buckets.set(child.material, subMap);
    }
    let entry = subMap.get(noCast);
    if (!entry) {
      entry = { mat: child.material, noCast, geos: [] };
      subMap.set(noCast, entry);
      bucketList.push(entry);
    }
    entry.geos.push(geo);
  });

  const optimizedGroup = new THREE.Group();

  // Preserve walkable meshes in world space so walkableMeshes array references stay valid & fast
  for (const wMesh of walkableMeshes) {
    if (!wMesh.parent) continue;
    let wGeo = wMesh.geometry.clone();
    wGeo.applyMatrix4(wMesh.matrixWorld);
    wMesh.geometry.dispose();
    wMesh.geometry = wGeo;
    wMesh.position.set(0, 0, 0);
    wMesh.rotation.set(0, 0, 0);
    wMesh.scale.set(1, 1, 1);
    wMesh.updateMatrix();
    optimizedGroup.add(wMesh);
  }

  for (const { mat, noCast, geos } of bucketList) {
    const mergedGeo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    const mergedMesh = new THREE.Mesh(mergedGeo, mat);
    mergedMesh.castShadow = !noCast;
    mergedMesh.receiveShadow = true;
    optimizedGroup.add(mergedMesh);
  }

  return optimizedGroup;
}

/**
 * Builds a 4-pane wooden casement shutter/door leaf with 3 horizontal muntin bars.
 */
function createCasementDoorLeaf(width, height, thickness, frameMat, glassMat, hingeAtZeroZ = true) {
  const leaf = new THREE.Group();
  const stileW = 0.055;
  const railH = 0.06;
  const dir = hingeAtZeroZ ? 1 : -1;
  const cx = dir * (width * 0.5);

  // Left & right vertical stiles
  const stileGeo = new THREE.BoxGeometry(thickness, height, stileW);
  const s1 = new THREE.Mesh(stileGeo, frameMat);
  s1.position.set(0, height * 0.5, dir * (stileW * 0.5));
  const s2 = new THREE.Mesh(stileGeo, frameMat);
  s2.position.set(0, height * 0.5, dir * (width - stileW * 0.5));
  leaf.add(s1, s2);

  // Top & bottom rails
  const innerW = width - stileW * 2;
  const railGeo = new THREE.BoxGeometry(thickness, railH, innerW);
  const rBot = new THREE.Mesh(railGeo, frameMat);
  rBot.position.set(0, railH * 0.5, cx);
  const rTop = new THREE.Mesh(railGeo, frameMat);
  rTop.position.set(0, height - railH * 0.5, cx);
  leaf.add(rBot, rTop);

  // 3 intermediate horizontal muntin bars -> 4 panes
  const muntinGeo = new THREE.BoxGeometry(thickness * 0.82, 0.026, innerW);
  const clearH = height - railH * 2;
  for (let i = 1; i <= 3; i++) {
    const m = new THREE.Mesh(muntinGeo, frameMat);
    m.position.set(0, railH + (clearH * i) / 4, cx);
    leaf.add(m);
  }

  // Clear glass sheet (does NOT cast shadow so sunlight streams cleanly)
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, clearH, innerW),
    glassMat
  );
  glass.position.set(0, height * 0.5, cx);
  glass.userData.noCastShadow = true;
  leaf.add(glass);

  return leaf;
}

/**
 * Builds one tall oak French folding door panel along the right glazed gallery wall.
 */
function createFrenchDoorPanel(width, height, thickness, oakMat, bronzeMat, glassMat, hasLatch = false) {
  const panel = new THREE.Group();
  const stileW = 0.068;
  const railTopH = 0.075;
  const railBotH = 0.095;

  const stileGeo = new THREE.BoxGeometry(thickness, height, stileW);
  const sLeft = new THREE.Mesh(stileGeo, oakMat);
  sLeft.position.set(0, height * 0.5, -width * 0.5 + stileW * 0.5);
  const sRight = new THREE.Mesh(stileGeo, oakMat);
  sRight.position.set(0, height * 0.5, width * 0.5 - stileW * 0.5);
  panel.add(sLeft, sRight);

  const innerW = width - stileW * 2;
  const rBot = new THREE.Mesh(new THREE.BoxGeometry(thickness, railBotH, innerW), oakMat);
  rBot.position.set(0, railBotH * 0.5, 0);
  const rTop = new THREE.Mesh(new THREE.BoxGeometry(thickness, railTopH, innerW), oakMat);
  rTop.position.set(0, height - railTopH * 0.5, 0);
  panel.add(rBot, rTop);

  // 3 horizontal muntin bars creating 4 tall panes
  const clearH = height - railBotH - railTopH;
  const muntinGeo = new THREE.BoxGeometry(thickness * 0.82, 0.032, innerW);
  for (let i = 1; i <= 3; i++) {
    const m = new THREE.Mesh(muntinGeo, oakMat);
    m.position.set(0, railBotH + (clearH * i) / 4, 0);
    panel.add(m);
  }

  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.01, clearH, innerW), glassMat);
  glass.position.set(0, railBotH + clearH * 0.5, 0);
  glass.userData.noCastShadow = true;
  panel.add(glass);

  if (hasLatch) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.13, 0.032), bronzeMat);
    plate.position.set(-thickness * 0.5 - 0.008, 1.12, width * 0.5 - stileW * 0.5);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.022, 0.09), bronzeMat);
    lever.position.set(-thickness * 0.5 - 0.028, 1.12, width * 0.5 - stileW * 0.5 - 0.03);
    panel.add(plate, lever);
  }

  return panel;
}

export function buildArchitecture(scene, mats, walkableMeshes) {
  const archGroup = new THREE.Group();
  const CEIL_Y = 3.32;

  // 1. Seamless Microcement Interior + Right Sunlit Gallery Floor
  const mainFloor = new THREE.Mesh(
    new THREE.BoxGeometry(10.2, 0.3, 13.5),
    mats.microcementFloor
  );
  mainFloor.position.set(0.3, -0.15, -0.6);
  markWalkable(mainFloor);
  walkableMeshes.push(mainFloor);
  archGroup.add(mainFloor);

  // 2. Main Interior Lime-Plaster Ceiling Slab (stopping at exterior courtyard wall so patio is open-air!)
  const mainCeiling = new THREE.Mesh(
    new THREE.BoxGeometry(5.15, 0.36, 13.5),
    mats.limeCeiling
  );
  mainCeiling.position.set(-0.18, CEIL_Y + 0.18, -0.6);
  archGroup.add(mainCeiling);

  // Glazed Conservatory Gallery Skylight Roof & Exposed Oak Beams (X = 2.36..4.55)
  const galleryGlassRoof = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 12.6),
    mats.windowGlass
  );
  galleryGlassRoof.rotation.x = Math.PI * 0.5;
  galleryGlassRoof.position.set(3.45, CEIL_Y - 0.05, -0.4);
  galleryGlassRoof.userData.noCastShadow = true;
  archGroup.add(galleryGlassRoof);

  for (let z = -3.0; z <= 4.5; z += 1.5) {
    const rafter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.07), mats.doorOak);
    rafter.position.set(3.45, CEIL_Y - 0.08, z);
    archGroup.add(rafter);
  }

  // 3. Living Room Back Wall (Z = -5.85) + Left Hallway Alcove
  // Main back wall from X = -1.68 to X = +2.45
  const backWallMain = new THREE.Mesh(
    new THREE.BoxGeometry(4.25, CEIL_Y + 0.1, 0.36),
    mats.limeWall
  );
  backWallMain.position.set(0.42, CEIL_Y * 0.5, -6.03);
  archGroup.add(backWallMain);

  // Recessed hallway alcove back wall (X = -2.6 to -1.5, Z = -6.95)
  const alcoveBack = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, CEIL_Y + 0.1, 0.3),
    mats.limeWall
  );
  alcoveBack.position.set(-2.1, CEIL_Y * 0.5, -6.95);
  archGroup.add(alcoveBack);

  const alcoveReturn = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, CEIL_Y + 0.1, 1.15),
    mats.limeWall
  );
  alcoveReturn.position.set(-1.68, CEIL_Y * 0.5, -6.42);
  archGroup.add(alcoveReturn);

  // 4. Left Living Room TV Wall & Secondary Alcove Window (X = -2.36, Z = 0.22 down to -6.9)
  // Solid TV wall segment: Z = 0.55 down to -3.85 (sealing corner behind courtyard bay!)
  const tvWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, CEIL_Y + 0.15, 4.45),
    mats.limeWall
  );
  tvWall.position.set(-2.58, CEIL_Y * 0.5, -1.65);
  archGroup.add(tvWall);

  // Window opening segment behind TV console (Z = -3.85 to -4.95): sill + lintel + far pier
  const leftWinSill = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.36, 1.15),
    mats.limeWall
  );
  leftWinSill.position.set(-2.57, 0.18, -4.42);
  archGroup.add(leftWinSill);

  const leftWinLintel = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.88, 1.15),
    mats.limeWall
  );
  leftWinLintel.position.set(-2.57, CEIL_Y - 0.44, -4.42);
  archGroup.add(leftWinLintel);

  const leftFarPier = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, CEIL_Y + 0.1, 2.05),
    mats.limeWall
  );
  leftFarPier.position.set(-2.57, CEIL_Y * 0.5, -5.98);
  archGroup.add(leftFarPier);

  // Backing light wall outside the secondary alcove opening so daylight bounces cleanly
  const alcoveLightBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, CEIL_Y, 2.2),
    mats.patioMicrocement
  );
  alcoveLightBack.position.set(-3.55, CEIL_Y * 0.5, -4.5);
  archGroup.add(alcoveLightBack);

  // 5. Right Wall Solid Section (Z = -5.85 to -2.72, X = +2.32) with Sunlit Recessed Niche
  // Back corner pier (Z = -5.85 to -5.12)
  const rightPierBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, CEIL_Y + 0.1, 0.85),
    mats.limeWall
  );
  rightPierBack.position.set(2.51, CEIL_Y * 0.5, -5.52);
  archGroup.add(rightPierBack);

  // Recessed sunlit window niche (Z = -5.10 to -4.32, Y = 1.40..2.38)
  const nicheBelow = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 1.40, 0.82),
    mats.limeWall
  );
  nicheBelow.position.set(2.51, 0.70, -4.71);
  const nicheAbove = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, CEIL_Y - 2.38, 0.82),
    mats.limeWall
  );
  nicheAbove.position.set(2.51, 2.38 + (CEIL_Y - 2.38) * 0.5, -4.71);
  // Bright sunlit backing inside niche
  const nicheBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.05, 0.86),
    new THREE.MeshBasicMaterial({ color: 0xfff8ea })
  );
  nicheBack.position.set(2.72, 1.89, -4.71);
  archGroup.add(nicheBelow, nicheAbove, nicheBack);

  // Pier holding the vertical coastal painting (Z = -4.32 to -2.70)
  const rightPierArt = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, CEIL_Y + 0.1, 1.62),
    mats.limeWall
  );
  rightPierArt.position.set(2.51, CEIL_Y * 0.5, -3.51);
  archGroup.add(rightPierArt);

  // Continuous header lintel above all right French doors (Z = -2.70 to +5.5, Y = 2.94..CEIL_Y)
  const rightDoorHeader = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, CEIL_Y - 2.94, 8.4),
    mats.limeWall
  );
  rightDoorHeader.position.set(2.47, 2.94 + (CEIL_Y - 2.94) * 0.5, 1.45);
  archGroup.add(rightDoorHeader);

  // 6. Tall Oak & Glass Folding French Doors along X = +2.34 (Z = -2.70 to +4.50)
  const doorH = 2.94;
  const panelW = 0.72;
  const doorThick = 0.068;
  // 10 tall leaves paired as subtle bi-fold French doors
  for (let i = 0; i < 10; i++) {
    const zCenter = -2.34 + i * panelW;
    const isOdd = i % 2 === 1;
    const hasLatch = i === 3 || i === 5 || i === 7;
    const panel = createFrenchDoorPanel(
      panelW - 0.008,
      doorH,
      doorThick,
      mats.doorOak,
      mats.darkBronze,
      mats.windowGlass,
      hasLatch
    );
    // Subtle accordion angle (~4 deg) matching the bi-fold depth in the reference photo
    const foldAngle = (isOdd ? 1 : -1) * THREE.MathUtils.degToRad(3.8);
    panel.position.set(2.36 + (isOdd ? 0.02 : -0.01), 0, zCenter);
    panel.rotation.y = foldAngle;
    archGroup.add(panel);
  }

  // 7. Sunlit Right Conservatory Gallery Outer Wall & Tall Windows (X = +4.42)
  const galleryBackWall = new THREE.Mesh(
    new THREE.BoxGeometry(2.15, CEIL_Y, 0.3),
    mats.limeWall
  );
  galleryBackWall.position.set(3.45, CEIL_Y * 0.5, -2.85);
  archGroup.add(galleryBackWall);

  // Outer piers & tall sunlit windows visible on the far-right edge of the photo
  for (let i = 0; i < 4; i++) {
    const pz = -2.5 + i * 2.15;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.32, CEIL_Y, 0.42), mats.limeWall);
    pier.position.set(4.42, CEIL_Y * 0.5, pz);
    archGroup.add(pier);

    if (i < 3) {
      const wz = pz + 1.075;
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 1.73), mats.limeWall);
      sill.position.set(4.42, 0.19, wz);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 1.73), mats.limeWall);
      lintel.position.set(4.42, CEIL_Y - 0.24, wz);
      // Thin oak window frame
      const outerFrame = createFrenchDoorPanel(
        1.72,
        CEIL_Y - 0.86,
        0.055,
        mats.doorOak,
        mats.darkBronze,
        mats.windowGlass,
        false
      );
      outerFrame.position.set(4.38, 0.38, wz);
      archGroup.add(sill, lintel, outerFrame);
    }
  }

  // 8. Flared Dining-Courtyard Wall Bay, Two Microcement Steps & Open Casement Doors
  const courtyardBay = new THREE.Group();
  courtyardBay.position.copy(FLARE_ORIGIN);
  courtyardBay.rotation.y = FLARE_ANGLE;

  const wallThick = 0.48;
  const sillY = 0.51;
  const winTopY = 2.74;
  const winZStart = 0.16;
  const winZEnd = 1.98;
  const winWidth = winZEnd - winZStart; // 1.82m wide courtyard portal

  // Corner pier near TV wall (z_local = -0.35..0.16)
  const bayNearPier = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, CEIL_Y + 0.1, 0.52),
    mats.limeWall
  );
  bayNearPier.position.set(-wallThick * 0.5, CEIL_Y * 0.5, -0.10);
  courtyardBay.add(bayNearPier);

  // Far pier toward foreground (z_local = 1.98..5.20)
  const bayFarPier = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, CEIL_Y + 0.1, 3.26),
    mats.limeWall
  );
  bayFarPier.position.set(-wallThick * 0.5, CEIL_Y * 0.5, 3.61);
  courtyardBay.add(bayFarPier);

  // Flared dining bay ceiling extension stopping cleanly at outer courtyard wall face (x_local = -0.48)
  const bayCeiling = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.36, 5.8),
    mats.limeCeiling
  );
  bayCeiling.position.set(1.12, CEIL_Y + 0.18, 2.5);
  courtyardBay.add(bayCeiling);

  // Lintel above courtyard window opening (z_local = 0.16..1.98, Y = 2.74..CEIL_Y+0.15)
  const bayLintel = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, CEIL_Y + 0.15 - winTopY, winWidth + 0.04),
    mats.limeWall
  );
  bayLintel.position.set(-wallThick * 0.5, winTopY + (CEIL_Y + 0.15 - winTopY) * 0.5, (winZStart + winZEnd) * 0.5);
  courtyardBay.add(bayLintel);

  // Sill threshold below courtyard opening (Y = 0..0.51)
  const baySill = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick + 0.04, sillY, winWidth + 0.4),
    mats.patioMicrocement
  );
  baySill.position.set(-wallThick * 0.5, sillY * 0.5, (winZStart + winZEnd) * 0.5);
  markWalkable(baySill);
  walkableMeshes.push(baySill);
  courtyardBay.add(baySill);

  // Subtle recessed stone/travertine drainage groove line across the inner threshold
  const sillGroove = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.006, winWidth - 0.02),
    mats.ceramicRim
  );
  sillGroove.position.set(-0.07, sillY + 0.002, (winZStart + winZEnd) * 0.5);
  courtyardBay.add(sillGroove);

  // Two wide crisp seamless microcement steps running from z_local = 0.02 to z_local = 4.5
  const stepsLen = 4.45;
  const stepsCenterZ = 2.24;

  // Lower step (Y = 0..0.17, protrudes +0.62m into dining room)
  const step1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.17, stepsLen),
    mats.microcementFloor
  );
  step1.position.set(0.31, 0.085, stepsCenterZ);
  markWalkable(step1);
  walkableMeshes.push(step1);

  // Upper step (Y = 0.17..0.34, protrudes +0.31m into dining room)
  const step2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.31, 0.17, stepsLen),
    mats.microcementFloor
  );
  step2.position.set(0.155, 0.255, stepsCenterZ);
  markWalkable(step2);
  walkableMeshes.push(step2);

  courtyardBay.add(step1, step2);

  // Two Inward-Opening Weathered Oak 4-Pane Casement Shutters/Doors
  const leafW = 0.88;
  const leafH = winTopY - sillY - 0.02;

  // Right/far leaf (at z_local = winZStart = 0.16), swung ~83 deg inward into room
  const farShutter = createCasementDoorLeaf(
    leafW,
    leafH,
    0.048,
    mats.weatheredShutterOak,
    mats.windowGlass,
    true
  );
  farShutter.position.set(-0.04, sillY + 0.01, winZStart + 0.02);
  farShutter.rotation.y = THREE.MathUtils.degToRad(83);
  courtyardBay.add(farShutter);

  // Left/near leaf (at z_local = winZEnd = 2.34), swung ~88 deg inward at left edge of frame
  const nearShutter = createCasementDoorLeaf(
    leafW,
    leafH,
    0.048,
    mats.weatheredShutterOak,
    mats.windowGlass,
    false
  );
  nearShutter.position.set(-0.04, sillY + 0.01, winZEnd - 0.02);
  nearShutter.rotation.y = -THREE.MathUtils.degToRad(88);
  courtyardBay.add(nearShutter);

  archGroup.add(courtyardBay);

  // 9. Rear Dining Room Wall behind the initial camera (Z = +5.35) so 360° turnaround is complete
  const rearDiningWall = new THREE.Mesh(
    new THREE.BoxGeometry(10.2, CEIL_Y + 0.1, 0.38),
    mats.limeWall
  );
  rearDiningWall.position.set(0.2, CEIL_Y * 0.5, 5.45);
  archGroup.add(rearDiningWall);

  const optimizedArch = optimizeArchitectureGroup(archGroup, walkableMeshes, mats);
  scene.add(optimizedArch);

  return { archGroup: optimizedArch, courtyardBay, CEIL_Y };
}
