import { useEffect, useRef, useState } from 'react';
import { createGazeTracker, saveCalibration } from '../lib/gazeTracker';
import { buildCalibration, extractFeatures, type GazeFeatures } from '../lib/gazeMath';

// Centre first (the baseline), then the four screen edges (how far this student moves when reading the whole screen).
const DOTS = [
    { name: 'centre', left: '50%', top: '50%' },
    { name: 'left', left: '5%', top: '50%' },
    { name: 'right', left: '95%', top: '50%' },
    { name: 'top', left: '50%', top: '8%' },
    { name: 'bottom', left: '50%', top: '92%' }
];
const SETTLE_MS = 900;
const HOLD_MS = 2200;
const WANT_FRAMES = 6;
const MAX_HOLD_MS = 6000; // keep waiting past HOLD_MS (slow PCs) until enough frames are in, but not forever
const SAMPLE_MS = 200;

type Phase = 'loading' | 'running' | 'failed';

/** Full-screen five-dot calibration. Calls onDone when finished or skipped; calibration is stored for the exam page. */
export default function GazeCalibration({ stream, onDone }: { stream: MediaStream; onDone: (calibrated: boolean) => void }) {
    const [phase, setPhase] = useState<Phase>('loading');
    const [idx, setIdx] = useState(0);
    const [note, setNote] = useState('');
    const cancelled = useRef(false);
    const skip = useRef(false);

    useEffect(() => {
        cancelled.current = false;
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        let tracker: Awaited<ReturnType<typeof createGazeTracker>> | null = null;
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
        (async () => {
            try {
                await video.play();
                tracker = await createGazeTracker();
            } catch {
                if (!cancelled.current) { setPhase('failed'); setNote('Gaze calibration is not available on this device. Standard settings will be used.'); }
                return;
            }
            if (cancelled.current) return;
            // The first frame is slow while the model warms up; do it before the first dot so it does not eat the dot's time.
            await tracker.landmarks(video).catch(() => null);
            if (cancelled.current) return;
            setPhase('running');
            const centre: GazeFeatures[] = [];
            const edges: GazeFeatures[][] = [];
            for (let i = 0; i < DOTS.length; i++) {
                if (cancelled.current || skip.current) break;
                setIdx(i);
                await sleep(SETTLE_MS);
                const got: GazeFeatures[] = [];
                const start = performance.now();
                while (!cancelled.current && !skip.current) {
                    const t = performance.now() - start;
                    if (t >= MAX_HOLD_MS || (t >= HOLD_MS && got.length >= WANT_FRAMES)) break;
                    const f = extractFeatures(await tracker.landmarks(video));
                    if (f) got.push(f);
                    await sleep(SAMPLE_MS);
                }
                if (i === 0) centre.push(...got); else edges.push(got);
            }
            tracker.close();
            if (cancelled.current) return;
            if (skip.current) { saveCalibration(null); onDone(false); return; }
            const cal = buildCalibration(centre, edges);
            saveCalibration(cal);
            if (!cal) {
                setPhase('failed');
                setNote('We could not see your eyes clearly enough, so standard settings will be used. Make sure your face is lit and facing the screen.');
                return;
            }
            onDone(true);
        })();
        return () => { cancelled.current = true; try { tracker?.close(); } catch { /* ignore */ } video.srcObject = null; };
    }, [stream, onDone]);

    const dot = DOTS[idx];
    return (
        <div className="fixed inset-0 z-50 bg-white" role="dialog" aria-label="Eye calibration">
            <div className="absolute inset-x-0 top-[22%] text-center px-6">
                <h2 className="text-xl font-extrabold text-ink">
                    {phase === 'loading' ? 'Getting ready…' : phase === 'failed' ? 'Calibration skipped' : 'Look at the dot'}
                </h2>
                <p className="text-sm text-muted mt-1 max-w-md mx-auto">
                    {phase === 'running'
                        ? 'Keep your head still and follow the dot with your eyes only. This takes about 15 seconds and nothing is recorded.'
                        : phase === 'loading' ? 'Loading the eye tracker on this device.' : note}
                </p>
            </div>
            {phase === 'running' && (
                <div
                    data-testid="calib-dot"
                    data-dot={dot.name}
                    className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-8 ring-accent/25 transition-all duration-500"
                    style={{ left: dot.left, top: dot.top }}
                />
            )}
            <div className="absolute inset-x-0 bottom-8 text-center">
                {phase === 'failed'
                    ? <button className="btn-primary px-6 py-2" onClick={() => onDone(false)}>Continue</button>
                    : <button className="btn-soft px-4 py-1.5 text-xs" onClick={() => { skip.current = true; if (phase === 'loading') { saveCalibration(null); onDone(false); } }}>Skip calibration</button>}
            </div>
        </div>
    );
}
