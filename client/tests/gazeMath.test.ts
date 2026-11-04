import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFeatures, buildCalibration, classifyGaze, AwayTimer, DEFAULT_CALIBRATION } from '../src/lib/gazeMath.ts';

// Synthetic face: right cheek x=.3, left cheek x=.7, forehead y=.2, chin y=.8; eyes 0.1 wide, 0.03 open.
function face(o: { yaw?: number; pitch?: number; ih?: number; iv?: number; open?: number } = {}) {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const set = (i: number, x: number, y: number) => { lm[i] = { x, y }; };
  set(234, 0.3, 0.5); set(454, 0.7, 0.5); set(10, 0.5, 0.2); set(152, 0.5, 0.8);
  set(1, 0.5 + (o.yaw ?? 0) * 0.4, 0.5 + (o.pitch ?? 0) * 0.6);
  const open = o.open ?? 0.04;
  // right eye (image left): outer 33 at .38, inner 133 at .48
  set(33, 0.38, 0.4); set(133, 0.48, 0.4); set(159, 0.43, 0.4 - open / 2); set(145, 0.43, 0.4 + open / 2);
  set(468, 0.38 + (0.5 + (o.ih ?? 0)) * 0.1, 0.4 - open / 2 + (0.5 + (o.iv ?? 0)) * open);
  // left eye: outer 263 at .62, inner 362 at .52
  set(263, 0.62, 0.4); set(362, 0.52, 0.4); set(386, 0.57, 0.4 - open / 2); set(374, 0.57, 0.4 + open / 2);
  set(473, 0.62 - (0.5 + (o.ih ?? 0)) * 0.1, 0.4 - open / 2 + (0.5 + (o.iv ?? 0)) * open);
  return lm;
}

test('frontal face gives neutral features', () => {
  const f = extractFeatures(face())!;
  for (const k of ['yaw', 'pitch', 'irisH', 'irisV'] as const) assert.ok(Math.abs(f[k]) < 0.01, `${k}=${f[k]}`);
});
test('blink or missing landmarks give null', () => {
  assert.equal(extractFeatures(face({ open: 0.001 })), null);
  assert.equal(extractFeatures(null), null);
  assert.equal(extractFeatures([]), null);
});
test('uncalibrated: frontal is fine, head turned and eyes far aside are away', () => {
  const cal = DEFAULT_CALIBRATION;
  assert.equal(classifyGaze(extractFeatures(face())!, cal).away, false);
  assert.equal(classifyGaze(extractFeatures(face({ yaw: 0.3 }))!, cal).reason, 'head');
  assert.equal(classifyGaze(extractFeatures(face({ ih: 0.3 }))!, cal).reason, 'eyes');
  assert.equal(classifyGaze(extractFeatures(face({ pitch: 0.3 }))!, cal).reason, 'down');
});
test('calibration widens limits for a student who moves a lot and keeps them tight for one who does not', () => {
  const F = (o: any) => extractFeatures(face(o))!;
  const still = buildCalibration([F({}), F({}), F({})], [[F({ yaw: .05 }), F({ yaw: .05 }), F({ yaw: .05 })], [F({ yaw: -.05 }), F({ yaw: -.05 }), F({ yaw: -.05 })]])!;
  const mover = buildCalibration([F({}), F({}), F({})], [[F({ yaw: .2 }), F({ yaw: .2 }), F({ yaw: .2 })], [F({ yaw: -.2 }), F({ yaw: -.2 }), F({ yaw: -.2 })]])!;
  assert.ok(still.calibrated);
  assert.equal(classifyGaze(F({ yaw: 0.15 }), still).away, true);
  assert.equal(classifyGaze(F({ yaw: 0.15 }), mover).away, false);
  assert.equal(classifyGaze(F({ yaw: 0.45 }), mover).away, true);
});
test('calibration needs enough data', () => {
  const f = extractFeatures(face())!;
  assert.equal(buildCalibration([f], [[f, f, f], [f, f, f]]), null);
  assert.equal(buildCalibration([f, f, f], [[f, f, f]]), null);
});
test('away must be sustained, blinks do not reset it, and repeats are throttled', () => {
  const t = new AwayTimer(3000, 20000);
  assert.equal(t.update(true, 0), false);
  assert.equal(t.update(true, 2000), false);
  assert.equal(t.update(null, 2500), false);
  assert.equal(t.update(true, 3100), true);
  assert.equal(t.update(true, 6000), false);
  assert.equal(t.update(false, 7000), false);
  assert.equal(t.update(true, 8000), false);
  assert.equal(t.update(true, 24000), true);
});
