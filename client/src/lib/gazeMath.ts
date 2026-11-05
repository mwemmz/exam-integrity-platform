// Gaze estimation from FaceMesh landmarks (478 points with iris, normalised 0..1 image coordinates).
// Pure functions so they can be unit tested without a camera.

export interface Pt { x: number; y: number; z?: number }

/** What the face is doing in one frame. yaw/pitch are head-turn proxies, irisH/irisV the iris position inside the eye. */
export interface GazeFeatures { yaw: number; pitch: number; irisH: number; irisV: number }

export interface GazeCalibration {
    centre: GazeFeatures;
    /** Largest deviation seen while the student looked at the screen edges (always positive). */
    extent: GazeFeatures;
    calibrated: boolean;
}

// FaceMesh landmark indices.
const R_OUTER = 33, R_INNER = 133, R_TOP = 159, R_BOTTOM = 145, R_IRIS = 468;
const L_OUTER = 263, L_INNER = 362, L_TOP = 386, L_BOTTOM = 374, L_IRIS = 473;
const NOSE = 1, CHEEK_R = 234, CHEEK_L = 454, FOREHEAD = 10, CHIN = 152;

/** Iris position within one eye: 0..1 across (corner to corner) and 0..1 down (lid to lid). */
function eyeRatio(lm: Pt[], outer: number, inner: number, top: number, bottom: number, iris: number) {
    const w = inner === outer ? 1 : lm[inner].x - lm[outer].x;
    const h = lm[bottom].y - lm[top].y;
    return {
        h: Math.abs(w) < 1e-6 ? 0.5 : (lm[iris].x - lm[outer].x) / w,
        v: Math.abs(h) < 1e-6 ? 0.5 : (lm[iris].y - lm[top].y) / h,
        open: Math.abs(h) / Math.max(1e-6, Math.abs(w))
    };
}

/** Returns null when the landmarks are unusable (too few points, eyes closed, face too small). */
export function extractFeatures(lm: Pt[] | undefined | null): GazeFeatures | null {
    if (!lm || lm.length < 478) return null;
    const r = eyeRatio(lm, R_OUTER, R_INNER, R_TOP, R_BOTTOM, R_IRIS);
    const l = eyeRatio(lm, L_OUTER, L_INNER, L_TOP, L_BOTTOM, L_IRIS);
    // Blink or eyes shut: the iris is hidden, so the eye ratios mean nothing.
    if (r.open < 0.12 || l.open < 0.12) return null;
    const faceW = lm[CHEEK_L].x - lm[CHEEK_R].x;
    const faceH = lm[CHIN].y - lm[FOREHEAD].y;
    if (Math.abs(faceW) < 0.05 || faceH < 0.05) return null;
    return {
        yaw: (lm[NOSE].x - lm[CHEEK_R].x) / faceW - 0.5,
        pitch: (lm[NOSE].y - lm[FOREHEAD].y) / faceH - 0.5,
        irisH: (r.h + l.h) / 2 - 0.5,
        irisV: (r.v + l.v) / 2 - 0.5
    };
}

/** Used when the student skips calibration: wide, conservative limits so only obvious looking-away counts. */
export const DEFAULT_CALIBRATION: GazeCalibration = {
    centre: { yaw: 0, pitch: 0, irisH: 0, irisV: 0 },
    extent: { yaw: 0.12, pitch: 0.12, irisH: 0.1, irisV: 0.1 },
    calibrated: false
};

const FLOOR: GazeFeatures = { yaw: 0.05, pitch: 0.05, irisH: 0.04, irisV: 0.04 };
/** How far past the screen edge a student may look before it counts as away (1 = exactly the edge). */
export const EDGE_MARGIN = 1.5;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

function meanFeatures(fs: GazeFeatures[]): GazeFeatures {
    return { yaw: mean(fs.map(f => f.yaw)), pitch: mean(fs.map(f => f.pitch)), irisH: mean(fs.map(f => f.irisH)), irisV: mean(fs.map(f => f.irisV)) };
}

/**
 * Build a personal calibration from the frames collected while the student looked at the centre and at
 * each screen edge. Returns null when there is too little data (caller falls back to the defaults).
 */
export function buildCalibration(centre: GazeFeatures[], edges: GazeFeatures[][], minFrames = 2): GazeCalibration | null {
    if (centre.length < minFrames) return null;
    const usable = edges.filter(e => e.length >= minFrames).map(meanFeatures);
    if (usable.length < 2) return null;
    const c = meanFeatures(centre);
    const ext = { yaw: 0, pitch: 0, irisH: 0, irisV: 0 };
    for (const e of usable) {
        for (const k of ['yaw', 'pitch', 'irisH', 'irisV'] as const) ext[k] = Math.max(ext[k], Math.abs(e[k] - c[k]));
    }
    for (const k of ['yaw', 'pitch', 'irisH', 'irisV'] as const) ext[k] = Math.max(ext[k], FLOOR[k]);
    return { centre: c, extent: ext, calibrated: true };
}

export interface GazeVerdict { away: boolean; reason: 'head' | 'eyes' | 'down' | null; dev: GazeFeatures }

/** Is this frame clearly outside where a student looking at the screen would be? */
export function classifyGaze(f: GazeFeatures, cal: GazeCalibration): GazeVerdict {
    const dev = { yaw: f.yaw - cal.centre.yaw, pitch: f.pitch - cal.centre.pitch, irisH: f.irisH - cal.centre.irisH, irisV: f.irisV - cal.centre.irisV };
    const lim = (k: keyof GazeFeatures) => cal.extent[k] * EDGE_MARGIN;
    if (Math.abs(dev.yaw) > lim('yaw')) return { away: true, reason: 'head', dev };
    if (Math.abs(dev.irisH) > lim('irisH')) return { away: true, reason: 'eyes', dev };
    // Pitch and vertical iris: looking down at a lap or desk is the usual cheating posture, so it is checked on its own.
    if (dev.pitch > lim('pitch') || dev.irisV > lim('irisV') * 1.2) return { away: true, reason: 'down', dev };
    if (dev.pitch < -lim('pitch') * 1.4) return { away: true, reason: 'head', dev };
    return { away: false, reason: null, dev };
}

/** Tracks how long gaze has been continuously away; blinks and tracking gaps do not reset or extend it. */
export class AwayTimer {
    private since: number | null = null;
    private lastEmit = -Infinity;
    private holdMs: number;
    private repeatMs: number;
    constructor(holdMs = 3000, repeatMs = 20000) { this.holdMs = holdMs; this.repeatMs = repeatMs; }
    /** away: true/false for a measured frame, null when no measurement (blink, no face) which neither starts nor clears the timer. */
    update(away: boolean | null, now: number): boolean {
        if (away === null) return false;
        if (!away) { this.since = null; return false; }
        if (this.since === null) this.since = now;
        if (now - this.since >= this.holdMs && now - this.lastEmit >= this.repeatMs) { this.lastEmit = now; return true; }
        return false;
    }
}
