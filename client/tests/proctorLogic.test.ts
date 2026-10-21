import test from 'node:test';
import assert from 'node:assert/strict';
import { SightingWindow, collectSightings, frameStats, isBlocked, gazeOffset, decodeYolo, yoloInputSize } from '../src/lib/proctorLogic.ts';

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

// YOLO tensor layout is [84, anchors] channel-major: rows 0-3 box (cx,cy,w,h), rows 4.. class scores.
function tensor(anchors: number, items: { a: number; cls: number; score: number; box: [number, number, number, number] }[]) {
  const t = new Float32Array(84 * anchors);
  for (const it of items) {
    t[it.a] = it.box[0]; t[anchors + it.a] = it.box[1]; t[2 * anchors + it.a] = it.box[2]; t[3 * anchors + it.a] = it.box[3];
    t[(4 + it.cls) * anchors + it.a] = it.score;
  }
  return t;
}
test('decodeYolo returns watched classes in MediaPipe shape with scaled boxes', () => {
  const t = tensor(3, [{ a: 0, cls: 67, score: 0.8, box: [320, 240, 100, 200] }]);
  const d = decodeYolo(t, 3, 0.15, 2, 2);
  assert.equal(d.length, 1);
  assert.equal(d[0].categories[0].categoryName, 'cell phone');
  assert.deepEqual(d[0].boundingBox, { originX: 540, originY: 280, width: 200, height: 400 });
});
test('decodeYolo suppresses duplicates, ignores low scores and unwatched classes', () => {
  const t = tensor(4, [
    { a: 0, cls: 67, score: 0.8, box: [100, 100, 50, 80] },
    { a: 1, cls: 67, score: 0.6, box: [102, 101, 50, 80] }, // overlapping duplicate
    { a: 2, cls: 73, score: 0.1, box: [300, 300, 60, 60] }, // below min score
    { a: 3, cls: 0, score: 0.95, box: [200, 200, 60, 160] } // person: not watched
  ]);
  const d = decodeYolo(t, 4, 0.15, 1, 1);
  assert.equal(d.length, 1);
  assert.equal(d[0].categories[0].score.toFixed(1), '0.8');
});
test('decoded phone feeds the sighting logic', () => {
  const t = tensor(1, [{ a: 0, cls: 67, score: 0.41, box: [100, 100, 40, 70] }]);
  const hit = new SightingWindow().update(collectSightings(decodeYolo(t, 1, 0.15, 1, 1)), 0);
  assert.equal(hit?.kind, 'cell phone');
});
test('yolo input keeps aspect, multiple of 32', () => {
  assert.deepEqual(yoloInputSize(640, 480), { w: 640, h: 480 });
  assert.deepEqual(yoloInputSize(1280, 720), { w: 640, h: 352 });
});
