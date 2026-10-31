import * as THREE from 'three';

function loadTiledPBR(loader, baseName, rx, ry, aniso) {
  const color = loader.load(`./textures/${baseName}_color.jpg`);
  const normal = loader.load(`./textures/${baseName}_normal.jpg`);

  color.colorSpace = THREE.SRGBColorSpace;

  for (const tex of [color, normal]) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    tex.anisotropy = aniso;
  }

  return { map: color, normalMap: normal };
}

function createSoftShadowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
  g.addColorStop(0.0, 'rgba(30, 22, 14, 0.44)');
  g.addColorStop(0.55, 'rgba(34, 25, 16, 0.22)');
  g.addColorStop(1.0, 'rgba(34, 25, 16, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function createBulbHaloTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size * 0.5);
  g.addColorStop(0.0, 'rgba(255, 246, 220, 0.95)');
  g.addColorStop(0.28, 'rgba(255, 226, 172, 0.36)');
  g.addColorStop(1.0, 'rgba(255, 215, 150, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMaterials(renderer) {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);

  const mcMaps = loadTiledPBR(loader, 'microcement', 3.5, 4.5, aniso);
  const mcPatioMaps = loadTiledPBR(loader, 'microcement', 2.5, 2.5, aniso);
  const plasterMaps = loadTiledPBR(loader, 'lime_plaster', 3.0, 1.8, aniso);
  const woodTableMaps = loadTiledPBR(loader, 'reclaimed_wood', 1.0, 1.3, aniso);
  const woodCoffeeMaps = loadTiledPBR(loader, 'reclaimed_wood', 1.0, 1.0, aniso);
  const doorOakMaps = loadTiledPBR(loader, 'door_oak', 1.0, 2.0, aniso);
  const stoneMaps = loadTiledPBR(loader, 'courtyard_stone', 2.4, 1.55, aniso);
  const rugMaps = loadTiledPBR(loader, 'rug_kilim', 1.0, 1.0, aniso);
  const linenMaps = loadTiledPBR(loader, 'linen_fabric', 5.0, 5.0, aniso);
  const terraMaps = loadTiledPBR(loader, 'terracotta', 1.4, 1.2, aniso);

  const seaCaveTex = loader.load('./textures/painting_seacave.jpg');
  seaCaveTex.colorSpace = THREE.SRGBColorSpace;
  seaCaveTex.anisotropy = aniso;

  const sideArtTex = loader.load('./textures/painting_side.jpg');
  sideArtTex.colorSpace = THREE.SRGBColorSpace;
  sideArtTex.anisotropy = aniso;

  for (const t of [rugMaps.map, rugMaps.normalMap]) {
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
  }

  return {
    contactShadow: new THREE.MeshBasicMaterial({
      map: createSoftShadowTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),

    bulbHaloSprite: new THREE.SpriteMaterial({
      map: createBulbHaloTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),

    microcementFloor: new THREE.MeshStandardMaterial({
      ...mcMaps,
      color: 0xece6dc,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.72,
      metalness: 0.0,
      envMapIntensity: 0.62,
    }),

    patioMicrocement: new THREE.MeshStandardMaterial({
      ...mcPatioMaps,
      color: 0xe2dbd0,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.88,
      metalness: 0.0,
      envMapIntensity: 0.45,
    }),

    poolCoping: new THREE.MeshStandardMaterial({
      ...mcPatioMaps,
      color: 0xc2b2a1,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.86,
      metalness: 0.0,
      envMapIntensity: 0.42,
    }),

    poolBasin: new THREE.MeshStandardMaterial({
      color: 0x26524d,
      roughness: 0.6,
      metalness: 0.0,
    }),

    limeWall: new THREE.MeshStandardMaterial({
      ...plasterMaps,
      color: 0xe2d6c6,
      normalScale: new THREE.Vector2(0.52, 0.52),
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.42,
    }),

    limeCeiling: new THREE.MeshStandardMaterial({
      ...plasterMaps,
      color: 0xf2eae0,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.48,
    }),

    reclaimedWood: new THREE.MeshStandardMaterial({
      ...woodTableMaps,
      color: 0xf7eee5,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughness: 0.78,
      metalness: 0.0,
      envMapIntensity: 0.55,
    }),

    bleachedWood: new THREE.MeshStandardMaterial({
      ...woodCoffeeMaps,
      color: 0xe8ddd0,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughness: 0.84,
      metalness: 0.0,
      envMapIntensity: 0.45,
    }),

    doorOak: new THREE.MeshStandardMaterial({
      ...doorOakMaps,
      color: 0xbda78f,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.7,
      metalness: 0.0,
      envMapIntensity: 0.55,
    }),

    weatheredShutterOak: new THREE.MeshStandardMaterial({
      ...doorOakMaps,
      color: 0x8e7966,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.76,
      metalness: 0.0,
      envMapIntensity: 0.48,
    }),

    chairOak: new THREE.MeshStandardMaterial({
      ...doorOakMaps,
      color: 0xa6896d,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.6,
      metalness: 0.0,
      envMapIntensity: 0.6,
    }),

    wovenCordSeat: new THREE.MeshStandardMaterial({
      ...rugMaps,
      color: 0xcab9a0,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.9,
      metalness: 0.0,
    }),

    courtyardStone: new THREE.MeshStandardMaterial({
      ...stoneMaps,
      color: 0xe2d2c0,
      normalScale: new THREE.Vector2(2.0, 2.0),
      roughness: 0.9,
      metalness: 0.0,
      envMapIntensity: 0.36,
    }),

    rugKilim: new THREE.MeshStandardMaterial({
      ...rugMaps,
      color: 0xe2d7c8,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.35,
    }),

    sofaLinen: new THREE.MeshStandardMaterial({
      ...linenMaps,
      color: 0xf6f2e9,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.88,
      metalness: 0.0,
      envMapIntensity: 0.52,
    }),

    pillowLinen: new THREE.MeshStandardMaterial({
      ...linenMaps,
      color: 0xf3ede1,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.86,
      metalness: 0.0,
      envMapIntensity: 0.52,
    }),

    curtainLinen: new THREE.MeshStandardMaterial({
      ...linenMaps,
      color: 0xd0c7b8,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),

    terracotta: new THREE.MeshStandardMaterial({
      ...terraMaps,
      color: 0xbda798,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughness: 0.86,
      metalness: 0.0,
      envMapIntensity: 0.38,
    }),

    rattanPrimary: new THREE.MeshStandardMaterial({
      color: 0x7c6148,
      roughness: 0.74,
      metalness: 0.0,
      envMapIntensity: 0.45,
    }),

    rattanSecondary: new THREE.MeshStandardMaterial({
      color: 0x674e38,
      roughness: 0.78,
      metalness: 0.0,
      envMapIntensity: 0.42,
    }),

    darkBronze: new THREE.MeshStandardMaterial({
      color: 0x2a231e,
      roughness: 0.42,
      metalness: 0.65,
      envMapIntensity: 0.9,
    }),

    tvScreen: new THREE.MeshStandardMaterial({
      color: 0x121316,
      roughness: 0.16,
      metalness: 0.15,
      envMapIntensity: 1.05,
    }),

    tvConsoleCream: new THREE.MeshStandardMaterial({
      ...mcPatioMaps,
      color: 0xeee8dc,
      normalScale: new THREE.Vector2(0.2, 0.2),
      roughness: 0.65,
      metalness: 0.0,
    }),

    windowGlass: new THREE.MeshStandardMaterial({
      color: 0xf5f9f8,
      transparent: true,
      opacity: 0.13,
      roughness: 0.08,
      metalness: 0.12,
      envMapIntensity: 1.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),

    // High-gloss translucent olive glass WITHOUT triggering full-scene renderTransmissionPass!
    oliveGlass: new THREE.MeshStandardMaterial({
      color: 0x243019,
      transparent: true,
      opacity: 0.84,
      roughness: 0.07,
      metalness: 0.14,
      envMapIntensity: 1.75,
    }),

    amberOliveGlass: new THREE.MeshStandardMaterial({
      color: 0x35341e,
      transparent: true,
      opacity: 0.78,
      roughness: 0.08,
      metalness: 0.12,
      envMapIntensity: 1.65,
    }),

    darkCeramicVase: new THREE.MeshStandardMaterial({
      color: 0x1c211b,
      roughness: 0.15,
      metalness: 0.08,
      envMapIntensity: 1.4,
    }),

    ceramicPlate: new THREE.MeshStandardMaterial({
      color: 0xe9e3d8,
      roughness: 0.22,
      metalness: 0.02,
      envMapIntensity: 0.95,
    }),

    ceramicRim: new THREE.MeshStandardMaterial({
      color: 0xb6a796,
      roughness: 0.55,
      metalness: 0.0,
    }),

    jutePlacemat: new THREE.MeshStandardMaterial({
      ...rugMaps,
      color: 0xc2ae94,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughness: 0.94,
    }),

    cutleryHandle: new THREE.MeshStandardMaterial({
      color: 0x26211d,
      roughness: 0.5,
      metalness: 0.1,
    }),

    cutleryMetal: new THREE.MeshStandardMaterial({
      color: 0xd6c5a9,
      roughness: 0.24,
      metalness: 0.88,
      envMapIntensity: 1.2,
    }),

    paintingSeaCave: new THREE.MeshStandardMaterial({
      map: seaCaveTex,
      normalMap: linenMaps.normalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.72,
      metalness: 0.0,
    }),

    paintingSide: new THREE.MeshStandardMaterial({
      map: sideArtTex,
      normalMap: linenMaps.normalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.72,
      metalness: 0.0,
    }),

    leafTropical: new THREE.MeshStandardMaterial({
      color: 0x243f28,
      roughness: 0.36,
      metalness: 0.02,
      envMapIntensity: 0.65,
      side: THREE.DoubleSide,
    }),

    leafSansevieria: new THREE.MeshStandardMaterial({
      color: 0x2d4b2b,
      roughness: 0.38,
      metalness: 0.02,
      envMapIntensity: 0.55,
      side: THREE.DoubleSide,
    }),

    bougainvilleaMagenta: new THREE.MeshStandardMaterial({
      color: 0xc8196e,
      roughness: 0.58,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),

    bougainvilleaPink: new THREE.MeshStandardMaterial({
      color: 0xe43188,
      roughness: 0.55,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),

    bougainvilleaDeep: new THREE.MeshStandardMaterial({
      color: 0x9b1153,
      roughness: 0.62,
      metalness: 0.0,
      side: THREE.DoubleSide,
    }),

    vineLeaf: new THREE.MeshStandardMaterial({
      color: 0x284523,
      roughness: 0.52,
      side: THREE.DoubleSide,
    }),

    flowerWhite: new THREE.MeshStandardMaterial({
      color: 0xf7f5ec,
      roughness: 0.65,
      side: THREE.DoubleSide,
    }),

    bulbGlow: new THREE.MeshBasicMaterial({
      color: 0xfff8e6,
    }),
  };
}
