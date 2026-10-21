import { SightingWindow, collectSightings, decodeYolo, frameStats, gazeOffset, isBlocked, yoloInputSize, type DetectedBox } from './proctorLogic';

export type ProctorFlagType = 'face_missing' | 'multi_face' | 'phone_detected' | 'voice_detected' | 'gaze_away' | 'camera_blocked';

export interface ProctorFlag {
    type: ProctorFlagType;
    metadata: Record<string, unknown>;
    /** JPEG data URL of the camera frame at the moment of the flag (video-based flags only). */
    evidence?: string;
}

export type ModelState = 'loading' | 'ready' | 'failed';

export interface ProctorStatus {
    face: ModelState;
    object: ModelState;
    /** Which part of loading failed, for display / logging. */
    detail?: string;
}

export interface ProctorOptions {
    videoStream: MediaStream;
    audioStream?: MediaStream;
    onFlag: (flag: ProctorFlag) => void;
    onError?: (err: Error) => void;
    onStatus?: (status: ProctorStatus) => void;
    faceIntervalMs?: number;
    objectIntervalMs?: number;
}

// The MediaPipe runtime and models are fetched in the browser. Each has a fallback so that a
// blocked CDN on a campus network does not silently disable monitoring.
const VISION_MODULES = [
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs',
    'https://unpkg.com/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs'
];
const WASM_BASES = [
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm',
    'https://unpkg.com/@mediapipe/tasks-vision@0.10.3/wasm'
];
const LOCAL_MODELS = `${import.meta.env.BASE_URL || '/'}models/`;
const FACE_MODELS = [
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
    `${LOCAL_MODELS}blaze_face_short_range.tflite`
];
const OBJECT_MODELS = [
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
    `${LOCAL_MODELS}efficientdet_lite0.tflite`
];

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

let visionPromise: Promise<any> | null = null;
async function loadVisionModule(): Promise<any> {
    if (!visionPromise) {
        visionPromise = (async () => {
            let last: unknown;
            for (const url of VISION_MODULES) {
                try { return await import(/* @vite-ignore */ url); } catch (e) { last = e; }
            }
            throw last instanceof Error ? last : new Error('Could not load the MediaPipe runtime');
        })().catch(err => { visionPromise = null; throw err; });
    }
    return visionPromise;
}

/** Tries every runtime / model source and GPU then CPU, so one blocked host does not disable the detector. */
async function createMediaPipeDetector(kind: 'face' | 'object'): Promise<any> {
    const vision = await loadVisionModule();
    const Ctor = kind === 'face' ? vision.FaceDetector : vision.ObjectDetector;
    const models = kind === 'face' ? FACE_MODELS : OBJECT_MODELS;
    let last: unknown;
    for (const base of WASM_BASES) {
        let fileset: any;
        try { fileset = await vision.FilesetResolver.forVisionTasks(base); } catch (e) { last = e; continue; }
        for (const model of models) {
            for (const delegate of ['GPU', 'CPU'] as const) {
                try {
                    return await Ctor.createFromOptions(fileset, {
                        baseOptions: { modelAssetPath: model, delegate },
                        runningMode: 'VIDEO',
                        ...(kind === 'face'
                            ? { numFaces: 10, minDetectionConfidence: 0.5 }
                            : { scoreThreshold: 0.2, maxResults: 10 })
                    });
                } catch (e) { last = e; }
            }
        }
    }
    throw last instanceof Error ? last : new Error(`Could not load the ${kind} model`);
}

/** Anything that can look at a camera frame and return MediaPipe-shaped detections. */
export interface ObjectDetectorLike {
    name: string;
    detect(source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement, width: number, height: number): Promise<any[]>;
    close(): void;
}

const APP_BASE = import.meta.env.BASE_URL || '/';
const YOLO_MODEL_URL = `${APP_BASE}models/yolo11n.onnx`;
const ORT_WASM_PATH = `${APP_BASE}ort/`;
const YOLO_MIN_SCORE = 0.15;

/**
 * YOLO11n (COCO) running fully in the browser through ONNX Runtime Web. It is a markedly stronger detector than
 * EfficientDet-Lite0 (COCO mAP 39.5 vs 25.7) and is served from this site, so it needs no third-party host.
 */
export async function createYoloDetector(classes?: Record<number, string>): Promise<ObjectDetectorLike> {
    const ort: any = await import('onnxruntime-web/wasm');
    ort.env.wasm.wasmPaths = ORT_WASM_PATH;
    ort.env.wasm.numThreads = 1; // multi-threading needs cross-origin isolation, which this site does not enable
    const session = await ort.InferenceSession.create(YOLO_MODEL_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
    });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');
    const inputName: string = session.inputNames[0];
    const outputName: string = session.outputNames[0];

    return {
        name: 'yolo11n',
        async detect(source, width, height) {
            const { w, h } = yoloInputSize(width, height);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            ctx.drawImage(source, 0, 0, w, h);
            const rgba = ctx.getImageData(0, 0, w, h).data;
            const plane = w * h;
            const input = new Float32Array(3 * plane);
            for (let i = 0; i < plane; i++) {
                input[i] = rgba[i * 4] / 255;
                input[plane + i] = rgba[i * 4 + 1] / 255;
                input[2 * plane + i] = rgba[i * 4 + 2] / 255;
            }
            const out = await session.run({ [inputName]: new ort.Tensor('float32', input, [1, 3, h, w]) });
            const t = out[outputName];
            return decodeYolo(t.data as Float32Array, t.dims[2], YOLO_MIN_SCORE, width / w, height / h, classes);
        },
        close() { try { session.release?.(); } catch { /* ignore */ } }
    };
}

async function createMediaPipeObjectDetector(): Promise<ObjectDetectorLike> {
    const model = await createMediaPipeDetector('object');
    return {
        name: 'efficientdet-lite0',
        async detect(source) {
            const result = await model.detectForVideo(source as HTMLVideoElement, performance.now());
            return result.detections || [];
        },
        close() { try { model.close?.(); } catch { /* ignore */ } }
    };
}

/** Prefers YOLO11n; falls back to the MediaPipe model if the ONNX runtime or model cannot load. */
async function createObjectDetector(): Promise<ObjectDetectorLike> {
    try {
        return await createYoloDetector();
    } catch (e) {
        console.warn('[proctor] YOLO detector unavailable, falling back to EfficientDet-Lite0', e);
        return await createMediaPipeObjectDetector();
    }
}

async function createDetector(kind: 'face' | 'object'): Promise<any> {
    return kind === 'face' ? createMediaPipeDetector('face') : createObjectDetector();
}

async function createWithRetry(kind: 'face' | 'object', isDisposed: () => boolean): Promise<any> {
    const delays = [0, 2000, 5000, 10000];
    let last: unknown;
    for (const d of delays) {
        if (d) await sleep(d);
        if (isDisposed()) throw new Error('disposed');
        try { return await createDetector(kind); } catch (e) { last = e; }
    }
    throw last instanceof Error ? last : new Error(`Could not load the ${kind} model`);
}

type DurationFlag = 'face_missing' | 'multi_face' | 'camera_blocked';

export async function startProctoring(options: ProctorOptions): Promise<() => void> {
    const disposed = { value: false };
    const timers: ReturnType<typeof setInterval>[] = [];
    const lastSent = new Map<string, number>();

    // Duration-based flags report how long the condition has lasted (the server sums these for its rules).
    const since: Record<DurationFlag, number | null> = { face_missing: null, multi_face: null, camera_blocked: null };
    const reportedUntil: Record<DurationFlag, number> = { face_missing: 0, multi_face: 0, camera_blocked: 0 };
    const DURATION_THROTTLE_MS = 15000;
    const THROTTLE_MS: Record<string, number> = { phone_detected: 12000, gaze_away: 20000, voice_detected: 20000 };

    let faceDetector: any = null;
    let objectModel: ObjectDetectorLike | null = null;
    let audioCtx: AudioContext | null = null;
    let audioAnalyser: AnalyserNode | null = null;
    let audioBaseline = 0;
    let audioVoicedStreak = 0;
    let gazeStreak = 0;
    const sightings = new SightingWindow();

    const status: ProctorStatus = { face: 'loading', object: 'loading' };
    const pushStatus = (patch: Partial<ProctorStatus>) => {
        Object.assign(status, patch);
        options.onStatus?.({ ...status });
    };
    const fail = (err: unknown) => options.onError?.(err instanceof Error ? err : new Error(String(err)));

    const monitorVideo = document.createElement('video');
    monitorVideo.muted = true;
    monitorVideo.playsInline = true;
    monitorVideo.srcObject = options.videoStream;
    try { await monitorVideo.play(); } catch { /* retried by the loops once frames arrive */ }

    const videoTrack = options.videoStream.getVideoTracks()[0];

    const ready = () => monitorVideo.readyState >= 2 && monitorVideo.videoWidth > 0;

    /** Grab the current camera frame (optionally outlining a detected object) as a JPEG data URL. */
    const captureEvidence = (box?: DetectedBox | null): string | undefined => {
        if (!ready()) return undefined;
        try {
            const w = 480;
            const h = Math.round((monitorVideo.videoHeight / monitorVideo.videoWidth) * w);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return undefined;
            ctx.drawImage(monitorVideo, 0, 0, w, h);
            if (box) {
                const k = w / monitorVideo.videoWidth;
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#ef4444';
                ctx.strokeRect(box.x * k, box.y * k, box.w * k, box.h * k);
            }
            return canvas.toDataURL('image/jpeg', 0.6);
        } catch {
            return undefined;
        }
    };

    const emitSimple = (type: ProctorFlagType, metadata: Record<string, unknown>, box?: DetectedBox | null) => {
        const now = Date.now();
        if (now - (lastSent.get(type) || 0) < (THROTTLE_MS[type] || 20000)) return;
        lastSent.set(type, now);
        options.onFlag({ type, metadata, evidence: type === 'voice_detected' ? undefined : captureEvidence(box) });
    };

    /** Called every tick while a condition holds; emits once it has lasted `afterMs`, then every 15 s. */
    const emitDuration = (type: DurationFlag, active: boolean, afterMs: number, metadata: Record<string, unknown> = {}) => {
        const now = Date.now();
        if (!active) { since[type] = null; return; }
        if (since[type] === null) since[type] = now;
        if (now - (since[type] as number) <= afterMs) return;
        if (now - (lastSent.get(type) || 0) < DURATION_THROTTLE_MS) return;
        const base = Math.max(reportedUntil[type], since[type] as number);
        lastSent.set(type, now);
        reportedUntil[type] = now;
        options.onFlag({
            type,
            metadata: { ...metadata, seconds: Math.max(1, Math.round((now - base) / 1000)) },
            evidence: captureEvidence()
        });
    };

    // ---- Camera covered / blocked: needs no model, so it works even if the AI models fail to load.
    const statCanvas = document.createElement('canvas');
    statCanvas.width = 32;
    statCanvas.height = 24;
    const statCtx = statCanvas.getContext('2d', { willReadFrequently: true });
    let blockedNow = false;

    const checkCamera = () => {
        if (disposed.value) return;
        let blocked = false;
        let detail = '';
        if (videoTrack && (videoTrack.readyState === 'ended' || videoTrack.muted)) {
            blocked = true;
            detail = 'camera stream stopped';
        } else if (ready() && statCtx) {
            try {
                statCtx.drawImage(monitorVideo, 0, 0, 32, 24);
                const s = frameStats(statCtx.getImageData(0, 0, 32, 24).data);
                if (isBlocked(s)) {
                    blocked = true;
                    detail = `frame ${s.mean < 18 ? 'dark' : 'flat'} (brightness ${Math.round(s.mean)}, detail ${s.std.toFixed(1)})`;
                }
            } catch { /* tainted or unavailable frame: ignore */ }
        }
        blockedNow = blocked;
        emitDuration('camera_blocked', blocked, 5000, blocked ? { detail } : {});
    };

    // ---- Faces
    let faceBusy = false;
    const faceTick = async () => {
        if (disposed.value || faceBusy || !faceDetector || !ready()) return;
        faceBusy = true;
        try {
            const result = await faceDetector.detectForVideo(monitorVideo, performance.now());
            const detections: any[] = result.detections || [];

            if (blockedNow) {
                // A covered lens is reported as camera_blocked, not as a missing face.
                emitDuration('face_missing', false, 0);
                emitDuration('multi_face', false, 0);
                return;
            }

            emitDuration('multi_face', detections.length >= 2, 4000, { faces: detections.length });
            emitDuration('face_missing', detections.length === 0, 5000, { detail: 'no face in view' });

            if (detections.length === 1) {
                const byName: Record<string, any> = {};
                for (const p of detections[0].keypoints || []) byName[p.name] = p;
                if (byName.rightEye && byName.leftEye && byName.noseTip) {
                    const g = gazeOffset(byName.rightEye, byName.leftEye, byName.noseTip);
                    gazeStreak = g.away ? gazeStreak + 1 : 0;
                    // Two consecutive frames: ignores a single blink or jitter.
                    if (gazeStreak >= 2) {
                        emitSimple('gaze_away', { dx: Number(g.dx.toFixed(3)), dz: Number(g.dz.toFixed(3)) });
                    }
                }
            } else {
                gazeStreak = 0;
            }
        } catch (err) {
            fail(err);
        } finally {
            faceBusy = false;
        }
    };

    // ---- Phones and other devices
    let objectBusy = false;
    const objectTick = async () => {
        if (disposed.value || objectBusy || !objectModel || !ready() || blockedNow) return;
        objectBusy = true;
        try {
            const dets = await objectModel.detect(monitorVideo, monitorVideo.videoWidth, monitorVideo.videoHeight);
            const hit = sightings.update(collectSightings(dets), Date.now());
            if (hit) {
                emitSimple(
                    'phone_detected',
                    { kind: hit.kind, model: objectModel?.name, confidence: Number(hit.score.toFixed(2)), detail: `${hit.kind} (${Math.round(hit.score * 100)}% confidence)` },
                    hit.box
                );
            }
        } catch (err) {
            fail(err);
        } finally {
            objectBusy = false;
        }
    };

    // ---- Audio
    const startAudio = async () => {
        if (!options.audioStream) return;
        try {
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(options.audioStream);
            audioAnalyser = audioCtx.createAnalyser();
            audioAnalyser.fftSize = 2048;
            source.connect(audioAnalyser);
            await audioCtx.resume();
        } catch (err) {
            fail(err);
            return;
        }

        const buf = new Float32Array(audioAnalyser.fftSize);
        timers.push(setInterval(() => {
            if (disposed.value || !audioAnalyser) return;
            audioAnalyser.getFloatTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
            const rms = Math.sqrt(sum / buf.length);
            audioBaseline = 0.94 * audioBaseline + 0.06 * rms;
            const threshold = Math.max(0.055, audioBaseline * 2.8);
            if (rms > threshold && rms > 0.045) {
                audioVoicedStreak++;
                if (audioVoicedStreak >= 4) {
                    emitSimple('voice_detected', { level: Number(rms.toFixed(3)) });
                    audioVoicedStreak = 0;
                }
            } else {
                audioVoicedStreak = 0;
            }
        }, 300));
    };

    // Start the cheap, model-free camera check immediately, then load the models in the background
    // so the student can begin the exam while they download. Status is reported as each one arrives.
    timers.push(setInterval(checkCamera, 1000));
    timers.push(setInterval(() => void faceTick(), options.faceIntervalMs || 1000));
    timers.push(setInterval(() => void objectTick(), options.objectIntervalMs || 1500));
    void startAudio();

    const failures: string[] = [];
    const note = (what: string, err: unknown) => {
        failures.push(what);
        fail(err);
        pushStatus({ detail: `${failures.join(' and ')} could not be loaded` });
    };
    if (!videoTrack) {
        // Audio-only exam: there is no camera to analyse, so there are no vision models to load.
        pushStatus({ face: 'ready', object: 'ready' });
    } else {
        createWithRetry('face', () => disposed.value)
            .then(d => { faceDetector = d; pushStatus({ face: 'ready' }); })
            .catch(e => { if (!disposed.value) { pushStatus({ face: 'failed' }); note('face detection', e); } });
        createWithRetry('object', () => disposed.value)
            .then(d => { objectModel = d; pushStatus({ object: 'ready' }); })
            .catch(e => { if (!disposed.value) { pushStatus({ object: 'failed' }); note('phone detection', e); } });
    }

    return () => {
        disposed.value = true;
        timers.forEach(t => clearInterval(t));
        monitorVideo.srcObject = null;
        try { faceDetector?.close?.(); } catch { /* ignore */ }
        try { objectModel?.close(); } catch { /* ignore */ }
        audioCtx?.close().catch(() => {});
    };
}
