import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FLARE_ORIGIN, FLARE_ANGLE } from './architecture.js';

export const CAMERA_PRESETS = {
  original: {
    pos: new THREE.Vector3(-0.08, 1.98, 4.15),
    yaw: THREE.MathUtils.degToRad(11.2),
    pitch: THREE.MathUtils.degToRad(-9.2),
    eyeOffset: 0.26,
  },
  dining: {
    pos: new THREE.Vector3(0.55, 1.66, 2.75),
    yaw: THREE.MathUtils.degToRad(46),
    pitch: THREE.MathUtils.degToRad(-12),
    eyeOffset: 0.0,
  },
  living: {
    pos: new THREE.Vector3(-0.95, 1.62, -1.35),
    yaw: THREE.MathUtils.degToRad(-18),
    pitch: THREE.MathUtils.degToRad(-5),
    eyeOffset: -0.06,
  },
  courtyard: {
    pos: new THREE.Vector3(-3.38, 2.12, 0.48),
    yaw: THREE.MathUtils.degToRad(118),
    pitch: THREE.MathUtils.degToRad(-8),
    eyeOffset: -0.05,
  },
  gallery: {
    pos: new THREE.Vector3(3.38, 1.68, 2.45),
    yaw: THREE.MathUtils.degToRad(26),
    pitch: THREE.MathUtils.degToRad(-4),
    eyeOffset: 0.0,
  },
};

export function setupNavigation(camera, domElement, scene, walkableMeshes, onPresetChange) {
  camera.rotation.order = 'YXZ';

  let mode = 'walk'; // 'walk' | 'orbit'
  const orbit = new OrbitControls(camera, domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.07;
  orbit.maxPolarAngle = Math.PI * 0.88;
  orbit.minDistance = 0.4;
  orbit.maxDistance = 12.0;
  orbit.enabled = false;

  // Walk state initialized to exact 'original' photo calibration
  const initial = CAMERA_PRESETS.original;
  camera.position.copy(initial.pos);
  let yaw = initial.yaw;
  let pitch = initial.pitch;
  let targetYaw = yaw;
  let targetPitch = pitch;
  let groundY = 0.0;
  let eyeHeight = 1.72;
  let eyeOffset = initial.eyeOffset;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');

  // Keyboard & HUD pad movement state
  const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    up: false,
    down: false,
  };
  const padMove = { forward: false, backward: false, left: false, right: false };

  // Smooth camera preset transition
  let transition = null;

  // Click-to-walk target & visual floor indicator ring
  let walkGoal = null;
  const ringGroup = new THREE.Group();
  const ringOuter = new THREE.Mesh(
    new THREE.RingGeometry(0.13, 0.165, 32),
    new THREE.MeshBasicMaterial({
      color: 0xfff8eb,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ringOuter.rotation.x = -Math.PI * 0.5;
  ringGroup.add(ringOuter);
  ringGroup.visible = false;
  scene.add(ringGroup);
  let ringAnim = 0;

  // Raycasters for downward terrain/step height & click-to-walk
  const downRay = new THREE.Raycaster();
  const downDir = new THREE.Vector3(0, -1, 0);
  const clickRay = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // Helper converting world XZ into Courtyard Bay local XZ for clean portal & patio collision
  const cosF = Math.cos(-FLARE_ANGLE);
  const sinF = Math.sin(-FLARE_ANGLE);
  function worldToCourtyardLocal(wx, wz) {
    const dx = wx - FLARE_ORIGIN.x;
    const dz = wz - FLARE_ORIGIN.z;
    return {
      lx: dx * cosF + dz * sinF,
      lz: -dx * sinF + dz * cosF,
    };
  }
  function courtyardLocalToWorld(lx, lz) {
    const c = Math.cos(FLARE_ANGLE);
    const s = Math.sin(FLARE_ANGLE);
    return {
      wx: FLARE_ORIGIN.x + lx * c + lz * s,
      wz: FLARE_ORIGIN.z - lx * s + lz * c,
    };
  }

  /**
   * Constrains player XZ inside valid architectural boundaries while allowing
   * seamless passage between dining room, living room, right glazed gallery,
   * and out through the open 2.18m courtyard window onto the outdoor pool terrace!
   */
  function constrainPosition(nx, nz) {
    let x = THREE.MathUtils.clamp(nx, -6.5, 4.05);
    let z = THREE.MathUtils.clamp(nz, -5.45, 4.85);

    // Right glazed gallery back wall stop (X > 2.35 stops at Z = -2.55)
    if (x > 2.18 && z < -2.52) {
      z = -2.52;
    }

    // Living room TV left wall (for Z < 0.25, cannot cross X < -2.02)
    if (z < 0.25 && x < -2.02) {
      x = -2.02;
    }

    // Flared courtyard wall, portal opening & outdoor patio/pool boundaries
    const loc = worldToCourtyardLocal(x, z);
    let { lx, lz } = loc;

    // Portal opening along flared wall is lz in [0.42, 1.74] (clear between inward-swung shutters)
    if (lz >= -0.2) {
      const inPortalSpan = lz > 0.42 && lz < 1.74;
      if (!inPortalSpan && lx < 0.26 && lx > -0.65) {
        // Slide smoothly along indoor wall face
        lx = 0.26;
      }
      // Outdoor patio bounds when outside (lx < -0.15)
      if (lx < -0.15) {
        lx = Math.max(lx, -3.15);
        lz = THREE.MathUtils.clamp(lz, -0.25, 3.95);

        // Keep out of raised plunge pool & terracotta pots (lx < -1.48, lz in [0.15, 2.75])
        if (lx < -1.42 && lz > 0.12 && lz < 2.78) {
          lx = -1.42;
        }
      }
      const w = courtyardLocalToWorld(lx, lz);
      x = w.wx;
      z = w.wz;
    }

    // Soft furniture obstacle push-out boxes (coffee table & back/right sofa cores)
    const obstacles = [
      { minX: -0.72, maxX: 0.24, minZ: -4.35, maxZ: -2.82 }, // Coffee table
      { minX: -1.15, maxX: 1.42, minZ: -5.65, maxZ: -4.55 }, // Back sofa
      { minX: 1.18, maxX: 2.25, minZ: -4.65, maxZ: -2.22 },  // Right sofa
    ];
    for (const b of obstacles) {
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) {
        const dLeft = x - b.minX;
        const dRight = b.maxX - x;
        const dBack = z - b.minZ;
        const dFront = b.maxZ - z;
        const m = Math.min(dLeft, dRight, dBack, dFront);
        if (m === dLeft) x = b.minX;
        else if (m === dRight) x = b.maxX;
        else if (m === dBack) z = b.minZ;
        else z = b.maxZ;
      }
    }

    return { x, z };
  }

  let lastSampleX = initial.pos.x;
  let lastSampleZ = initial.pos.z;
  let cachedGroundY = 0.0;

  function sampleFloorHeight(x, z) {
    if (Math.hypot(x - lastSampleX, z - lastSampleZ) < 0.012) {
      return cachedGroundY;
    }
    lastSampleX = x;
    lastSampleZ = z;
    downRay.set(new THREE.Vector3(x, 2.6, z), downDir);
    const hits = downRay.intersectObjects(walkableMeshes, false);
    if (hits.length > 0) {
      cachedGroundY = hits[0].point.y;
      return cachedGroundY;
    }
    cachedGroundY = 0.0;
    return 0.0;
  }

  // Pointer drag-to-look + short-click-to-walk
  let isDragging = false;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;
  let movedDist = 0;

  domElement.addEventListener('pointerdown', (e) => {
    if (mode !== 'walk' || e.button !== 0) return;
    isDragging = true;
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
    movedDist = 0;
    domElement.setPointerCapture(e.pointerId);
  });

  domElement.addEventListener('pointermove', (e) => {
    if (mode !== 'walk' || !isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    movedDist += Math.hypot(dx, dy);

    if (movedDist > 2) {
      transition = null;
      const sensitivity = 0.0028;
      targetYaw += dx * sensitivity;
      targetPitch = THREE.MathUtils.clamp(
        targetPitch + dy * sensitivity,
        -Math.PI * 0.44,
        Math.PI * 0.44
      );
    }
  });

  domElement.addEventListener('pointerup', (e) => {
    if (mode !== 'walk' || !isDragging) return;
    isDragging = false;
    domElement.releasePointerCapture(e.pointerId);

    // Clean short click (< 6px drag) -> Click-to-walk to target spot on floor/steps/patio!
    if (movedDist < 6) {
      const rect = domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      clickRay.setFromCamera(ndc, camera);
      const hits = clickRay.intersectObjects(walkableMeshes, false);
      if (hits.length > 0) {
        const pt = hits[0].point;
        const clamped = constrainPosition(pt.x, pt.z);
        walkGoal = new THREE.Vector2(clamped.x, clamped.z);
        transition = null;
        ringGroup.position.set(clamped.x, pt.y + 0.015, clamped.z);
        ringGroup.visible = true;
        ringAnim = 1.0;
        onPresetChange?.(null);
      }
    }
  });

  // Mouse wheel subtle zoom / dolly step in walk mode
  domElement.addEventListener(
    'wheel',
    (e) => {
      if (mode !== 'walk') return;
      e.preventDefault();
      transition = null;
      walkGoal = null;
      const step = -Math.sign(e.deltaY) * 0.34;
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const next = constrainPosition(
        camera.position.x + fwdX * step,
        camera.position.z + fwdZ * step
      );
      camera.position.x = next.x;
      camera.position.z = next.z;
      onPresetChange?.(null);
    },
    { passive: false }
  );

  // Keyboard bindings
  function handleKey(e, down) {
    if (e.target.tagName === 'INPUT' || document.querySelector('dialog[open]')) return;
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.forward = down;
        if (down) { walkGoal = null; transition = null; onPresetChange?.(null); }
        break;
      case 'KeyS':
      case 'ArrowDown':
        keys.backward = down;
        if (down) { walkGoal = null; transition = null; onPresetChange?.(null); }
        break;
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = down;
        if (down) { walkGoal = null; transition = null; onPresetChange?.(null); }
        break;
      case 'KeyD':
      case 'ArrowRight':
        keys.right = down;
        if (down) { walkGoal = null; transition = null; onPresetChange?.(null); }
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        keys.sprint = down;
        break;
      case 'KeyE':
        keys.up = down;
        break;
      case 'KeyQ':
        keys.down = down;
        break;
      default:
        break;
    }
  }

  window.addEventListener('keydown', (e) => handleKey(e, true));
  window.addEventListener('keyup', (e) => handleKey(e, false));

  function goToPreset(name) {
    const p = CAMERA_PRESETS[name];
    if (!p) return;
    if (mode === 'orbit') {
      setMode('walk');
    }
    walkGoal = null;
    transition = {
      t: 0,
      duration: 0.95,
      startPos: camera.position.clone(),
      endPos: p.pos.clone(),
      startYaw: yaw,
      endYaw: p.yaw,
      startPitch: pitch,
      endPitch: p.pitch,
      startOffset: eyeOffset,
      endOffset: p.eyeOffset,
    };
    onPresetChange?.(name);
  }

  function setMode(nextMode) {
    if (nextMode === mode) return;
    mode = nextMode;
    walkGoal = null;
    transition = null;

    if (mode === 'orbit') {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      orbit.target.copy(camera.position).addScaledVector(fwd, 3.2);
      orbit.enabled = true;
      orbit.update();
    } else {
      orbit.enabled = false;
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      pitch = targetPitch = euler.x;
      yaw = targetYaw = euler.y;
      const clamped = constrainPosition(camera.position.x, camera.position.z);
      camera.position.x = clamped.x;
      camera.position.z = clamped.z;
      groundY = sampleFloorHeight(clamped.x, clamped.z);
    }
  }

  function setPadDirection(dir, active) {
    if (dir in padMove) {
      padMove[dir] = active;
      if (active) {
        if (mode === 'orbit') setMode('walk');
        walkGoal = null;
        transition = null;
        onPresetChange?.(null);
      }
    }
  }

  function update(dt) {
    // Animate floor click-to-walk target ring
    if (ringGroup.visible) {
      ringAnim = Math.max(0, ringAnim - dt * 0.9);
      ringOuter.material.opacity = ringAnim * 0.75;
      const s = 1.0 + (1.0 - ringAnim) * 0.45;
      ringOuter.scale.set(s, s, 1);
      if (ringAnim <= 0.01 && !walkGoal) {
        ringGroup.visible = false;
      }
    }

    if (mode === 'orbit') {
      orbit.update();
      return;
    }

    // 1. Preset smooth cubic interpolation
    if (transition) {
      transition.t = Math.min(1, transition.t + dt / transition.duration);
      const u = transition.t;
      const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

      camera.position.lerpVectors(transition.startPos, transition.endPos, ease);
      yaw = targetYaw = THREE.MathUtils.lerp(transition.startYaw, transition.endYaw, ease);
      pitch = targetPitch = THREE.MathUtils.lerp(transition.startPitch, transition.endPitch, ease);
      eyeOffset = THREE.MathUtils.lerp(transition.startOffset, transition.endOffset, ease);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');

      if (transition.t >= 1) {
        groundY = sampleFloorHeight(camera.position.x, camera.position.z);
        transition = null;
      }
      return;
    }

    // 2. Smoothly damp look angles
    const lookSmooth = 1 - Math.exp(-18 * dt);
    yaw = THREE.MathUtils.lerp(yaw, targetYaw, lookSmooth);
    pitch = THREE.MathUtils.lerp(pitch, targetPitch, lookSmooth);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    // 3. Eye height adjustment (Q / E)
    if (keys.up) eyeOffset = Math.min(0.65, eyeOffset + dt * 0.9);
    if (keys.down) eyeOffset = Math.max(-0.55, eyeOffset - dt * 0.9);

    // 4. Horizontal WASD / Pad / Click-to-Walk displacement
    const moveFwd = (keys.forward || padMove.forward ? 1 : 0) - (keys.backward || padMove.backward ? 1 : 0);
    const moveRight = (keys.right || padMove.right ? 1 : 0) - (keys.left || padMove.left ? 1 : 0);

    let nx = camera.position.x;
    let nz = camera.position.z;

    if (moveFwd !== 0 || moveRight !== 0) {
      const speed = (keys.sprint ? 3.8 : 2.1) * dt;
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);

      const len = Math.hypot(moveFwd, moveRight) || 1;
      const df = moveFwd / len;
      const dr = moveRight / len;

      nx += (fwdX * df + rightX * dr) * speed;
      nz += (fwdZ * df + rightZ * dr) * speed;
    } else if (walkGoal) {
      const dx = walkGoal.x - nx;
      const dz = walkGoal.y - nz;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.05) {
        nx = walkGoal.x;
        nz = walkGoal.y;
        walkGoal = null;
      } else {
        const step = Math.min(dist, 2.35 * dt);
        nx += (dx / dist) * step;
        nz += (dz / dist) * step;
      }
    }

    const clamped = constrainPosition(nx, nz);
    camera.position.x = clamped.x;
    camera.position.z = clamped.z;

    // 5. Smooth terrain / step / patio height adaptation
    const targetGround = sampleFloorHeight(clamped.x, clamped.z);
    groundY = THREE.MathUtils.lerp(groundY, targetGround, 1 - Math.exp(-11 * dt));
    camera.position.y = groundY + eyeHeight + eyeOffset;
  }

  return {
    update,
    goToPreset,
    setMode,
    getMode: () => mode,
    setPadDirection,
  };
}
