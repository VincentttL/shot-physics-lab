// present_app.mjs — simplified presentation/audience page.
// Verdict + landing cloud run on the tested no-drag core (lab_physics.mjs).
// The "with air" arc (drag + Magnus from backspin) is a labeled overlay from
// present_physics.mjs. No avatar, no stations, no guided demo — sliders only.

import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';

import {
  DEFAULT_COURT,
  courtWith,
  brancazioOptimum,
  rad,
  deg,
  entryAngle,
  depthAtRim,
  lateralAtRim,
  flightTimeToRim,
  trajectoryPoints,
  simulateNoiseExperiment,
  simulatedLandingPointCloud,
  rimTargetRadii,
  rimAcceptance,
  clamp,
} from './lab_physics.mjs';
import { airTrajectory, airRimCrossing, forceScales } from './present_physics.mjs';

const $ = (id) => document.getElementById(id);
const fmt = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : '—');

const controls = {
  angle: $('angle'), speed: $('speed'), spin: $('spin'),
  height: $('height'), distance: $('distance'),
  lateral: $('lateral'), sigmaV: $('sigmaV'), sigmaTheta: $('sigmaTheta'),
};
const outs = {
  angle: $('angleOut'), speed: $('speedOut'), spin: $('spinOut'),
  height: $('heightOut'), distance: $('distanceOut'),
  lateral: $('lateralOut'), sigmaV: $('sigmaVOut'), sigmaTheta: $('sigmaThetaOut'),
};
const airToggle = $('airToggle');
const airReadout = $('airReadout');
const verdictFlag = $('verdictFlag');
const verdictText = $('verdictText');
const cloudCanvas = $('cloudCanvas');
const cloudCtx = cloudCanvas.getContext('2d');
const metricEls = { pmake: $('mPmake'), opt: $('mOpt'), entry: $('mEntry'), time: $('mTime') };

// --- STATE ------------------------------------------------------------------
let lastResult = null;
let launchStart = performance.now();
let isLaunching = true;
let flight = { idealPts: [], airPts: [], duration: 1.1, useAir: false };

function readConfig() {
  const court = courtWith({
    h: Number(controls.height.value),
    d: Number(controls.distance.value),
  });
  return {
    thetaDeg: Number(controls.angle.value),
    theta: rad(Number(controls.angle.value)),
    speed: Number(controls.speed.value),
    backspinRpm: Number(controls.spin.value),
    vLat: Number(controls.lateral.value),
    sigmaV: Number(controls.sigmaV.value),
    sigmaTheta: rad(Number(controls.sigmaTheta.value)),
    court,
  };
}

function syncLabels(cfg) {
  outs.angle.textContent = `${fmt(cfg.thetaDeg, 1)}°`;
  outs.speed.textContent = `${fmt(cfg.speed)} m/s`;
  outs.spin.textContent = `${Math.round(cfg.backspinRpm)} rpm (${fmt(cfg.backspinRpm / 60, 1)} Hz)`;
  outs.height.textContent = `${fmt(cfg.court.h)} m`;
  outs.distance.textContent = `${fmt(cfg.court.d)} m`;
  outs.lateral.textContent = `${fmt(cfg.vLat, 3)} m/s`;
  outs.sigmaV.textContent = `${fmt(Number(controls.sigmaV.value), 3)} m/s`;
  outs.sigmaTheta.textContent = `${fmt(Number(controls.sigmaTheta.value), 2)}°`;
}

// --- THREE SCENE --------------------------------------------------------------
const canvas = $('three');
// Graceful degradation: without WebGL the sliders, verdict, metrics, and the
// 2D landing cloud must still work — only the 3D court goes dark.
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
} catch (err) {
  const legendEl = document.querySelector('.stage-legend');
  if (legendEl) legendEl.textContent = '3D view unavailable on this device — the physics, verdict, and landing cloud still run.';
}
const scene = new THREE.Scene();
const world = new THREE.Group();
scene.add(world);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.52;
orbit.minDistance = 2.2;
orbit.maxDistance = 12;
// Portrait phones get a behind-the-shooter vantage so the whole arc fits the
// tall narrow stage; wide screens keep the side view.
const startAspect = (() => {
  const r = canvas.getBoundingClientRect();
  return r.height > 10 ? r.width / r.height : 1.6;
})();
if (startAspect < 0.95) {
  camera.fov = 58;
  camera.position.set(2.3, 3.35, 4.75);
  orbit.target.set(0, 2.6, -2.3);
} else {
  camera.position.set(3.6, 3.1, 3.2);
  orbit.target.set(0.0, 2.1, -2.2);
}

scene.add(new THREE.AmbientLight(0xbfd4e6, 0.55));
const key = new THREE.DirectionalLight(0xfff2dd, 1.15);
key.position.set(4, 7, 3);
key.castShadow = true;
scene.add(key);
const fill = new THREE.DirectionalLight(0x6aa5ff, 0.35);
fill.position.set(-5, 4, -4);
scene.add(fill);

const materials = {
  floor: new THREE.MeshStandardMaterial({ color: 0x0d1c2c, roughness: 0.62, metalness: 0.05 }),
  line: new THREE.LineBasicMaterial({ color: 0x4b6680, transparent: true, opacity: 0.62 }),
  arc: new THREE.LineBasicMaterial({ color: 0xff9f43 }),
  airArc: new THREE.LineDashedMaterial({ color: 0x60d8ff, dashSize: 0.09, gapSize: 0.05 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xff6b2a, roughness: 0.35, metalness: 0.1, emissive: 0x351000, emissiveIntensity: 0.5 }),
  ball: new THREE.MeshStandardMaterial({ color: 0xf28a2e, roughness: 0.55, metalness: 0.02, emissive: 0x351000, emissiveIntensity: 0.15 }),
  target: new THREE.MeshBasicMaterial({ color: 0x7cf7a1, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  targetFill: new THREE.MeshBasicMaterial({ color: 0x60d8ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
};

// Court
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 10), materials.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.015, -3.6);
  floor.receiveShadow = true;
  world.add(floor);
  const grid = new THREE.GridHelper(9, 18, 0x2b435b, 0x15283b);
  grid.position.set(0, 0.002, -3.6);
  world.add(grid);
  const releaseDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 48),
    new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.55 })
  );
  releaseDisc.rotation.x = -Math.PI / 2;
  releaseDisc.position.set(0, 0.02, 0);
  world.add(releaseDisc);
}

// Hoop
const hoopGroup = new THREE.Group();
world.add(hoopGroup);
const backboard = new THREE.Mesh(
  new THREE.BoxGeometry(1.25, 0.76, 0.035),
  new THREE.MeshStandardMaterial({ color: 0xdce8f2, transparent: true, opacity: 0.12, roughness: 0.2 })
);
hoopGroup.add(backboard);
const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(DEFAULT_COURT.rimDiameter / 2, 0.018, 12, 72), materials.rim);
rimMesh.rotation.x = Math.PI / 2;
hoopGroup.add(rimMesh);
const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.05, 3.1, 18),
  new THREE.MeshStandardMaterial({ color: 0x31465d, roughness: 0.6 })
);
hoopGroup.add(pole);
// Circular ball-center make target on the rim plane
const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.102, 0.112, 64), materials.target);
targetRing.rotation.x = -Math.PI / 2;
hoopGroup.add(targetRing);
const targetFill = new THREE.Mesh(new THREE.CircleGeometry(0.102, 64), materials.targetFill);
targetFill.rotation.x = -Math.PI / 2;
hoopGroup.add(targetFill);

function layoutHoop(court) {
  const z = -court.d;
  rimMesh.position.set(0, court.H, z);
  targetRing.position.set(0, court.H + 0.004, z);
  targetFill.position.set(0, court.H + 0.003, z);
  backboard.position.set(0, court.H + 0.33, z - court.rimDiameter / 2 - 0.09);
  pole.position.set(0, court.H + 0.33 - 1.55, z - court.rimDiameter / 2 - 0.14);
  const r = rimTargetRadii(court).lateral;
  targetRing.geometry.dispose();
  targetRing.geometry = new THREE.RingGeometry(Math.max(0.02, r - 0.006), r + 0.005, 64);
  targetFill.geometry.dispose();
  targetFill.geometry = new THREE.CircleGeometry(Math.max(0.02, r - 0.006), 64);
}

// Ball with seams (visible spin)
const ball = new THREE.Mesh(new THREE.SphereGeometry(DEFAULT_COURT.ballDiameter / 2, 32, 18), materials.ball);
ball.castShadow = true;
const seamMat = new THREE.MeshBasicMaterial({ color: 0x3d1600, transparent: true, opacity: 0.6 });
for (const rot of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
  const seam = new THREE.Mesh(new THREE.TorusGeometry(DEFAULT_COURT.ballDiameter / 2 * 1.01, 0.0035, 8, 72), seamMat);
  seam.rotation.set(rot[0], rot[1], rot[2]);
  ball.add(seam);
}
world.add(ball);

// Trajectory lines
let idealLine = null;
let airLine = null;
function disposeLine(line) {
  if (!line) return;
  world.remove(line);
  line.geometry.dispose();
}

// Map sagittal (x forward, y up) + lateral drift to scene coords (z = -x).
function toScene(cfg, x, y, t) {
  return new THREE.Vector3(cfg.vLat * t, y, -x);
}

function buildFlight(cfg) {
  // Ideal (tested core) — param by time: x = v cosθ · t
  const vx = cfg.speed * Math.cos(cfg.theta);
  const tEnd = Math.max(flightTimeToRim(cfg.theta, cfg.speed, cfg.court) * 1.22, 0.6);
  const idealPts = [];
  for (let i = 0; i <= 130; i++) {
    const t = tEnd * i / 130;
    const x = vx * t;
    const y = cfg.court.h + cfg.speed * Math.sin(cfg.theta) * t - cfg.court.g * t * t / 2;
    if (y < -0.05) break;
    idealPts.push({ t, p: toScene(cfg, x, y, t) });
  }
  // Air overlay
  const airRaw = airTrajectory({ thetaDeg: cfg.thetaDeg, speed: cfg.speed, backspinRpm: cfg.backspinRpm, court: cfg.court });
  const crossing = airRimCrossing(airRaw, cfg.court);
  const tAirEnd = crossing ? Math.min(crossing.t * 1.22, airRaw[airRaw.length - 1].t) : airRaw[airRaw.length - 1].t;
  const airPts = airRaw.filter((p) => p.t <= tAirEnd).map((p) => ({ t: p.t, p: toScene(cfg, p.x, p.y, p.t) }));
  flight = {
    idealPts,
    airPts,
    // The ball always flies the scored ideal arc (it threads the rim on a make,
    // matching the verdict). showAir only decides whether the cyan drag+Magnus
    // comparison line is drawn — it never changes the ball's path.
    duration: idealPts[idealPts.length - 1]?.t || 1.1,
    showAir: airToggle.checked,
    crossing,
  };
  // redraw lines
  disposeLine(idealLine);
  idealLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(idealPts.map((q) => q.p)), materials.arc);
  world.add(idealLine);
  disposeLine(airLine);
  airLine = null;
  if (airToggle.checked && airPts.length > 2) {
    airLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(airPts.map((q) => q.p)), materials.airArc);
    airLine.computeLineDistances();
    world.add(airLine);
  }
}

// --- LANDING CLOUD (rim-plane view) ------------------------------------------
function prepCanvas(cnv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = cnv.getBoundingClientRect();
  if (cnv.width !== Math.round(rect.width * dpr)) {
    cnv.width = Math.round(rect.width * dpr);
    cnv.height = Math.round(rect.height * dpr);
  }
  const ctx = cnv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

function drawCloud(result) {
  const { ctx, w, h } = prepCanvas(cloudCanvas);
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5, cy = h * 0.54;
  const radii = rimTargetRadii(result.court);
  const dots = simulatedLandingPointCloud(result, { limit: 700, maxAbsDepth: 0.55, maxAbsLateral: 0.55 });
  const extent = dots.reduce((m, d0) => Math.max(m, Math.abs(d0.lateral), Math.abs(d0.depth)), 0);
  const maxM = Math.max(radii.lateral * 1.6, extent * 1.12, 0.18);
  const scale = Math.min(w * 0.42, h * 0.40) / maxM;
  const X = (lat) => cx + lat * scale;
  const Y = (dep) => cy - dep * scale;

  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X(-maxM), cy); ctx.lineTo(X(maxM), cy);
  ctx.moveTo(cx, Y(-maxM)); ctx.lineTo(cx, Y(maxM));
  ctx.stroke();

  ctx.fillStyle = 'rgba(96,216,255,.10)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, radii.lateral * scale, radii.depth * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#60d8ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, radii.lateral * scale, radii.depth * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const d0 of dots) {
    ctx.fillStyle = d0.make ? 'rgba(124,247,161,.72)' : 'rgba(255,107,107,.58)';
    ctx.beginPath();
    ctx.arc(X(d0.lateral), Y(d0.depth), 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mean landing point
  ctx.fillStyle = '#f5efe4';
  ctx.strokeStyle = 'rgba(0,0,0,.5)';
  ctx.beginPath();
  ctx.arc(X(result.meanLateral), Y(result.meanDepth), 4.4, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#f5efe4';
  ctx.font = '700 11px JetBrains Mono, monospace';
  ctx.fillText('landing points at the rim plane', 16, 20);
  ctx.fillStyle = '#9fb0c2';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillText(`${result.shots.length} simulated shots · dashed circle = make target (r = ${(radii.lateral * 100).toFixed(1)} cm)`, 16, 35);
  ctx.fillText('long →', cx + 6, 14);
  ctx.fillText('← short', cx + 6, h - 8);
  ctx.fillText('left', 12, cy - 6);
  ctx.fillText('right', w - 40, cy - 6);
}

// --- VERDICT + METRICS ---------------------------------------------------------
function updateVerdict(cfg) {
  const depth = depthAtRim(cfg.theta, cfg.speed, cfg.court);
  const lateral = lateralAtRim(cfg.vLat, cfg.theta, cfg.speed, cfg.court);
  const rim = rimAcceptance({ depth, lateral, court: cfg.court });
  let flag, text, tone;
  if (rim.make && rim.normalizedRadius <= 0.6) {
    flag = 'SWISH'; tone = 'make';
    text = `Ball center threads the target with ${fmt((1 - rim.normalizedRadius) * rim.depthRadius * 100, 1)} cm to spare.`;
  } else if (rim.make) {
    flag = 'MAKE'; tone = 'edge';
    text = 'Inside the circular target, but near the edge — a rattle-in in real life.';
  } else {
    const byDepth = Math.abs(rim.normalizedDepth) >= Math.abs(rim.normalizedLateral);
    flag = byDepth ? (depth < 0 ? 'SHORT' : 'LONG') : (lateral < 0 ? 'LEFT' : 'RIGHT');
    tone = 'miss';
    const cm = byDepth ? Math.abs(depth) * 100 : Math.abs(lateral) * 100;
    text = `Ball center misses the target by ${fmt(cm, 1)} cm ${byDepth ? 'in depth' : 'sideways'}.`;
  }
  verdictFlag.textContent = flag;
  verdictFlag.dataset.tone = tone;
  verdictText.textContent = text;
  const chip = $('chipVerdict');
  if (chip) { chip.textContent = flag; chip.dataset.tone = tone; }
}

function updateMetrics(cfg, result) {
  const opt = brancazioOptimum(cfg.court);
  metricEls.pmake.textContent = `${Math.round(result.makeProbability * 100)}%`;
  metricEls.opt.textContent = `${fmt(opt.thetaDeg, 1)}° · ${fmt(opt.speed)}`;
  metricEls.entry.textContent = `${fmt(deg(entryAngle(cfg.theta, cfg.speed, cfg.court)), 1)}°`;
  metricEls.time.textContent = `${fmt(flightTimeToRim(cfg.theta, cfg.speed, cfg.court))} s`;
  const chipP = $('chipPmake');
  if (chipP) chipP.textContent = `P(make) ${Math.round(result.makeProbability * 100)}%`;
  const chipE = $('chipEntry');
  if (chipE) chipE.textContent = `entry ${fmt(deg(entryAngle(cfg.theta, cfg.speed, cfg.court)), 1)}°`;
}

function updateAirReadout(cfg) {
  if (!airToggle.checked) {
    airReadout.textContent = 'Air overlay off — orange arc is the exact no-drag model used for the verdict and the cloud.';
    return;
  }
  const scales = forceScales({ thetaDeg: cfg.thetaDeg, speed: cfg.speed, backspinRpm: cfg.backspinRpm, court: cfg.court });
  const idealDepth = depthAtRim(cfg.theta, cfg.speed, cfg.court);
  const c = flight.crossing;
  if (!c) {
    airReadout.textContent = `With air the ball never reaches the rim plane — drag ≈ ${(scales.dragOverMg * 100).toFixed(0)}% of gravity at release.`;
    return;
  }
  const airDepth = c.x - cfg.court.d;
  const shift = (airDepth - idealDepth) * 100;
  airReadout.innerHTML =
    `Air vs ideal: lands <b>${fmt(Math.abs(shift), 0)} cm ${shift < 0 ? 'shorter' : 'longer'}</b> · ` +
    `entry ${fmt(c.entryAngleDeg, 1)}° · drag ≈ <b>${(scales.dragOverMg * 100).toFixed(0)}%</b> of gravity, ` +
    `Magnus lift from backspin ≈ <b>${(scales.magnusOverMg * 100).toFixed(1)}%</b> (estimated C_L).`;
}

// --- MAIN UPDATE -----------------------------------------------------------------
function updateAll({ relaunch = false } = {}) {
  const cfg = readConfig();
  syncLabels(cfg);
  layoutHoop(cfg.court);
  buildFlight(cfg);
  const result = simulateNoiseExperiment({
    theta: cfg.theta,
    speed: cfg.speed,
    vLat: cfg.vLat,
    sigmaTheta: cfg.sigmaTheta,
    sigmaV: cfg.sigmaV,
    sigmaLateral: 0.02,
    n: 900,
    seed: 42,
    court: cfg.court,
  });
  lastResult = result;
  updateVerdict(cfg);
  updateMetrics(cfg, result);
  updateAirReadout(cfg);
  drawCloud(result);
  if (relaunch) {
    launchStart = performance.now();
    isLaunching = true;
  }
}

// --- ANIMATION -------------------------------------------------------------------
function resize() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) {
    // layout not settled yet (mobile Safari) — retry shortly
    setTimeout(resize, 300);
    return;
  }
  if (renderer) {
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.fov = camera.aspect < 0.95 ? 58 : 46;
    camera.updateProjectionMatrix();
  }
  if (lastResult) drawCloud(lastResult);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => resize()).observe(canvas.parentElement);
}
// mobile Safari can settle layout after module boot — re-measure a few times
for (const delay of [150, 600, 1600]) setTimeout(resize, delay);
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => { resize(); updateAll({ relaunch: true }); });

function samplePath(pts, t) {
  if (!pts.length) return null;
  if (t <= pts[0].t) return pts[0].p;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t >= t) {
      const a = pts[i - 1], b = pts[i];
      const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
      return a.p.clone().lerp(b.p, f);
    }
  }
  return pts[pts.length - 1].p;
}

let prevNow = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - prevNow) / 1000);
  prevNow = now;
  const cfgSpin = Number(controls.spin.value);
  // True BACKSPIN for flight toward -z: top of the ball rotates back toward the
  // shooter, i.e. ball.rotation.x increases (right-hand rule about +x).
  const spinRate = cfgSpin * 2 * Math.PI / 60;
  if (isLaunching) {
    const t = (now - launchStart) / 1000;
    // Ball always follows the scored ideal arc so it visibly threads the rim on
    // a make; the air arc is a shown/hidden comparison line, not the ball path.
    const pos = samplePath(flight.idealPts, t);
    if (pos) ball.position.copy(pos);
    ball.rotation.x += spinRate * dt;
    if (t > flight.duration + 0.55) isLaunching = false;
  } else {
    // rest at release point, slow display spin so the seams show the direction
    const cfg = readConfig();
    ball.position.set(0, cfg.court.h, 0);
    ball.rotation.x += spinRate * 0.25 * dt;
  }
  if (renderer) {
    orbit.update();
    renderer.render(scene, camera);
  }
}

// --- WIRING ------------------------------------------------------------------------
for (const key of Object.keys(controls)) {
  controls[key].addEventListener('input', () => updateAll({ relaunch: key === 'angle' || key === 'speed' }));
}
airToggle.addEventListener('change', () => updateAll({ relaunch: true }));
$('shootBtn').addEventListener('click', () => updateAll({ relaunch: true }));
$('stageShoot')?.addEventListener('click', () => updateAll({ relaunch: true }));
$('stageReset')?.addEventListener('click', () => $('resetBtn').click());
$('resetBtn').addEventListener('click', () => {
  const opt = brancazioOptimum(courtWith({ h: Number(controls.height.value), d: Number(controls.distance.value) }));
  controls.angle.value = opt.thetaDeg.toFixed(1);
  controls.speed.value = opt.speed.toFixed(2);
  controls.spin.value = '180';
  controls.lateral.value = '0';
  controls.sigmaV.value = '0.045';
  controls.sigmaTheta.value = '0.90';
  updateAll({ relaunch: true });
});

resize();
updateAll({ relaunch: true });
requestAnimationFrame(animate);
window.__labBooted = true;
