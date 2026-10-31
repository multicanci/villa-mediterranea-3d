import * as THREE from 'three';

function buildMediterraneanEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();

  const domeGeo = new THREE.SphereGeometry(30, 24, 16);
  const pos = domeGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(0xc8d8e8);
  const cMid = new THREE.Color(0xe8dfd2);
  const cBot = new THREE.Color(0xcabca9);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const ny = pos.getY(i) / 30;
    if (ny >= 0) {
      tmp.copy(cMid).lerp(cTop, Math.pow(ny, 0.75));
    } else {
      tmp.copy(cMid).lerp(cBot, Math.min(1, -ny * 1.6));
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const domeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  const portalRight = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 6),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xfff6e5).multiplyScalar(2.1),
      side: THREE.DoubleSide,
    })
  );
  portalRight.position.set(10, 3.2, -1);
  portalRight.lookAt(0, 1.4, -1);
  envScene.add(portalRight);

  const portalLeft = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 5),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xfff2e0).multiplyScalar(1.7),
      side: THREE.DoubleSide,
    })
  );
  portalLeft.position.set(-10, 3.0, 1.2);
  portalLeft.lookAt(0, 1.4, 1.2);
  envScene.add(portalLeft);

  const envRT = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  domeGeo.dispose();
  domeMat.dispose();
  return envRT.texture;
}

export function setupLighting(scene, renderer) {
  scene.environment = buildMediterraneanEnvironment(renderer);
  scene.environmentIntensity = 0.38;
  scene.background = new THREE.Color(0xdfe8f0);

  // 1. Primary Mediterranean Sun — baked ONCE at startup (shadowMap.autoUpdate = false -> 0ms/frame!)
  const sunLight = new THREE.DirectionalLight(0xfff2dc, 3.45);
  sunLight.position.set(11.6, 10.6, 3.8);
  sunLight.target.position.set(-1.4, 0.4, -1.2);
  sunLight.castShadow = true;

  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1.5;
  sunLight.shadow.camera.far = 30;
  sunLight.shadow.camera.left = -9.5;
  sunLight.shadow.camera.right = 9.5;
  sunLight.shadow.camera.top = 8.5;
  sunLight.shadow.camera.bottom = -8.5;
  sunLight.shadow.bias = -0.00035;
  sunLight.shadow.normalBias = 0.018;
  sunLight.shadow.radius = 2.0;

  scene.add(sunLight);
  scene.add(sunLight.target);

  // 2. Balanced Mediterranean Sky / Warm Plaster Bounce Hemisphere Light
  const hemiLight = new THREE.HemisphereLight(0xfffaf0, 0xd8cab7, 0.68);
  hemiLight.position.set(0, 4.5, 0);
  scene.add(hemiLight);

  // 3. Dedicated Outdoor Courtyard Sun — shadow map also baked ONCE at startup (0ms/frame!)
  const courtyardSun = new THREE.SpotLight(0xfff3dc, 36.0, 20.0, 0.68, 0.14, 1.15);
  courtyardSun.position.set(-1.9, 6.6, -1.35);
  courtyardSun.target.position.set(-5.8, 2.15, 2.35);
  courtyardSun.castShadow = true;
  courtyardSun.shadow.mapSize.set(1024, 1024);
  courtyardSun.shadow.bias = -0.0004;
  courtyardSun.shadow.normalBias = 0.02;
  scene.add(courtyardSun);
  scene.add(courtyardSun.target);

  // 4. Lightweight non-shadow directional sky portal fill
  const courtyardBounce = new THREE.DirectionalLight(0xfff4e6, 0.48);
  courtyardBounce.position.set(-7.5, 4.0, 1.5);
  courtyardBounce.target.position.set(0.6, 1.3, 0.2);
  scene.add(courtyardBounce);
  scene.add(courtyardBounce.target);

  // 5. Single consolidated interior ceiling-radiosity PointLight + sunlit niche PointLight
  const roomRadiosity = new THREE.PointLight(0xf3e7d6, 1.75, 15, 1.25);
  roomRadiosity.position.set(-0.05, 0.85, -0.3);
  scene.add(roomRadiosity);

  const nicheSunGlow = new THREE.PointLight(0xfff1d4, 1.4, 2.8, 1.8);
  nicheSunGlow.position.set(2.60, 1.88, -4.68);
  scene.add(nicheSunGlow);

  return { sunLight, hemiLight };
}
