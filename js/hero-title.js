// Interactive 3D soft-body title using hero.glb
// Adapted from Fuser Studio setup
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

class SoftBody {
  constructor(mesh, params) {
    this.mesh = mesh;
    this.geometry = mesh.geometry;
    this.params = params;
    this.active = false;

    if (!this.geometry || !this.geometry.attributes.position) return;

    const posAttr = this.geometry.attributes.position;
    const count = posAttr.count;
    if (count === 0) return;

    this.restPositions = new Float32Array(posAttr.array.length);
    this.restPositions.set(posAttr.array);
    this.velocities = new Float32Array(count * 3).fill(0);
    this.vertexCount = count;

    this.centerOfMass = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      this.centerOfMass.x += this.restPositions[i * 3];
      this.centerOfMass.y += this.restPositions[i * 3 + 1];
      this.centerOfMass.z += this.restPositions[i * 3 + 2];
    }
    this.centerOfMass.divideScalar(count);

    this.buildClusters();
    this.active = true;
  }

  buildClusters() {
    const count = this.vertexCount;
    this.neighbors = [];
    this.neighborRestDist = [];
    for (let i = 0; i < count; i++) {
      this.neighbors.push([]);
      this.neighborRestDist.push({});
    }

    const index = this.geometry.index;
    if (index) {
      const indices = index.array;
      const neighborSets = [];
      for (let i = 0; i < count; i++) neighborSets.push(new Set());
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        if (a < count && b < count && c < count) {
          neighborSets[a].add(b); neighborSets[a].add(c);
          neighborSets[b].add(a); neighborSets[b].add(c);
          neighborSets[c].add(a); neighborSets[c].add(b);
        }
      }
      for (let i = 0; i < count; i++) this.neighbors[i] = Array.from(neighborSets[i]);
    }

    for (let i = 0; i < count; i++) {
      const dists = {};
      for (const j of this.neighbors[i]) {
        const dx = this.restPositions[i * 3] - this.restPositions[j * 3];
        const dy = this.restPositions[i * 3 + 1] - this.restPositions[j * 3 + 1];
        const dz = this.restPositions[i * 3 + 2] - this.restPositions[j * 3 + 2];
        dists[j] = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      this.neighborRestDist[i] = dists;
    }
  }

  update(dt, mouseWorldPos, isMouseActive) {
    if (!this.active) return;

    const posAttr = this.geometry.attributes.position;
    if (!posAttr) return;
    const pos = posAttr.array;
    const count = this.vertexCount;
    const p = this.params;

    let localMouse;
    try {
      const inv = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
      localMouse = mouseWorldPos.clone().applyMatrix4(inv);
    } catch (e) {
      localMouse = mouseWorldPos.clone();
    }

    const dtSec = Math.min(dt * 0.001, 0.02);
    if (dtSec <= 0) return;
    const timeScale = dtSec * 60;
    const maxVelocity = 2.0;
    const maxDisplacement = 1.0;

    for (let i = 0; i < count; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;

      let fx = (this.restPositions[ix] - pos[ix]) * p.stiffness;
      let fy = (this.restPositions[iy] - pos[iy]) * p.stiffness;
      let fz = (this.restPositions[iz] - pos[iz]) * p.stiffness;

      const neighbors = this.neighbors[i];
      const restDists = this.neighborRestDist[i];
      for (let ni = 0; ni < neighbors.length; ni++) {
        const j = neighbors[ni];
        const jx = j * 3, jy = j * 3 + 1, jz = j * 3 + 2;
        const dx = pos[jx] - pos[ix];
        const dy = pos[jy] - pos[iy];
        const dz = pos[jz] - pos[iz];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.0001;
        const restDist = restDists[j] || 0;
        const diff = (dist - restDist) / dist;
        const springK = p.stiffness * 0.3;
        fx += dx * diff * springK;
        fy += dy * diff * springK;
        fz += dz * diff * springK;
      }

      fy -= p.gravity * 0.05;

      if (isMouseActive && localMouse) {
        const mdx = pos[ix] - localMouse.x;
        const mdy = pos[iy] - localMouse.y;
        const mdz = pos[iz] - localMouse.z;
        const mDist = Math.sqrt(mdx * mdx + mdy * mdy + mdz * mdz) + 0.1;
        const influence = Math.max(0, 1.0 - mDist / p.mouseRadius);
        const pushForce = p.mouseForce * influence * influence;
        fx += (mdx / mDist) * pushForce * 0.05;
        fy += (mdy / mDist) * pushForce * 0.05;
        fz += (mdz / mDist) * pushForce * 0.05;
      }

      const forceMag = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (forceMag > maxVelocity) {
        const s = maxVelocity / forceMag;
        fx *= s; fy *= s; fz *= s;
      }

      this.velocities[ix] = (this.velocities[ix] + fx) * p.damping;
      this.velocities[iy] = (this.velocities[iy] + fy) * p.damping;
      this.velocities[iz] = (this.velocities[iz] + fz) * p.damping;

      const velMag = Math.sqrt(
        this.velocities[ix] ** 2 + this.velocities[iy] ** 2 + this.velocities[iz] ** 2
      );
      if (velMag > maxVelocity) {
        const s = maxVelocity / velMag;
        this.velocities[ix] *= s;
        this.velocities[iy] *= s;
        this.velocities[iz] *= s;
      }

      pos[ix] += this.velocities[ix] * timeScale;
      pos[iy] += this.velocities[iy] * timeScale;
      pos[iz] += this.velocities[iz] * timeScale;

      const dispX = pos[ix] - this.restPositions[ix];
      const dispY = pos[iy] - this.restPositions[iy];
      const dispZ = pos[iz] - this.restPositions[iz];
      const dispMag = Math.sqrt(dispX * dispX + dispY * dispY + dispZ * dispZ);
      if (dispMag > maxDisplacement) {
        const s = maxDisplacement / dispMag;
        pos[ix] = this.restPositions[ix] + dispX * s;
        pos[iy] = this.restPositions[iy] + dispY * s;
        pos[iz] = this.restPositions[iz] + dispZ * s;
      }
    }

    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

export function initHeroTitle(canvasEl, glbPath, options = {}) {
  const params = {
    stiffness: 0.07,
    damping: 0.86,
    gravity: 0,
    mouseForce: 2.5,
    mouseRadius: 3,
    wobbleAmount: 0.001,
    wobbleSpeed: 1,
    ...options
  };

  let scene, camera, renderer;
  let softBodies = [];
  let time = 0;
  let raycaster, mousePlane;
  let mouseWorld = new THREE.Vector3();
  let mouseNDC = new THREE.Vector2(0, 0);
  let isMouseOver = false;
  let lastTime = performance.now();
  let cameraBaseZ = 10;

  // Performance monitoring — fallback to video if FPS is consistently low
  let fpsHistory = [];
  let fpsSampleCount = 0;
  const FPS_CHECK_FRAMES = 60; // check after this many frames
  const FPS_THRESHOLD = 20;    // below this = slow

  // Scene
  scene = new THREE.Scene();

  // Camera — will be adjusted after model loads
  const aspect = canvasEl.clientWidth / canvasEl.clientHeight;
  camera = new THREE.PerspectiveCamera(12, aspect, 0.1, 1000);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;

  function resize() {
    const w = canvasEl.clientWidth;
    const h = canvasEl.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(5, 10, 7);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x6688cc, 0.5);
  fillLight.position.set(-5, 3, -5);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xff6644, 0.6, 20);
  rimLight.position.set(0, 5, -5);
  scene.add(rimLight);

  // Environment map
  const envScene = new THREE.Scene();
  const envGeo = new THREE.BoxGeometry(100, 100, 100);
  const envColors = [0x445577, 0x334466, 0x556688, 0x443355, 0x667799, 0x554477];
  const envMats = envColors.map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide }));
  const envBox = new THREE.Mesh(envGeo, envMats);
  envScene.add(envBox);
  const cubeRT = new THREE.WebGLCubeRenderTarget(256);
  const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRT);
  envScene.add(cubeCamera);
  cubeCamera.update(renderer, envScene);
  scene.environment = cubeRT.texture;

  // Raycaster
  raycaster = new THREE.Raycaster();
  mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  // Mouse tracking
  canvasEl.addEventListener('mousemove', (e) => {
    const rect = canvasEl.getBoundingClientRect();
    mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    isMouseOver = true;
  });
  canvasEl.addEventListener('mouseleave', () => {
    isMouseOver = false;
    mouseNDC.set(9999, 9999); // move collider far away
  });

  // Touch
  canvasEl.addEventListener('touchmove', (e) => {
    const rect = canvasEl.getBoundingClientRect();
    const touch = e.touches[0];
    mouseNDC.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
    isMouseOver = true;
  }, { passive: true });
  canvasEl.addEventListener('touchend', () => {
    isMouseOver = false;
    mouseNDC.set(9999, 9999);
  });

  // Load GLB
  const loader = new GLTFLoader();
  loader.load(glbPath, (gltf) => {
    const model = gltf.scene;

    // Measure the model
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;


    // Scale to fit nicely
    const targetSize = 6;
    const scaleFactor = targetSize / maxDim;

    model.position.sub(center);
    model.scale.multiplyScalar(scaleFactor);
    model.updateMatrixWorld(true);

    // Fit camera to model based on canvas aspect ratio
    const canvasAspect = canvasEl.clientWidth / canvasEl.clientHeight;
    const scaledSize = size.clone().multiplyScalar(scaleFactor);
    const fov = camera.fov * (Math.PI / 180);

    // Calculate distance needed to see the full model width & height
    const distForHeight = (scaledSize.y / 2) / Math.tan(fov / 2);
    const distForWidth = (scaledSize.x / 2) / (Math.tan(fov / 2) * canvasAspect);
    const dist = Math.max(distForHeight, distForWidth) * 1.4; // 1.4x padding for longer lens

    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    cameraBaseZ = dist;


    const meshes = [];
    model.traverse((child) => {
      if (child.isMesh && child.geometry && child.geometry.attributes.position) {
        meshes.push(child);
      }
    });

    meshes.forEach((mesh) => {
      try {
        const clonedGeo = mesh.geometry.clone();
        mesh.updateWorldMatrix(true, false);
        clonedGeo.applyMatrix4(mesh.matrixWorld);

        let mat;
        if (mesh.material) {
          mat = mesh.material.clone();
          if (mat.isMeshStandardMaterial || mat.isMeshPhongMaterial) {
            mat.roughness = 0.12;
            mat.metalness = 0.6;
            mat.envMapIntensity = 1.5;
          }
        } else {
          mat = new THREE.MeshStandardMaterial({
            color: 0x7788ff, roughness: 0.12, metalness: 0.6, envMapIntensity: 1.5,
          });
        }

        const newMesh = new THREE.Mesh(clonedGeo, mat);
        newMesh.castShadow = true;
        newMesh.receiveShadow = true;
        scene.add(newMesh);

        const sb = new SoftBody(newMesh, params);
        if (sb.active) softBodies.push(sb);
      } catch (e) { /* skip */ }
    });

    // Disable frustum culling for soft body meshes (bounding volumes get stale)
    scene.children.filter(c => c.isMesh).forEach(m => { m.frustumCulled = false; });
  });

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;
    time += dt * 0.001;

    // Mouse to world
    let intersectPoint = new THREE.Vector3(0, 0, 0);
    try {
      raycaster.setFromCamera(mouseNDC, camera);
      const tmp = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(mousePlane, tmp);
      if (hit && isFinite(tmp.x) && isFinite(tmp.y) && isFinite(tmp.z)) {
        intersectPoint = tmp;
      }
    } catch (e) { /* keep default */ }

    const wobbleTime = time * 0.5;

    for (const sb of softBodies) {
      if (!sb.active) continue;

      // Idle wobble
      if (!isMouseOver) {
        for (let i = 0; i < sb.vertexCount; i++) {
          const rx = sb.restPositions[i * 3];
          const ry = sb.restPositions[i * 3 + 1];
          const wSpd = params.wobbleSpeed;
          const wAmt = params.wobbleAmount;
          sb.velocities[i * 3] += Math.sin(wobbleTime * 2 * wSpd + rx * 1.5 + ry * 1.2) * wAmt;
          sb.velocities[i * 3 + 1] += Math.cos(wobbleTime * 1.7 * wSpd + rx * 1.3) * wAmt;
        }
      }

      sb.update(dt, intersectPoint, isMouseOver);
    }

    // Gentle camera sway
    camera.position.x = Math.sin(time * 0.2) * 0.15;
    camera.position.y = Math.sin(time * 0.15) * 0.1;
    camera.position.z = cameraBaseZ;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);

    // Performance check — swap to video if too slow
    fpsSampleCount++;
    if (fpsSampleCount <= FPS_CHECK_FRAMES) {
      fpsHistory.push(1000 / Math.max(dt, 1));
    } else if (fpsSampleCount === FPS_CHECK_FRAMES + 1) {
      const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
      if (avgFps < FPS_THRESHOLD) {
        swapToVideoFallback(canvasEl, renderer);
        return; // stop animation loop
      }
    }
  }

  function swapToVideoFallback(canvas, rend) {
    // Clean up Three.js
    rend.dispose();

    // Create video element as replacement
    const video = document.createElement('video');
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = canvas.style.cssText;
    video.style.width = canvas.style.width || '100%';
    video.style.height = canvas.style.height || '100%';
    video.style.objectFit = 'contain';

    const source = document.createElement('source');
    source.src = 'assets/logo-loop.mp4';
    source.type = 'video/mp4';
    video.appendChild(source);

    canvas.parentNode.replaceChild(video, canvas);
    video.play().catch(() => {});
  }

  animate();
}
