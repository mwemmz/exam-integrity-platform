// Pure decision logic for the proctoring engine. Kept free of DOM / MediaPipe imports so it can be unit tested in Node.

export interface DetectedBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface Suspicious {
    kind: string;
    score: number;
    box: DetectedBox | null;
}

// Objects that should not be in front of a student during an exam, with the minimum
// confidence at which a single sighting is trusted. Phones are often labelled "remote" by
// small object models, so both are watched. Lower than the previous 0.45 on purpose:
// a phone held at an angle or close to the lens rarely scores that high.
export const SUSPICIOUS_MIN_SCORE: Record<string, number> = {
    'cell phone': 0.3,
    remote: 0.35,
    laptop: 0.5,
    book: 0.5,
    tv: 0.6
};

// A weaker sighting (above this floor) is accepted if it is repeated within the corroboration window.
export const WEAK_FLOOR = 0.2;
export const CORROBORATION_WINDOW_MS = 8000;

export function boxOf(d: any): DetectedBox | null {
    const b = d && d.boundingBox;
    if (!b || typeof b.originX !== 'number') return null;
    return { x: b.originX, y: b.originY, w: b.width, h: b.height };
}

/** Every category of every detection is inspected (not just the top-ranked one). */
export function collectSightings(detections: any[]): Suspicious[] {
    const out: Suspicious[] = [];
    for (const d of detections || []) {
        for (const c of (d && d.categories) || []) {
            const name = c && c.categoryName;
            if (!name || !(name in SUSPICIOUS_MIN_SCORE)) continue;
            out.push({ kind: name, score: Number(c.score) || 0, box: boxOf(d) });
        }
    }
    return out;
}

/**
 * Remembers recent weak sightings so that two low-confidence hits in a row count,
 * while a single strong hit counts immediately.
 */
export class SightingWindow {
    private weak: { kind: string; at: number; score: number; box: DetectedBox | null }[] = [];

    /** Returns the sighting to flag, or null. */
    update(sightings: Suspicious[], now: number): Suspicious | null {
        this.weak = this.weak.filter(w => now - w.at <= CORROBORATION_WINDOW_MS);
        let best: Suspicious | null = null;
        for (const s of sightings) {
            const strong = s.score >= SUSPICIOUS_MIN_SCORE[s.kind];
            if (strong) {
                if (!best || s.score > best.score) best = s;
            } else if (s.score >= WEAK_FLOOR) {
                const repeated = this.weak.some(w => w.kind === s.kind);
                this.weak.push({ kind: s.kind, at: now, score: s.score, box: s.box });
                if (repeated && (!best || s.score > best.score)) best = s;
            }
        }
        return best;
    }
}

export interface FrameStats {
    mean: number; // 0-255 average luma
    std: number; // luma standard deviation (flat/covered frames are near zero)
}

/** `rgba` is the pixel buffer of a small downscaled frame. */
export function frameStats(rgba: ArrayLike<number>): FrameStats {
    const n = Math.floor(rgba.length / 4);
    if (!n) return { mean: 0, std: 0 };
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
        const l = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
        sum += l;
        sumSq += l * l;
    }
    const mean = sum / n;
    const variance = Math.max(0, sumSq / n - mean * mean);
    return { mean, std: Math.sqrt(variance) };
}

/** A frame is "blocked" when it is almost black or almost one flat colour (hand, paper, tape, lens cap). */
export function isBlocked(s: FrameStats): boolean {
    return s.mean < 18 || s.std < 10;
}

/** Head-pose heuristic from face keypoints (normalised 0..1 coordinates). Two consecutive hits are required by the caller. */
export function gazeOffset(rightEye: { x: number; y: number }, leftEye: { x: number; y: number }, nose: { x: number; y: number }) {
    const dx = nose.x - (rightEye.x + leftEye.x) / 2;
    const dz = Math.abs(nose.y - (rightEye.y + leftEye.y) / 2);
    return { dx, dz, away: Math.abs(dx) > 0.07 || dz > 0.09 };
}

// ---------------------------------------------------------------------------
// YOLO11n (COCO) output decoding. The ONNX model takes a [1,3,H,W] RGB tensor scaled to 0..1 and returns
// [1, 84, anchors]: rows 0-3 are the box centre/size in input pixels, rows 4-83 are the 80 class scores.
// ---------------------------------------------------------------------------

export const YOLO_WATCHED: Record<number, string> = {
    62: 'tv',
    63: 'laptop',
    65: 'remote',
    67: 'cell phone',
    73: 'book'
};

/** Input size for the detector: 640 wide, height rounded to a multiple of 32 (the network's stride). */
export function yoloInputSize(videoW: number, videoH: number, width = 640): { w: number; h: number } {
    const ratio = videoW > 0 ? videoH / videoW : 0.75;
    const h = Math.max(32, Math.round((width * ratio) / 32) * 32);
    return { w: width, h };
}

function iou(a: DetectedBox, b: DetectedBox): number {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = a.w * a.h + b.w * b.h - inter;
    return union > 0 ? inter / union : 0;
}

/**
 * Turns raw YOLO output into MediaPipe-shaped detections ({ categories, boundingBox }) for the watched classes only,
 * with per-class non-maximum suppression. `sx`/`sy` scale input-pixel boxes back to video pixels.
 */
export function decodeYolo(output: ArrayLike<number>, anchors: number, minScore: number, sx: number, sy: number, classes: Record<number, string> = YOLO_WATCHED): any[] {
    const found: { cls: string; score: number; box: DetectedBox }[] = [];
    for (const idxStr of Object.keys(classes)) {
        const idx = Number(idxStr);
        const row = (4 + idx) * anchors;
        for (let i = 0; i < anchors; i++) {
            const score = output[row + i];
            if (score < minScore) continue;
            const cx = output[i];
            const cy = output[anchors + i];
            const w = output[2 * anchors + i];
            const h = output[3 * anchors + i];
            found.push({
                cls: classes[idx],
                score,
                box: { x: (cx - w / 2) * sx, y: (cy - h / 2) * sy, w: w * sx, h: h * sy }
            });
        }
    }
    found.sort((a, b) => b.score - a.score);
    const kept: typeof found = [];
    for (const f of found) {
        if (kept.some(k => k.cls === f.cls && iou(k.box, f.box) > 0.5)) continue;
        kept.push(f);
        if (kept.length >= 20) break;
    }
    return kept.map(k => ({
        categories: [{ categoryName: k.cls, score: k.score }],
        boundingBox: { originX: k.box.x, originY: k.box.y, width: k.box.w, height: k.box.h }
    }));
}
