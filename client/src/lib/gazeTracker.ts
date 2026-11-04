import type { Pt, GazeCalibration } from './gazeMath';

// FaceMesh (with iris refinement) runs from files served by this site, so it works on a campus network that blocks
// third-party hosts. The model has no CDN fallback on purpose: if it cannot load, gaze checking is simply off.
const APP_ROOT = import.meta.env.BASE_URL || '/';
const BASE = `${APP_ROOT}mediapipe/face_mesh/`;

export interface GazeTracker {
    /** Landmarks (478, normalised) for the first face in the frame, or null when no face is found. */
    landmarks(video: HTMLVideoElement): Promise<Pt[] | null>;
    close(): void;
}

export async function createGazeTracker(): Promise<GazeTracker> {
    // FaceMesh runs in a hidden same-origin iframe: it defines a global "Module" that would clash with the
    // MediaPipe tasks runtime used for face detection in the main page.
    const frame = document.createElement('iframe');
    frame.src = `${BASE}host.html`;
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
    const waiters = new Map<number, (p: Pt[] | null) => void>();
    let nextId = 1;
    let closed = false;
    let onReady: () => void = () => {};
    let onError: (e: Error) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => { onReady = resolve; onError = reject; });
    const onMessage = (ev: MessageEvent) => {
        if (ev.source !== frame.contentWindow || ev.origin !== window.location.origin || !ev.data) return;
        if (ev.data.type === 'gaze-ready') onReady();
        else if (ev.data.type === 'gaze-error') onError(new Error(String(ev.data.message)));
        else if (ev.data.type === 'gaze-result') {
            const w = waiters.get(ev.data.id);
            if (!w) return;
            waiters.delete(ev.data.id);
            const flat: Float32Array | null = ev.data.points;
            if (!flat) return w(null);
            const pts: Pt[] = [];
            for (let i = 0; i + 1 < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
            w(pts);
        }
    };
    window.addEventListener('message', onMessage);
    document.body.appendChild(frame);
    const close = () => {
        closed = true;
        window.removeEventListener('message', onMessage);
        waiters.forEach(w => w(null));
        waiters.clear();
        frame.remove();
    };
    try {
        await Promise.race([ready, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('eye tracker load timed out')), 45000))]);
    } catch (e) { close(); throw e; }
    return {
        async landmarks(video) {
            if (closed || !frame.contentWindow || video.videoWidth === 0) return null;
            const bitmap = await createImageBitmap(video);
            return new Promise<Pt[] | null>(resolve => {
                const id = nextId++;
                const timer = setTimeout(() => { waiters.delete(id); resolve(null); }, 5000);
                waiters.set(id, p => { clearTimeout(timer); resolve(p); });
                frame.contentWindow!.postMessage({ type: 'gaze-frame', id, bitmap }, window.location.origin, [bitmap]);
            });
        },
        close
    };
}

const KEY = 'examtech.gazeCalibration';
export function saveCalibration(c: GazeCalibration | null): void {
    try { if (c) sessionStorage.setItem(KEY, JSON.stringify(c)); else sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
export function loadCalibration(): GazeCalibration | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const c = JSON.parse(raw);
        return c && c.calibrated && c.centre && c.extent ? (c as GazeCalibration) : null;
    } catch { return null; }
}
