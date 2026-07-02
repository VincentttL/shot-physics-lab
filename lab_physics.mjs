// lab_physics.mjs — small browser/Node physics core for Shot Physics Lab.
// Units: SI. Angles in radians. Coordinates: x = horizontal range, y = height.

import { CMU_124_FREE_THROW_TRACE } from './mocap_traces.mjs';
import {
  SPL_FREE_THROW_SAMPLES,
  SPL_FREE_THROW_SOURCE,
} from './research/spl_probe/derived/spl_free_throw_summary.mjs';

export { CMU_124_FREE_THROW_TRACE, SPL_FREE_THROW_SAMPLES, SPL_FREE_THROW_SOURCE };

export const DEFAULT_COURT = Object.freeze({
  g: 9.81,
  H: 3.05,
  h: 2.20,
  d: 4.20,
  rimDiameter: 0.4572,
  ballDiameter: 0.2388,
  get w() { return (this.rimDiameter - this.ballDiameter) / 2; },
});

export const rad = (deg) => deg * Math.PI / 180;
export const deg = (radians) => radians * 180 / Math.PI;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function courtWith(overrides = {}) {
  const base = { ...DEFAULT_COURT, w: DEFAULT_COURT.w };
  const c = { ...base, ...overrides };
  if (!('w' in overrides)) c.w = (c.rimDiameter - c.ballDiameter) / 2;
  return c;
}

export function trajectoryY(x, theta, v, court = DEFAULT_COURT) {
  const cos = Math.cos(theta);
  return court.h + x * Math.tan(theta) - court.g * x * x / (2 * v * v * cos * cos);
}

export function trajectoryPoints(theta, v, court = DEFAULT_COURT, n = 90) {
  const xStop = Math.max(court.d * 1.12, farRoot(theta, v, court) || court.d);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const x = xStop * i / (n - 1);
    pts.push({ x, y: trajectoryY(x, theta, v, court) });
  }
  return pts.filter((p) => Number.isFinite(p.y) && p.y >= -0.2 && p.y < 8);
}

export function makeSpeed(theta, court = DEFAULT_COURT) {
  const D = court.H - court.h;
  const denom = 2 * Math.cos(theta) ** 2 * (court.d * Math.tan(theta) - D);
  if (denom <= 0) return NaN;
  return Math.sqrt(court.g * court.d * court.d / denom);
}

export function brancazioOptimum(court = DEFAULT_COURT) {
  const theta = Math.PI / 4 + 0.5 * Math.atan((court.H - court.h) / court.d);
  return { theta, thetaDeg: deg(theta), speed: makeSpeed(theta, court) };
}

export function farRoot(theta, v, court = DEFAULT_COURT) {
  const cos = Math.cos(theta);
  const a = -court.g / (2 * v * v * cos * cos);
  const b = Math.tan(theta);
  const c = court.h - court.H;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || !Number.isFinite(disc)) return NaN;
  const s = Math.sqrt(disc);
  const r1 = (-b + s) / (2 * a);
  const r2 = (-b - s) / (2 * a);
  return Math.max(r1, r2);
}

export function depthAtRim(theta, v, court = DEFAULT_COURT) {
  return farRoot(theta, v, court) - court.d;
}

export function entryAngle(theta, v, court = DEFAULT_COURT) {
  const slope = Math.tan(theta) - court.g * court.d / (v * v * Math.cos(theta) ** 2);
  return Math.atan(-slope);
}

export function flightTimeToRim(theta, v, court = DEFAULT_COURT) {
  return court.d / (v * Math.cos(theta));
}

export function lateralAtRim(vLat, theta, v, court = DEFAULT_COURT) {
  return vLat * flightTimeToRim(theta, v, court);
}

export function lateralCriticalVelocity(theta, v, court = DEFAULT_COURT) {
  return lateralAllowanceAtDepth(depthAtRim(theta, v, court), court) / flightTimeToRim(theta, v, court);
}

export function lateralAllowanceAtDepth(depth, court = DEFAULT_COURT) {
  const radii = rimTargetRadii(court);
  const depthNorm = Math.abs(depth) / radii.depth;
  if (!Number.isFinite(depthNorm) || depthNorm > 1) return 0;
  return radii.lateral * Math.sqrt(Math.max(0, 1 - depthNorm * depthNorm));
}

export function rimTargetRadii(court = DEFAULT_COURT) {
  const r = court.w ?? (court.rimDiameter - court.ballDiameter) / 2;
  return {
    // Physical hoop is circular in top view. Keeping separate radii lets the UI
    // render/project it as an ellipse without reverting the model to a rectangle.
    depth: court.rimDepthRadius ?? r,
    lateral: court.rimLateralRadius ?? r,
  };
}

export function rimAcceptance({
  depth = 0,
  lateral = 0,
  court = DEFAULT_COURT,
  radii = rimTargetRadii(court),
} = {}) {
  const depthRadius = radii.depth;
  const lateralRadius = radii.lateral;
  const normalizedDepth = depth / depthRadius;
  const normalizedLateral = lateral / lateralRadius;
  const normalizedRadius = Math.hypot(normalizedDepth, normalizedLateral);
  const make = Number.isFinite(normalizedRadius) && normalizedRadius <= 1 + 1e-12;
  return {
    depth,
    lateral,
    depthRadius,
    lateralRadius,
    normalizedDepth,
    normalizedLateral,
    normalizedRadius,
    make,
  };
}

// --- SHOT VERDICT ----------------------------------------------------------
// Turn the deterministic hero shot — the one orange arc, or the mean release a
// noise cloud is centered on — into a plain-language basketball verdict: SWISH,
// or the miss reason SHORT / LONG / LEFT / RIGHT, with the centimetre offset and
// a coaching hint mapped to the honest lab factor (release speed for depth,
// force-line for lateral). This invents NO new physics: it is a thin readout
// over the SAME circular ball-center rimAcceptance() the whole lab already uses
// and tests. Sign conventions match the rest of the core:
//   depth   > 0 → ball-center lands PAST the rim center (long);  < 0 → short.
//   lateral > 0 → ball-center lands RIGHT of center;             < 0 → left.
export const SHOT_VERDICT_FLAGS = Object.freeze({
  swish: 'SWISH',
  make: 'MAKE',
  short: 'SHORT',
  long: 'LONG',
  left: 'LEFT',
  right: 'RIGHT',
});

// A make whose ball-center passes beyond this fraction of the tolerance radius is
// a rim-grazer: it clears the circular ball-center target, but with little room.
// We split clean SWISH from edge MAKE purely on geometric clearance — NOT a rim
// contact simulation (contact is excluded from the core), so the edge-make copy
// names that explicitly instead of pretending the model resolves a rattle.
export const SWISH_CLEARANCE_FRACTION = 0.6;

export function classifyShot({ depth, lateral = 0, court = DEFAULT_COURT } = {}) {
  const radii = rimTargetRadii(court);
  const toCm = (m) => Math.round(m * 1000) / 10;
  const targetRadiusCm = toCm(radii.lateral);
  const reaches = Number.isFinite(depth) && Number.isFinite(lateral);

  if (!reaches) {
    return Object.freeze({
      reaches: false,
      make: false,
      reason: 'short',
      flag: SHOT_VERDICT_FLAGS.short,
      tone: 'miss',
      depthCm: NaN,
      lateralCm: Number.isFinite(lateral) ? toCm(lateral) : 0,
      offsetCm: NaN,
      marginCm: NaN,
      centerDistanceCm: NaN,
      normalizedRadius: Infinity,
      targetRadiusCm,
      headline: 'never reaches the rim plane',
      hint: 'well short — add release speed to carry the ball to the hoop.',
      rim: null,
    });
  }

  const rim = rimAcceptance({ depth, lateral, court, radii });
  const depthCm = toCm(depth);
  const lateralCm = toCm(lateral);
  const centerDistanceCm = Math.round(Math.hypot(depth, lateral) * 1000) / 10;

  if (rim.make) {
    // Clearance margin assumes the circular ball-center target the lab uses; with
    // that target it equals the physical ball-edge-to-rim gap (w − offset).
    const marginCm = toCm(radii.lateral - Math.hypot(depth, lateral));
    const clean = rim.normalizedRadius <= SWISH_CLEARANCE_FRACTION;
    const reason = clean ? 'swish' : 'make';
    return Object.freeze({
      reaches: true,
      make: true,
      reason,
      flag: SHOT_VERDICT_FLAGS[reason],
      tone: clean ? 'make' : 'edge',
      depthCm,
      lateralCm,
      offsetCm: centerDistanceCm,
      marginCm,
      centerDistanceCm,
      normalizedRadius: rim.normalizedRadius,
      targetRadiusCm,
      headline: `ball-center ${centerDistanceCm} cm from center · ${marginCm} cm inside the ${targetRadiusCm} cm target`,
      hint: clean
        ? 'clean center pass — release speed and line are both well inside tolerance.'
        : `in, but only ${marginCm} cm of ball-to-rim clearance — rim contact (not modeled here) could rattle it out.`,
      rim,
    });
  }

  // Miss: name the dominant axis of the error so the cause is unambiguous.
  const depthDominant = Math.abs(rim.normalizedDepth) >= Math.abs(rim.normalizedLateral);
  let reason;
  let headline;
  let hint;
  if (depthDominant) {
    if (depth >= 0) {
      reason = 'long';
      headline = `carries ${Math.abs(depthCm)} cm past the rim center`;
      hint = 'ease release speed — the ball is landing long.';
    } else {
      reason = 'short';
      headline = `drops ${Math.abs(depthCm)} cm short of the rim center`;
      hint = 'add release speed (or a touch more arc) — depth is the speed-sensitive axis.';
    }
  } else if (lateral >= 0) {
    reason = 'right';
    headline = `pushes ${Math.abs(lateralCm)} cm right of center`;
    hint = 'force-line leaks right — square the release; nothing pulls the ball back.';
  } else {
    reason = 'left';
    headline = `pulls ${Math.abs(lateralCm)} cm left of center`;
    hint = 'force-line leaks left — square the release; nothing pulls the ball back.';
  }

  return Object.freeze({
    reaches: true,
    make: false,
    reason,
    flag: SHOT_VERDICT_FLAGS[reason],
    tone: 'miss',
    depthCm,
    lateralCm,
    offsetCm: depthDominant ? Math.abs(depthCm) : Math.abs(lateralCm),
    marginCm: NaN,
    centerDistanceCm,
    normalizedRadius: rim.normalizedRadius,
    targetRadiusCm,
    headline,
    hint,
    rim,
  });
}

const INCH_TO_METER = 0.0254;

export function splShotToRimPlane(sample, courtOrOptions = DEFAULT_COURT) {
  if (!sample) throw new Error('SPL shot sample is required');
  const court = courtOrOptions?.court || courtOrOptions || DEFAULT_COURT;
  const lateralIn = Number(sample.landing_x);
  const depthFromFrontIn = Number(sample.landing_y);
  const entryAngleDeg = Number(sample.entry_angle);
  const rimCenterFromFrontIn = (court.rimDiameter / 2) / INCH_TO_METER;
  const lateral = lateralIn * INCH_TO_METER;
  const depth = (depthFromFrontIn - rimCenterFromFrontIn) * INCH_TO_METER;
  const rim = rimAcceptance({ depth, lateral, court });
  const actualMake = String(sample.result).toLowerCase() === 'made';
  const modelMake = rim.make;
  const comparison = actualMake
    ? (modelMake ? 'real_make_model_make' : 'real_make_model_miss')
    : (modelMake ? 'real_miss_model_make' : 'real_miss_model_miss');
  return {
    sample,
    court,
    lateral,
    depth,
    lateralIn,
    depthFromFrontIn,
    depthFromCenterIn: depthFromFrontIn - rimCenterFromFrontIn,
    entryAngleDeg,
    entryAngle: rad(entryAngleDeg),
    actualMake,
    modelMake,
    modelAgreesWithResult: actualMake === modelMake,
    comparison,
    rim,
  };
}

export function lateralExperiment({
  theta,
  speed,
  vLat = 0,
  court = DEFAULT_COURT,
} = {}) {
  const opt = brancazioOptimum(court);
  const th = theta ?? opt.theta;
  const vv = speed ?? opt.speed;
  const time = flightTimeToRim(th, vv, court);
  const depth = depthAtRim(th, vv, court);
  const lateral = lateralAtRim(vLat, th, vv, court);
  const critical = lateralCriticalVelocity(th, vv, court);
  const rim = rimAcceptance({ depth, lateral, court });
  return {
    theta: th,
    speed: vv,
    vLat,
    depth,
    flightTime: time,
    lateralAtRim: lateral,
    lateralCriticalVelocity: critical,
    rim,
    makeByLateral: rim.make,
    court,
  };
}

export function forceLineReadout({
  theta,
  speed,
  vLat = 0,
  court = DEFAULT_COURT,
} = {}) {
  const experiment = lateralExperiment({ theta, speed, vLat, court });
  const allowance = lateralAllowanceAtDepth(experiment.depth, court);
  const drift = experiment.lateralAtRim;
  const absDrift = Math.abs(drift);
  const normalized = allowance > 1e-12
    ? drift / allowance
    : (absDrift <= 1e-12 ? 0 : Math.sign(drift) * Infinity);
  const direction = absDrift < 1e-4 ? 'center' : (drift < 0 ? 'left' : 'right');
  const outsideBy = Math.max(0, absDrift - allowance);
  const insideBy = Math.max(0, allowance - absDrift);
  return {
    ...experiment,
    model: 'constant lateral velocity; no restoring force',
    status: experiment.makeByLateral ? 'IN' : 'MISS',
    direction,
    drift,
    absDrift,
    allowance,
    driftCm: drift * 100,
    absDriftCm: absDrift * 100,
    allowanceCm: allowance * 100,
    outsideByCm: outsideBy * 100,
    insideByCm: insideBy * 100,
    normalizedToAllowance: normalized,
  };
}

export function centralDiff(fn, x, eps) {
  return (fn(x + eps) - fn(x - eps)) / (2 * eps);
}

export function landingJacobian(theta, v, court = DEFAULT_COURT) {
  const eTheta = 1e-5;
  const eV = 1e-4;
  const dDepthDTheta = centralDiff((th) => depthAtRim(th, v, court), theta, eTheta);
  const dDepthDV = centralDiff((vv) => depthAtRim(theta, vv, court), v, eV);
  const dEntryDTheta = centralDiff((th) => entryAngle(th, v, court), theta, eTheta);
  const dEntryDV = centralDiff((vv) => entryAngle(theta, vv, court), v, eV);
  return {
    depthTheta: dDepthDTheta,
    depthV: dDepthDV,
    entryTheta: dEntryDTheta,
    entryV: dEntryDV,
  };
}

// Deterministic PRNG + Gaussian sampler. Good enough for a visual lab.
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalPair(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  const m = Math.sqrt(-2 * Math.log(u1));
  const a = 2 * Math.PI * u2;
  return [m * Math.cos(a), m * Math.sin(a)];
}

export function simulateNoiseExperiment({
  theta,
  speed,
  vLat = 0,
  sigmaTheta = rad(0.9),
  sigmaV = 0.045,
  sigmaLateral = 0,
  n = 1200,
  seed = 42,
  court = DEFAULT_COURT,
} = {}) {
  const opt = brancazioOptimum(court);
  const th0 = theta ?? opt.theta;
  const v0 = speed ?? opt.speed;
  const rng = mulberry32(seed);
  const shots = [];
  let made = 0;
  for (let i = 0; i < n; i++) {
    const [z1, z2] = normalPair(rng);
    const zLat = sigmaLateral > 0 ? normalPair(rng)[0] : 0;
    const th = th0 + z1 * sigmaTheta;
    const vv = Math.max(0.5, v0 + z2 * sigmaV);
    const vLatShot = vLat + zLat * sigmaLateral;
    const depth = depthAtRim(th, vv, court);
    const lateral = lateralAtRim(vLatShot, th, vv, court);
    const rim = rimAcceptance({ depth, lateral, court });
    const make = rim.make;
    if (make) made++;
    shots.push({ theta: th, speed: vv, vLatShot, depth, lateral, rim, make, zTheta: z1, zV: z2, zLat });
  }
  const J = landingJacobian(th0, v0, court);
  const meanDepth = depthAtRim(th0, v0, court);
  const meanLateral = lateralAtRim(vLat, th0, v0, court);
  const meanRim = rimAcceptance({ depth: meanDepth, lateral: meanLateral, court });
  const sdDepthLinear = Math.sqrt((J.depthTheta * sigmaTheta) ** 2 + (J.depthV * sigmaV) ** 2);
  const radii = rimTargetRadii(court);
  const lateralNorm = Math.abs(meanLateral) / radii.lateral;
  const depthLimit = lateralNorm <= 1 ? radii.depth * Math.sqrt(Math.max(0, 1 - lateralNorm * lateralNorm)) : 0;
  const pGauss = sdDepthLinear > 1e-12
    ? (depthLimit > 0
      ? normalCdf((depthLimit - meanDepth) / sdDepthLinear) - normalCdf((-depthLimit - meanDepth) / sdDepthLinear)
      : 0)
    : (meanRim.make ? 1 : 0);
  return {
    theta: th0,
    speed: v0,
    vLat,
    sigmaTheta,
    sigmaV,
    sigmaLateral,
    shots,
    makeProbability: made / n,
    gaussianMakeProbability: Math.max(0, Math.min(1, pGauss)),
    meanDepth,
    meanLateral,
    meanRim,
    sdDepthLinear,
    court,
    jacobian: J,
  };
}

export function simulatedLandingPointCloud(result, { limit = 900, maxAbsDepth = 0.48, maxAbsLateral = 0.48 } = {}) {
  return (result.shots || []).slice(0, limit).map((shot) => {
    const depth = clamp(shot.depth, -maxAbsDepth, maxAbsDepth);
    const lateral = clamp(shot.lateral, -maxAbsLateral, maxAbsLateral);
    const rim = shot.rim || rimAcceptance({ depth: shot.depth, lateral: shot.lateral, court: result.court || DEFAULT_COURT });
    return {
      source: shot,
      depth,
      lateral,
      rim,
      make: Boolean(shot.make),
    };
  });
}

export function rimPlaneDotCloud(result, { limit = 1400, radiusScale = 1.32 } = {}) {
  const court = result.court || DEFAULT_COURT;
  const radii = rimTargetRadii(court);
  const centerDepth = Number.isFinite(result.meanDepth) ? result.meanDepth : 0;
  const centerLateral = Number.isFinite(result.meanLateral) ? result.meanLateral : 0;
  return (result.shots || []).slice(0, limit).map((shot) => {
    // Use the existing Gaussian z-pair, but render it as an isotropic rim-plane
    // dot cloud. This preserves the old probability-by-dots feel while the
    // envelope is now circular, matching the circular ball-center make target.
    const zTheta = Number.isFinite(shot.zTheta) ? shot.zTheta : 0;
    const zV = Number.isFinite(shot.zV) ? shot.zV : 0;
    const angle = Math.atan2(zV, zTheta);
    const clippedRadius = Math.min(radiusScale, Math.hypot(zTheta, zV) / 2.15 * radiusScale);
    const lateral = centerLateral + Math.cos(angle) * clippedRadius * radii.lateral;
    const depth = centerDepth + Math.sin(angle) * clippedRadius * radii.depth;
    const rim = rimAcceptance({ depth, lateral, court });
    return {
      source: shot,
      depth,
      lateral,
      rim,
      scatterNormalizedRadius: clippedRadius,
    };
  });
}

// Numerical approximation from Abramowitz & Stegun 7.1.26.
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function makeSensitivity({
  theta,
  speed,
  sigmaTheta = rad(0.9),
  sigmaV = 0.045,
  court = DEFAULT_COURT,
} = {}) {
  const opt = brancazioOptimum(court);
  const th = theta ?? opt.theta;
  const v = speed ?? opt.speed;
  const J = landingJacobian(th, v, court);
  const a = J.depthTheta * sigmaTheta / court.w;
  const b = J.depthV * sigmaV / court.w;
  const norm = Math.hypot(a, b);
  const stiff = norm > 0 ? { angle: a / norm, speed: b / norm } : { angle: 0, speed: 1 };
  const nul = { angle: -stiff.speed, speed: stiff.angle };
  return {
    theta: th,
    speed: v,
    jacobian: J,
    angleLeverage: a,
    speedLeverage: b,
    matrix: [[a * a, a * b], [a * b, b * b]],
    lambdaStiff: a * a + b * b,
    lambdaNull: 0,
    stiffAxis: {
      ...stiff,
      angleFraction: Math.abs(stiff.angle),
      speedFraction: Math.abs(stiff.speed),
    },
    nullAxis: {
      ...nul,
      angleFraction: Math.abs(nul.angle),
      speedFraction: Math.abs(nul.speed),
    },
  };
}

export function heisenbergCurve({
  minDeg = 47,
  maxDeg = 57,
  steps = 181,
  court = DEFAULT_COURT,
} = {}) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const thetaDeg = minDeg + (maxDeg - minDeg) * i / (steps - 1);
    const th = rad(thetaDeg);
    const v = makeSpeed(th, court);
    const J = landingJacobian(th, v, court);
    const tolV = court.w / Math.max(1e-12, Math.abs(J.depthV));
    const tolTheta = court.w / Math.max(1e-12, Math.abs(J.depthTheta));
    out.push({ theta: th, thetaDeg, speed: v, U: tolV * tolTheta, tolV, tolTheta });
  }
  return out;
}

// --- KINETIC-CHAIN / WHIP RELEASE ------------------------------------------
// Planar (sagittal) rigid-chain toy model ported from
// 02-computation/scripts/kinematic_chain.py + fast.py.
//   Omega_i^abs = Σ_{j≤i} ω_j^rel      (distal segment inherits proximal rotation)
//   v_end = v_base + Σ_i Omega_i^abs (k̂ × R_i),   R_i = P_end − P_jointi
// Extension is clockwise in this convention, so absolute rates enter negated.
// ALL segment lengths / angular velocities are ILLUSTRATIVE toy values
// (Winter body-segment proportions); the model is rigid-body kinematics only —
// no muscle dynamics, no drag. Treat numbers as model-contingent.
export const ARM_LENGTHS = Object.freeze([0.33, 0.27, 0.19]); // upper arm, forearm, hand→ball

// Release pose: absolute segment angles [shoulder, elbow, wrist] in radians.
// Calibrated in Python (solve_pose_for_launch, target 52°) so the DEFAULT whip
// launches up-and-forward at ~52°. Held fixed while the user edits joint rates.
export const RELEASE_POSE = Object.freeze(
  [151.12141923, 146.12141923, 138.12141923].map((d) => d * Math.PI / 180),
);

export function armEndpoints(angles, lengths = ARM_LENGTHS) {
  const pts = [[0, 0]];
  for (let i = 0; i < lengths.length; i++) {
    const [x, y] = pts[pts.length - 1];
    pts.push([x + lengths[i] * Math.cos(angles[i]), y + lengths[i] * Math.sin(angles[i])]);
  }
  return pts;
}

export function cumulativeSum(values) {
  const out = [];
  let s = 0;
  for (const v of values) { s += v; out.push(s); }
  return out;
}

// Endpoint velocity from absolute segment angular rates: v = v_base + Σ Ω_i (k̂ × R_i).
export function endpointVelocity(angles, omegaAbs, base = [0, 0], lengths = ARM_LENGTHS) {
  const pts = armEndpoints(angles, lengths);
  const end = pts[pts.length - 1];
  let vx = base[0];
  let vy = base[1];
  for (let i = 0; i < lengths.length; i++) {
    const Rx = end[0] - pts[i][0];
    const Ry = end[1] - pts[i][1];
    vx += omegaAbs[i] * (-Ry); // k̂ × (Rx, Ry) = (−Ry, Rx)
    vy += omegaAbs[i] * (Rx);
  }
  return [vx, vy];
}

export function kineticChainRelease({
  omegaShoulder = 2.3,
  omegaElbow = 4.3,
  omegaWrist = 7.3,
  baseSpeed = 0,          // legs + trunk rotation along the launch line (m/s)
  launchLineDeg = 52,     // direction the base velocity is aimed
  pose = RELEASE_POSE,
} = {}) {
  const omegaRel = [omegaShoulder, omegaElbow, omegaWrist];
  const omegaAbs = cumulativeSum(omegaRel);
  const omegaSigned = omegaAbs.map((w) => -w); // clockwise extension
  const lineRad = rad(launchLineDeg);
  const base = [baseSpeed * Math.cos(lineRad), baseSpeed * Math.sin(lineRad)];
  const v = endpointVelocity(pose, omegaSigned, base);
  const speed = Math.hypot(v[0], v[1]);
  const launchAngle = Math.atan2(v[1], Math.abs(v[0])); // up-forward angle from horizontal

  // Per-joint contribution + cumulative "summation of speed" (proximal→distal).
  const pts = armEndpoints(pose);
  const end = pts[pts.length - 1];
  const contributions = [];
  const cumulative = [];
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < omegaRel.length; i++) {
    const Rx = end[0] - pts[i][0];
    const Ry = end[1] - pts[i][1];
    const cvx = omegaSigned[i] * (-Ry);
    const cvy = omegaSigned[i] * (Rx);
    contributions.push(Math.hypot(cvx, cvy));
    cx += cvx;
    cy += cvy;
    cumulative.push(Math.hypot(cx, cy)); // arm-only cumulative speed (no base)
  }

  return {
    velocity: v,
    speed,
    launchAngle,
    launchAngleDeg: deg(launchAngle),
    omegaRel,
    omegaAbs,
    contributions,
    cumulativeSpeed: cumulative,
    points: pts,
    baseSpeed,
  };
}

export function coachingSentence(result) {
  const base = result.gaussianMakeProbability;
  const speedCut = simulateNoiseExperiment({
    theta: result.theta,
    speed: result.speed,
    sigmaTheta: result.sigmaTheta,
    sigmaV: result.sigmaV * 0.8,
    n: 3000,
    seed: 99,
    court: result.court,
  }).gaussianMakeProbability;
  const angleCut = simulateNoiseExperiment({
    theta: result.theta,
    speed: result.speed,
    sigmaTheta: result.sigmaTheta * 0.8,
    sigmaV: result.sigmaV,
    n: 3000,
    seed: 99,
    court: result.court,
  }).gaussianMakeProbability;
  return speedCut - base >= angleCut - base
    ? `Train release-speed consistency first: -20% σv moves make probability about ${Math.round((speedCut - base) * 1000) / 10} pts.`
    : `Angle noise dominates here: -20% σθ moves make probability about ${Math.round((angleCut - base) * 1000) / 10} pts.`;
}

// --- GUIDED DEMO / PRESET STORY PATH ---------------------------------------
// A 30-second guided story laid over the existing stations:
//   build speed (whip) → contrast (wrist alone) → break the force-line (drift)
//   → add game pressure (noise) → show the optimizer (eigen).
// The UI labels/captions live in lab_app.mjs, but the PHYSICS NUMBERS live here
// so every beat's claim — "this one swishes", "this one airballs", "this drifts
// out the side", "pressure halves P(make)" — is pinned by lab_physics.test.mjs
// exactly like every other headline number in this lab. Court defaults to the
// Curry free throw (h = 2.20 m, d = 4.20 m). Aim presets sit on the Brancazio
// optimum so the ONLY thing a beat changes is its single demonstrated variable.
export const DEMO_PRESET_PHYSICS = Object.freeze({
  swish:    { station: 'whip',  court: { h: 2.20, d: 4.20 }, whip: { omegaShoulder: 1.85, omegaElbow: 3.50, omegaWrist: 5.90, baseSpeed: 1.10 } },
  wrist:    { station: 'whip',  court: { h: 2.20, d: 4.20 }, whip: { omegaShoulder: 0,    omegaElbow: 0,    omegaWrist: 16.0, baseSpeed: 0 } },
  drift:    { station: 'force', court: { h: 2.20, d: 4.20 }, vLat: -0.14 },
  pressure: { station: 'noise', court: { h: 2.20, d: 4.20 }, sigmaV: 0.13, sigmaThetaDeg: 3.0 },
  eigen:    { station: 'eigen', court: { h: 2.20, d: 4.20 }, sigmaV: 0.045, sigmaThetaDeg: 0.9 },
});

export const DEMO_PRESET_ORDER = Object.freeze(['swish', 'wrist', 'drift', 'pressure', 'eigen']);

export const COLD_OPEN_DEMO = Object.freeze({
  preset: 'swish',
  firstGesture: Object.freeze({
    control: 'shoulder',
    label: 'drag shoulder ↓',
    revealAfterMs: 1900,
    dismissOnFirstAction: true,
  }),
});

// Pure (no-DOM) resolution of a preset to the physics outcome its caption claims
// and the test asserts. Aim presets ride the Brancazio optimum; the whip presets
// BUILD their release from joint rates, so θ/speed are outputs, not inputs.
export function resolveDemoPreset(key) {
  const p = DEMO_PRESET_PHYSICS[key];
  if (!p) throw new Error(`unknown demo preset: ${key}`);
  const court = courtWith(p.court || {});
  if (p.station === 'whip') {
    const whip = kineticChainRelease(p.whip);
    const depth = depthAtRim(whip.launchAngle, whip.speed, court);
    const rim = rimAcceptance({ depth, lateral: 0, court });
    const reaches = Number.isFinite(depth);
    return {
      key, station: p.station, court, whip,
      theta: whip.launchAngle, speed: whip.speed, depth, rim, reaches,
      makeByDepth: reaches && rim.make,
      makeByRim: reaches && rim.make,
    };
  }
  const opt = brancazioOptimum(court);
  const sigmaV = p.sigmaV ?? 0.045;
  const sigmaTheta = rad(p.sigmaThetaDeg ?? 0.9);
  const vLat = p.vLat ?? 0;
  const lat = lateralExperiment({ theta: opt.theta, speed: opt.speed, vLat, court });
  const noise = simulateNoiseExperiment({ theta: opt.theta, speed: opt.speed, sigmaV, sigmaTheta, court, n: 1200, seed: 42 });
  const sens = makeSensitivity({ theta: opt.theta, speed: opt.speed, sigmaV, sigmaTheta, court });
  return {
    key, station: p.station, court,
    theta: opt.theta, speed: opt.speed, vLat, sigmaV, sigmaTheta,
    lateralAtRim: lat.lateralAtRim, makeByLateral: lat.makeByLateral,
    rim: lat.rim,
    makeByRim: lat.rim.make,
    gaussianMakeProbability: noise.gaussianMakeProbability,
    stiffSpeedFraction: sens.stiffAxis.speedFraction,
  };
}

export function resolveColdOpenDemo() {
  const resolved = resolveDemoPreset(COLD_OPEN_DEMO.preset);
  return {
    ...resolved,
    firstGesture: COLD_OPEN_DEMO.firstGesture,
  };
}

// --- FORM / BACKSPIN / FORCE CHAIN ------------------------------------------
// Form modes are deliberately not "simulated players." They are named ways of
// connecting a visible slider state to what a human would change: ground reaction
// → shoulder/elbow/wrist → fingers/backspin → ball. Backspin is a visual/toy cue
// for this prototype; it is not injected into the projectile trajectory.

export const FORM_MODES = Object.freeze({
  chain: Object.freeze({
    label: 'Ground-up chain',
    station: 'form',
    court: Object.freeze({ h: 2.20, d: 4.20 }),
    whip: Object.freeze({ omegaShoulder: 1.85, omegaElbow: 3.50, omegaWrist: 5.90, baseSpeed: 1.10 }),
    backspinRpm: 190,
  }),
  flat: Object.freeze({
    label: 'Flat palm push',
    station: 'form',
    court: Object.freeze({ h: 2.20, d: 4.20 }),
    whip: Object.freeze({ omegaShoulder: 2.20, omegaElbow: 3.00, omegaWrist: 1.30, baseSpeed: 0.55 }),
    backspinRpm: 55,
  }),
  flick: Object.freeze({
    label: 'Wrist flick only',
    station: 'form',
    court: Object.freeze({ h: 2.20, d: 4.20 }),
    whip: Object.freeze({ omegaShoulder: 0.10, omegaElbow: 0.20, omegaWrist: 14.0, baseSpeed: 0.00 }),
    backspinRpm: 260,
  }),
  cmuFreeThrow: Object.freeze({
    label: 'CMU free throw trace',
    station: 'form',
    court: Object.freeze({ h: 2.20, d: 4.20 }),
    // Trace-informed toy release: the sliders remain an interpretable release
    // model, while the right panel shows the measured CMU joint-angle timing.
    whip: Object.freeze({ omegaShoulder: 1.65, omegaElbow: 3.75, omegaWrist: 5.35, baseSpeed: 0.82 }),
    backspinRpm: 185,
    trace: CMU_124_FREE_THROW_TRACE,
  }),
});

export const FORM_MODE_ORDER = Object.freeze(['chain', 'flat', 'flick', 'cmuFreeThrow']);

export function formForceProfile({
  omegaShoulder = 1.85,
  omegaElbow = 3.50,
  omegaWrist = 5.90,
  baseSpeed = 1.10,
  backspinRpm = 190,
  trace = null,
  court = DEFAULT_COURT,
} = {}) {
  const whip = kineticChainRelease({ omegaShoulder, omegaElbow, omegaWrist, baseSpeed });
  const armSpeed = Math.max(whip.cumulativeSpeed[2], 1e-9);
  const shoulderShare = clamp(whip.cumulativeSpeed[0] / armSpeed, 0, 1);
  const elbowShare = clamp((whip.cumulativeSpeed[1] - whip.cumulativeSpeed[0]) / armSpeed, 0, 1);
  const wristShare = clamp((whip.cumulativeSpeed[2] - whip.cumulativeSpeed[1]) / armSpeed, 0, 1);
  const groundShare = clamp(baseSpeed / Math.max(whip.speed, 1e-9), 0, 1);

  const ballRadius = court.ballDiameter / 2;
  const spinRadPerSec = backspinRpm * 2 * Math.PI / 60;
  const spinRatio = spinRadPerSec * ballRadius / Math.max(whip.speed, 1e-6);
  const liftCue = clamp(spinRatio * 0.42, 0, 0.22);

  let primaryCue = trace
    ? `CMU ${trace.source.motion} ${trace.source.label}: real mocap timing is driving this comparison; keep the projectile outcome separate from the measured body trace.`
    : 'ground-up chain: start from the floor, let shoulder→elbow feed the wrist, then finish through the fingers.';
  if (!trace && backspinRpm < 100) {
    primaryCue = 'finish through the fingers: add clean backspin instead of pushing the ball flat off the palm.';
  } else if (!trace && wristShare > 0.58 && groundShare < 0.08) {
    primaryCue = 'do not flick from the wrist alone: rebuild the chain from legs/shoulder/elbow before the finger finish.';
  } else if (!trace && groundShare < 0.10) {
    primaryCue = 'add ground-up base speed: the shot should start at the floor, not only at the arm.';
  }

  const forcePath = [
    { joint: 'ground', label: 'ground reaction', share: groundShare, form: 'push floor softly upward/forward' },
    ...(trace ? [{ joint: 'mocap', label: `${trace.source.motion} body trace`, share: 1, form: `${trace.frames} CMU frames: knee→shoulder→elbow→wrist timing` }] : []),
    { joint: 'shoulder', label: 'shoulder lift', share: shoulderShare, form: 'upper arm lifts the release pocket' },
    { joint: 'elbow', label: 'elbow extension', share: elbowShare, form: 'forearm extends along the force-line' },
    { joint: 'wrist', label: 'wrist snap', share: wristShare, form: 'wrist transfers inherited speed, not a solo push' },
    { joint: 'fingers', label: 'finger roll / backspin', share: clamp(backspinRpm / 260, 0, 1), form: 'last contact rolls through index/middle fingers' },
    { joint: 'ball', label: 'ball force + spin', share: clamp(whip.speed / 8.5, 0, 1), form: 'release speed + spin become the visible trajectory' },
  ];

  return {
    whip,
    backspinRpm,
    spinRadPerSec,
    spinRatio,
    liftCue,
    liftModel: 'visual-toy, not injected into projectile trajectory',
    trace,
    jointShares: Object.freeze({ ground: groundShare, shoulder: shoulderShare, elbow: elbowShare, wrist: wristShare }),
    primaryCue,
    forcePath: Object.freeze(forcePath),
  };
}

export function resolveFormMode(key) {
  const p = FORM_MODES[key];
  if (!p) throw new Error(`unknown form mode: ${key}`);
  const court = courtWith(p.court || {});
  const profile = formForceProfile({ ...p.whip, backspinRpm: p.backspinRpm, trace: p.trace || null, court });
  const depth = depthAtRim(profile.whip.launchAngle, profile.whip.speed, court);
  const rim = rimAcceptance({ depth, lateral: 0, court });
  const reaches = Number.isFinite(depth);
  return {
    key,
    label: p.label,
    station: p.station,
    court,
    theta: profile.whip.launchAngle,
    speed: profile.whip.speed,
    depth,
    rim,
    reaches,
    makeByDepth: reaches && rim.make,
    makeByRim: reaches && rim.make,
    profile,
  };
}
