import * as THREE from 'three';

import { createMaterials } from './materials.js';
import { setupLighting } from './lighting.js';
import { buildArchitecture } from './architecture.js';
import { buildCourtyard } from './courtyard.js';
import { buildFurniture } from './furniture.js';
import { setupNavigation } from './navigation.js';

// --- Modern Web Guidance: Dialog & Top-Layer Animation Progressive Fallbacks ---
function setupModernDialogAccessibility() {
  const helpDialog = document.getElementById('help-dialog');
  const helpBtn = document.getElementById('btn-help');
  const closeHelpBtn = document.getElementById('btn-close-help');
  if (!helpDialog) return;

  let supportsDisplayTransition;
  function canTransitionDisplay() {
    if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = 'none';
    supportsDisplayTransition = getComputedStyle(probe).display === 'block';
    probe.remove();
    return supportsDisplayTransition;
  }

  function supportsTopLayerExit() {
    return window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay();
  }

  async function closeTopLayer(dialog) {
    if (!supportsTopLayerExit()) {
      dialog.setAttribute('data-closing', '');
      const animations = dialog.getAnimations({ subtree: true });
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise((r) => setTimeout(r, 2000)),
        ]);
      }
      if (!dialog.hasAttribute('data-closing')) return;
      dialog.removeAttribute('data-closing');
    }
    dialog.close();
  }

  if (!('commandForElement' in HTMLButtonElement.prototype) && helpBtn) {
    helpBtn.addEventListener('click', () => {
      if (!helpDialog.open) helpDialog.showModal();
    });
  }

  helpDialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeTopLayer(helpDialog);
  });

  if (closeHelpBtn) {
    closeHelpBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeTopLayer(helpDialog);
    });
  }

  helpDialog.addEventListener('close', () => {
    helpDialog.returnValue = '';
  });

  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e, d) => {
      const r = d.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    helpDialog.addEventListener('pointerdown', (e) => {
      pressedOutside = outside(e, helpDialog);
    });
    helpDialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && outside(e, helpDialog)) {
        closeTopLayer(helpDialog);
      }
    });
  }
}

// --- Main Optimized 3D Scene Initialization ---
function initApp() {
  setupModernDialogAccessibility();

  const appRoot = document.getElementById('app');
  const canvas = document.getElementById('scene-canvas');
  const loadingOverlay = document.getElementById('loading-overlay');

  // Single-pass hardware MSAA WebGLRenderer (eliminates multi-pass post-processing bottleneck!)
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });

  let highQuality = false;
  let currentMaxDpr = 1.25;
  function applyDpr(maxDpr) {
    currentMaxDpr = maxDpr;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, currentMaxDpr));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  applyDpr(1.25);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Static architectural sun shadows: bake ONCE on startup -> 0.00ms shadow cost per frame!
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    58.0,
    window.innerWidth / window.innerHeight,
    0.08,
    55
  );

  const hideLoader = () => {
    renderer.shadowMap.needsUpdate = true;
    loadingOverlay?.classList.add('hidden');
  };
  THREE.DefaultLoadingManager.onLoad = hideLoader;
  setTimeout(hideLoader, 1500);

  const walkableMeshes = [];
  const mats = createMaterials(renderer);
  setupLighting(scene, renderer);
  const { CEIL_Y } = buildArchitecture(scene, mats, walkableMeshes);
  const courtyardApi = buildCourtyard(scene, mats, walkableMeshes);
  const furnitureApi = buildFurniture(scene, mats, walkableMeshes, CEIL_Y);

  // Pre-compile all shaders upfront so moving/turning never stutters
  renderer.compile(scene, camera);
  window.__VILLA_RENDERER__ = renderer;

  // HUD Preset Buttons & Navigation
  const presetBtns = Array.from(document.querySelectorAll('.preset-btn'));
  function updateActivePresetUI(activeName) {
    for (const btn of presetBtns) {
      btn.classList.toggle('active', btn.dataset.preset === activeName);
    }
  }

  const nav = setupNavigation(camera, canvas, scene, walkableMeshes, updateActivePresetUI);

  for (const btn of presetBtns) {
    btn.addEventListener('click', () => {
      nav.goToPreset(btn.dataset.preset);
    });
  }

  // Navigation Mode Toggle (Walk <-> Orbit)
  const btnMode = document.getElementById('btn-mode');
  function toggleNavMode() {
    const next = nav.getMode() === 'walk' ? 'orbit' : 'walk';
    nav.setMode(next);
    if (btnMode) {
      btnMode.textContent = next === 'walk' ? 'Modo: Caminar' : 'Modo: Órbita';
    }
  }
  btnMode?.addEventListener('click', toggleNavMode);

  // Resolution / Quality Toggle (Rápida 1.25x <-> Alta Nitidez 1.8x)
  const btnQuality = document.getElementById('btn-quality');
  btnQuality?.addEventListener('click', () => {
    highQuality = !highQuality;
    applyDpr(highQuality ? 1.8 : 1.25);
    btnQuality.textContent = highQuality ? 'Calidad: Alta' : 'Calidad: Rápida';
    btnQuality.setAttribute('aria-pressed', String(highQuality));
  });

  // Ceiling Fan Toggle
  let fanEnabled = true;
  const btnFan = document.getElementById('btn-fan');
  btnFan?.addEventListener('click', () => {
    fanEnabled = !fanEnabled;
    btnFan.setAttribute('aria-pressed', String(fanEnabled));
    btnFan.textContent = fanEnabled ? 'Ventilador: ON' : 'Ventilador: OFF';
  });

  // Interactive Split-Curtain Photo Comparison Toggle
  const compareLayer = document.getElementById('compare-layer');
  const compareClip = document.getElementById('compare-clip');
  const compareDivider = document.getElementById('compare-divider');
  const compareRange = document.getElementById('compare-range');
  const btnCompare = document.getElementById('btn-compare');
  let compareActive = false;

  function setCompareSplit(pct) {
    if (compareClip) compareClip.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    if (compareDivider) compareDivider.style.left = `${pct}%`;
  }

  function toggleCompare() {
    compareActive = !compareActive;
    if (compareLayer) compareLayer.hidden = !compareActive;
    btnCompare?.setAttribute('aria-pressed', String(compareActive));
    if (compareActive) {
      nav.goToPreset('original');
    }
  }

  btnCompare?.addEventListener('click', toggleCompare);
  compareRange?.addEventListener('input', (e) => {
    setCompareSplit(Number(e.target.value));
  });

  // On-Screen Directional Pad
  for (const padBtn of document.querySelectorAll('.pad-btn')) {
    const dir = padBtn.dataset.move;
    const start = (e) => {
      e.preventDefault();
      padBtn.classList.add('pressed');
      nav.setPadDirection(dir, true);
    };
    const end = () => {
      padBtn.classList.remove('pressed');
      nav.setPadDirection(dir, false);
    };
    padBtn.addEventListener('pointerdown', start);
    padBtn.addEventListener('pointerup', end);
    padBtn.addEventListener('pointerleave', end);
    padBtn.addEventListener('pointercancel', end);
  }

  // Global keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    switch (e.code) {
      case 'Digit1':
      case 'KeyR':
        nav.goToPreset('original');
        break;
      case 'Digit2':
        nav.goToPreset('dining');
        break;
      case 'Digit3':
        nav.goToPreset('living');
        break;
      case 'Digit4':
        nav.goToPreset('courtyard');
        break;
      case 'Digit5':
        nav.goToPreset('gallery');
        break;
      case 'KeyO':
        toggleNavMode();
        break;
      case 'KeyC':
        toggleCompare();
        break;
      default:
        break;
    }
  });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // --- Modern Web Guidance (efficient-background-processing): Pause WebGL loop off-screen/background ---
  const timer = new THREE.Timer();
  let rafId = 0;
  let isPaused = false;

  // Automatic adaptive resolution guard for lower-power integrated GPUs
  let slowFrameAccumulator = 0;
  let sampleCount = 0;

  function animate(timestamp) {
    if (isPaused) return;
    rafId = requestAnimationFrame(animate);

    timer.update(timestamp);
    const rawDt = timer.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const elapsed = timer.getElapsed();

    // If sustained FPS < 42 in default mode, step down DPR gracefully to 0.9
    if (!highQuality && currentMaxDpr > 0.9 && rawDt > 0 && rawDt < 0.25) {
      slowFrameAccumulator += rawDt;
      sampleCount++;
      if (sampleCount >= 45) {
        const avgDt = slowFrameAccumulator / sampleCount;
        if (avgDt > 0.024) {
          applyDpr(0.9);
        }
        slowFrameAccumulator = 0;
        sampleCount = 0;
      }
    }

    nav.update(dt);
    courtyardApi.update(elapsed);
    furnitureApi.updateFan(dt, fanEnabled);

    renderer.render(scene, camera);
  }

  function startSimulation() {
    if (!isPaused && rafId) return;
    isPaused = false;
    rafId = requestAnimationFrame(animate);
  }

  function stopSimulation() {
    isPaused = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSimulation();
    else startSimulation();
  });

  if (appRoot) {
    if ('contentVisibility' in document.documentElement.style) {
      appRoot.addEventListener('contentvisibilityautostatechange', (event) => {
        if (event.skipped) stopSimulation();
        else startSimulation();
      });
    } else if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) startSimulation();
            else stopSimulation();
          }
        },
        { rootMargin: '200px' }
      );
      observer.observe(appRoot);
    }
  }

  startSimulation();
}

initApp();
