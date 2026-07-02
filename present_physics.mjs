// present_physics.mjs — air (drag + Magnus) overlay for the presentation page.
// Pure functions, node-testable. The tested no-drag core in ../lab_physics.mjs
// stays the source of truth for verdicts and the landing cloud; this module only
// computes the labeled "with air" comparison trajectory.

import { DEFAULT_COURT, rad } from './lab_physics.mjs';

export const BALL = Object.freeze({
  mass: 0.624,            // kg, size-7 basketball
  radius: 0.1194,         // m
  area: Math.PI * 0.1194 * 0.1194, // ~0.0448 m^2
  rhoAir: 1.225,          // kg/m^3
  Cd: 0.47,               // sphere drag coefficient
});

// Lift coefficient from spin factor S = R*omega/|v|.
// Bilinear fit C_L = 0.09 + 0.6·S (Sawicki/Nathan, baseball data covering the
// free-throw range S = 0.22-0.33; no basketball-specific C_L measurement
// exists). Gives Magnus ~5-6% of gravity at 3 Hz, 7 m/s. Ramped to zero below
// S = 0.05 where the fit is not valid.
export function liftCoefficient(spinOmega, speed) {
  if (!(speed > 0.01) || !(spinOmega > 0)) return 0;
  const S = BALL.radius * spinOmega / speed;
  const cl = Math.min(0.09 + 0.6 * S, 0.45);
  return cl * Math.min(1, S / 0.05);
}

export function airForces({ vx, vy, spinOmega }) {
  const speed = Math.hypot(vx, vy);
  if (speed < 1e-9) return { fx: 0, fy: 0 };
  const q = 0.5 * BALL.rhoAir * BALL.area * speed * speed;
  // Drag: opposite to velocity.
  const fdx = -q * BALL.Cd * vx / speed;
  const fdy = -q * BALL.Cd * vy / speed;
  // Magnus with backspin axis out of the shooting plane (+z when x is forward):
  // direction = unit(omega × v) = (-vy, vx)/|v|. Lifts while moving forward.
  const cl = liftCoefficient(spinOmega, speed);
  const fmx = q * cl * (-vy) / speed;
  const fmy = q * cl * (vx) / speed;
  return { fx: fdx + fmx, fy: fdy + fmy };
}

// Integrate the shot with drag + Magnus (RK4, dt=1/480 s).
// Returns points [{t, x, y, vx, vy}] until the ball falls below floor or 3.4 s.
export function airTrajectory({ thetaDeg, speed, backspinRpm = 0, court = DEFAULT_COURT }) {
  const theta = rad(thetaDeg);
  const spinOmega = backspinRpm * 2 * Math.PI / 60;
  const g = court.g;
  const dt = 1 / 480;
  let x = 0, y = court.h;
  let vx = speed * Math.cos(theta), vy = speed * Math.sin(theta);
  const pts = [{ t: 0, x, y, vx, vy }];
  const accel = (state) => {
    const { fx, fy } = airForces({ vx: state.vx, vy: state.vy, spinOmega });
    return { ax: fx / BALL.mass, ay: fy / BALL.mass - g };
  };
  for (let i = 1; i * dt <= 3.4; i++) {
    const s1 = { vx, vy };
    const a1 = accel(s1);
    const s2 = { vx: vx + a1.ax * dt / 2, vy: vy + a1.ay * dt / 2 };
    const a2 = accel(s2);
    const s3 = { vx: vx + a2.ax * dt / 2, vy: vy + a2.ay * dt / 2 };
    const a3 = accel(s3);
    const s4 = { vx: vx + a3.ax * dt, vy: vy + a3.ay * dt };
    const a4 = accel(s4);
    x += (s1.vx + 2 * s2.vx + 2 * s3.vx + s4.vx) * dt / 6;
    y += (s1.vy + 2 * s2.vy + 2 * s3.vy + s4.vy) * dt / 6;
    vx += (a1.ax + 2 * a2.ax + 2 * a3.ax + a4.ax) * dt / 6;
    vy += (a1.ay + 2 * a2.ay + 2 * a3.ay + a4.ay) * dt / 6;
    pts.push({ t: i * dt, x, y, vx, vy });
    if (y < -0.05 && vy < 0) break;
  }
  return pts;
}

// Where the air trajectory crosses the rim plane (y = H) on the way down.
// Returns { x, t, entryAngleDeg, vx, vy } or null if it never reaches the plane.
export function airRimCrossing(points, court = DEFAULT_COURT) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.vy < 0 || b.vy < 0) {
      if (a.y >= court.H && b.y < court.H) {
        const f = (a.y - court.H) / (a.y - b.y);
        const x = a.x + f * (b.x - a.x);
        const t = a.t + f * (b.t - a.t);
        const vx = a.vx + f * (b.vx - a.vx);
        const vy = a.vy + f * (b.vy - a.vy);
        return { x, t, vx, vy, entryAngleDeg: Math.atan2(-vy, vx) * 180 / Math.PI };
      }
    }
  }
  return null;
}

// Force-scale summary for the readout: |drag|/mg and |Magnus|/mg at release.
export function forceScales({ thetaDeg, speed, backspinRpm, court = DEFAULT_COURT }) {
  const theta = rad(thetaDeg);
  const spinOmega = backspinRpm * 2 * Math.PI / 60;
  const vx = speed * Math.cos(theta), vy = speed * Math.sin(theta);
  const q = 0.5 * BALL.rhoAir * BALL.area * speed * speed;
  const drag = q * BALL.Cd;
  const magnus = q * liftCoefficient(spinOmega, speed);
  const mg = BALL.mass * court.g;
  return { dragOverMg: drag / mg, magnusOverMg: magnus / mg };
}
