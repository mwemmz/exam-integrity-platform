export type ProctorFlagType = 'face_missing' | 'multi_face' | 'phone_detected' | 'voice_detected' | 'gaze_away';

export interface ProctorFlag {
    type: ProctorFlagType;
    metadata: Record<string, unknown>;
}

export interface ProctorOptions {
    videoStream: MediaStream;
    audioStream?: MediaStream;
    onFlag: (flag: ProctorFlag) => void;
    onError?: (err: Error) => void;
    faceIntervalMs?: number;
    objectIntervalMs?: number;
}

const VISION_MODULE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs';
const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error('Failed to load AI monitoring library'));
        document.head.appendChild(el);
    });
}

const loadVision = (() => {
    let singleton: Promise<any> | null = null;
    return () => {
        if (!singleton) {
            singleton = (async () => {
                const vision = await import(/* @vite-ignore */ VISION_MODULE);
                const fileset = await vision.FilesetResolver.forVisionTasks(VISION_CDN);
                const makeDetector = (delegate: 'GPU' | 'CPU') =>
                    vision.FaceDetector.createFromOptions(fileset, {
                        baseOptions: {
                            modelAssetPath: FACE_MODEL_URL,
                            delegate
                        },
                        runningMode: 'VIDEO',
                        numFaces: 10,
                        minDetectionConfidence: 0.5
                    });
                try {
                    return await makeDetector('GPU');
                } catch {
                    return await makeDetector('CPU');
                }
            })().catch(err => {
                singleton = null;
                throw err;
            });
        }
        return singleton;
    };
})();

const loadObjectDetection = (() => {
    let singleton: Promise<any> | null = null;
    return () => {
        if (!singleton) {
            singleton = (async () => {
                await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
                await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
                const w = window as any;
                return w.cocoSsd.load({ base: 'lite_mobilenet_v2' });
            })().catch(err => {
                singleton = null;
                throw err;
            });
        }
        return singleton;
    };
})();

const SUSPICIOUS_CLASSES = new Set(['cell phone', 'remote']);

export async function startProctoring(options: ProctorOptions): Promise<() => void> {
    const disposed = { value: false };
    const timers: ReturnType<typeof setInterval>[] = [];
    const flagThrottle = new Map<string, number>();
    let faceMissingSince: number | null = null;
    let lastFaceMissingSent = 0;
    let multiFaceSince: number | null = null;
    let lastMultiFaceSent = 0;
    let faceDetector: any = null;
    let objectModel: any = null;
    let audioCtx: AudioContext | null = null;
    let audioAnalyser: AnalyserNode | null = null;
    let audioBaseline = 0;
    let audioVoicedStreak = 0;

    const monitorVideo = document.createElement('video');
    monitorVideo.muted = true;
    monitorVideo.playsInline = true;
    monitorVideo.width = 480;
    monitorVideo.height = 360;
    monitorVideo.srcObject = options.videoStream;
    try { await monitorVideo.play(); } catch { /* autoplay policy fallback handled by detection loop */ }

    const emit = (type: ProctorFlagType, metadata: Record<string, unknown>) => {
        const now = Date.now();
        const last = flagThrottle.get(type) || 0;
        if (type === 'face_missing' || type === 'multi_face') {
            if (now - last < 15000) return;
            const start = type === 'face_missing' ? faceMissingSince : multiFaceSince;
            if (start === null) return;
            const base = Math.max(type === 'face_missing' ? lastFaceMissingSent : lastMultiFaceSent, start);
            metadata.seconds = Math.max(1, Math.round((now - base) / 1000));
            if (type === 'face_missing') lastFaceMissingSent = now;
            else lastMultiFaceSent = now;
        } else if (now - last < 20000) {
            return;
        }
        flagThrottle.set(type, now);
        options.onFlag({ type, metadata });
    };

    const startFaceDetection = async () => {
        const timer = setInterval(async () => {
            if (disposed.value) return;
            try {
                faceDetector = faceDetector || await loadVision();
                if (!monitorVideo.videoWidth) return;
                const result = await faceDetector.detectForVideo(monitorVideo, performance.now());
                const detections: any[] = result.detections || [];
                const now = Date.now();

                if (detections.length >= 2) {
                    if (multiFaceSince === null) multiFaceSince = now;
                    if (now - multiFaceSince > 5000) {
                        emit('multi_face', { faces: detections.length });
                    }
                    faceMissingSince = null;
                } else if (detections.length === 1) {
                    multiFaceSince = null;
                    faceMissingSince = null;
                    const kp = detections[0].keypoints || [];
                    const byName: Record<string, any> = {};
                    for (const p of kp) byName[p.name] = p;
                    const rightEye = byName['rightEye'];
                    const leftEye = byName['leftEye'];
                    const nose = byName['noseTip'];
                    if (rightEye && leftEye && nose) {
                        const eyeMidX = (rightEye.x + leftEye.x) / 2;
                        const eyeMidY = (rightEye.y + leftEye.y) / 2;
                        const dx = nose.x - eyeMidX;
                        const dz = Math.abs(nose.y - eyeMidY);
                        if (Math.abs(dx) > 0.07 || dz > 0.09) {
                            emit('gaze_away', { dx: Number(dx.toFixed(3)), dz: Number(dz.toFixed(3)) });
                        }
                    }
                } else {
                    multiFaceSince = null;
                    if (faceMissingSince === null) faceMissingSince = now;
                    if (now - faceMissingSince > 5000) {
                        emit('face_missing', {});
                    }
                }
            } catch (err) {
                options.onError?.(err instanceof Error ? err : new Error(String(err)));
            }
        }, options.faceIntervalMs || 3500);
        timers.push(timer);
    };

    const startObjectDetection = async () => {
        const timer = setInterval(async () => {
            if (disposed.value) return;
            try {
                objectModel = objectModel || await loadObjectDetection();
                if (!monitorVideo.videoWidth) return;
                const predictions: any[] = await objectModel.detect(monitorVideo);
                const phones = predictions.filter(p => SUSPICIOUS_CLASSES.has(p.class) && p.score > 0.45);
                for (const p of phones.slice(0, 2)) {
                    emit('phone_detected', { kind: p.class, confidence: Number(p.score.toFixed(2)) });
                }
            } catch (err) {
                options.onError?.(err instanceof Error ? err : new Error(String(err)));
            }
        }, options.objectIntervalMs || 4500);
        timers.push(timer);
    };

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
            options.onError?.(err instanceof Error ? err : new Error(String(err)));
            return;
        }

        const buf = new Float32Array(audioAnalyser.fftSize);
        const timer = setInterval(() => {
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
                    emit('voice_detected', { level: Number(rms.toFixed(3)) });
                    audioVoicedStreak = 0;
                }
            } else {
                audioVoicedStreak = 0;
            }
        }, 300);
        timers.push(timer);
    };

    try {
        await Promise.all([startFaceDetection(), startObjectDetection(), startAudio()]);
    } catch (err) {
        options.onError?.(err instanceof Error ? err : new Error(String(err)));
    }

    return () => {
        disposed.value = true;
        timers.forEach(t => clearInterval(t));
        monitorVideo.srcObject = null;
        audioCtx?.close().catch(() => {});
    };
}