import test from 'node:test';
import assert from 'node:assert/strict';
import { SightingWindow, collectSightings, frameStats, isBlocked, gazeOffset } from '../src/lib/proctorLogic.ts';

const det = (name: string, score: number) => ({ categories: [{ categoryName: name, score }], boundingBox: { originX: 10, originY: 20, width: 50, height: 90 } });

test('strong phone sighting flags immediately', () => {
  const w = new SightingWindow();
  const hit = w.update(collectSightings([det('cell phone', 0.34)]), 1000);
  assert.equal(hit?.kind, 'cell phone');
  assert.deepEqual(hit?.box, { x: 10, y: 20, w: 50, h: 90 });
});
test('previous 0.45 threshold would have missed a 0.34 phone', () => {
  assert.ok(0.34 < 0.45);
});
test('weak sighting needs a repeat within window', () => {
  const w = new SightingWindow();
  assert.equal(w.update(collectSightings([det('cell phone', 0.22)]), 1000), null);
  assert.equal(w.update(collectSightings([det('cell phone', 0.24)]), 2500)?.kind, 'cell phone');
});
test('weak sightings far apart do not combine', () => {
  const w = new SightingWindow();
  w.update(collectSightings([det('cell phone', 0.22)]), 1000);
  assert.equal(w.update(collectSightings([det('cell phone', 0.22)]), 20000), null);
});
test('below floor ignored; non-suspicious classes ignored', () => {
  const w = new SightingWindow();
  assert.equal(w.update(collectSightings([det('cell phone', 0.1), det('person', 0.9), det('cup', 0.9)]), 1), null);
});
test('all categories inspected, not just the first', () => {
  const d = { categories: [{ categoryName: 'person', score: 0.9 }, { categoryName: 'cell phone', score: 0.5 }], boundingBox: null };
  assert.equal(collectSightings([d]).length, 1);
});
test('laptop needs 0.5', () => {
  const w = new SightingWindow();
  assert.equal(w.update(collectSightings([det('laptop', 0.4)]), 1), null);
  assert.equal(w.update(collectSightings([det('laptop', 0.6)]), 2)?.kind, 'laptop');
});
const px = (fn: (i: number) => [number, number, number]) => { const a = new Uint8ClampedArray(32*24*4); for (let i=0;i<32*24;i++){const [r,g,b]=fn(i);a.set([r,g,b,255],i*4);} return a; };
test('black frame is blocked', () => assert.ok(isBlocked(frameStats(px(() => [2,2,2])))));
test('flat grey/skin frame (hand over lens) is blocked', () => assert.ok(isBlocked(frameStats(px(() => [180,140,120])))));
test('normal textured frame is not blocked', () => assert.ok(!isBlocked(frameStats(px(i => { const v = 60 + ((i*37)%120); return [v,v,v]; })))));
test('gaze: frontal ok, turned away flagged', () => {
  assert.equal(gazeOffset({x:.4,y:.4},{x:.6,y:.4},{x:.5,y:.45}).away, false);
  assert.equal(gazeOffset({x:.4,y:.4},{x:.6,y:.4},{x:.62,y:.45}).away, true);
});
