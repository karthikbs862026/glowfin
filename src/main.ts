import * as THREE from "three";

// Phase 0 exit criterion (Part 9): "a cube moves on a real phone via touch."
// This is intentionally primitive — no game logic yet. It exists to prove
// the render loop, touch input, and build/deploy pipeline all work end to
// end before any real mechanics are built on top.

const canvas = document.querySelector<HTMLCanvasElement>("#glowfin-canvas");
if (!canvas) {
  throw new Error("Canvas element #glowfin-canvas not found");
}

// Prevent the browser from hijacking swipe gestures as scroll/zoom (Part 2.1).
canvas.style.touchAction = "none";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.z = 5;

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x33ccff })
);
scene.add(cube);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
scene.add(new THREE.DirectionalLight(0xffffff, 0.8));

// Minimal single-axis steering input, matching the normalized -1..1 contract
// from Part 2.1. Real replacement lands as its own tested module in Phase 1.
let steering = 0;
let activePointerId: number | null = null;

canvas.addEventListener("pointerdown", (e) => {
  if (activePointerId !== null) return; // ignore extra fingers, Part 2.1
  activePointerId = e.pointerId;
});

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== activePointerId) return;
  const normalizedX = (e.clientX / window.innerWidth) * 2 - 1;
  steering = Math.max(-1, Math.min(1, normalizedX));
});

canvas.addEventListener("pointerup", (e) => {
  if (e.pointerId === activePointerId) {
    activePointerId = null;
    steering = 0;
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Fixed timestep simulation, decoupled from render rate (Part 4.2 — non-negotiable).
const FIXED_DT = 1 / 60;
let accumulator = 0;
let lastTime = performance.now();

function simulate(dt: number) {
  cube.position.x += steering * 2 * dt;
  cube.rotation.y += dt;
}

function frame(now: number) {
  const frameTime = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  accumulator += frameTime;

  while (accumulator >= FIXED_DT) {
    simulate(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
