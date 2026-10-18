import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

export default function ConsentPage() {
    const { examId } = useParams();
    const navigate = useNavigate();
    const [exam, setExam] = useState<any>(null);
    const [webcamOk, setWebcamOk] = useState<boolean | null>(null);
    const [audioOk, setAudioOk] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api(`/api/exams/${examId}`).then(setExam).catch(err => setError(err.message));
    }, [examId]);

    const begin = async () => {
        setBusy(true);
        setError('');
        try {
            try {
                await document.documentElement.requestFullscreen();
            } catch {
                // browser refused fullscreen; continue anyway
            }
            if (webcamOk) {
                try {
                    await navigator.mediaDevices.getUserMedia({ video: true });
                } catch {
                    setWebcamOk(false); // denied: continue without snapshots
                }
            }
            if (audioOk) {
                try {
                    await navigator.mediaDevices.getUserMedia({ audio: true });
                } catch {
                    setAudioOk(false); // denied: continue without voice detection
                }
            }
            const data = await api<{ attemptId: number }>(`/api/attempts/${examId}/start`, { method: 'POST' });
            navigate(`/exam/${data.attemptId}/take/${examId}`, { state: { webcamEnabled: !!webcamOk, audioEnabled: !!audioOk } });
        } catch (err: any) {
            setError(err.message || 'Could not start the exam');
        } finally {
            setBusy(false);
        }
    };

    if (error && !exam) {
        return (
            <div className="max-w-2xl mx-auto p-4 sm:p-6">
                <div className="glass px-4 py-3 text-danger bg-danger/8 border border-danger/25">{error}</div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6">
            <div className="glass-strong p-5 sm:p-8">
                <h1 className="text-[2rem] font-extrabold tracking-tight text-ink">Before you begin</h1>
                <p className="text-muted text-sm mb-6">{exam ? exam.title : ''}</p>

                <h2 className="font-extrabold text-ink-2 mb-2">What is monitored during this exam</h2>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft mb-6">
                    <li><strong className="text-ink">Tab switching:</strong> every time you leave this tab or window, it is recorded with a timestamp.</li>
                    <li><strong className="text-ink">Full-screen exits:</strong> we ask you to stay in full-screen; leaving full-screen is recorded.</li>
                    <li><strong className="text-ink">Paste blocking:</strong> pasting and right-click are disabled in answer fields.</li>
                    <li>
                        <label htmlFor="webcam-consent" className="inline-flex items-start gap-2 cursor-pointer mt-1">
                            <input id="webcam-consent" name="webcamConsent" type="checkbox" checked={!!webcamOk} onChange={e => setWebcamOk(e.target.checked)} className="mt-0.5 accent-accent" />
                            <span>
                                <strong className="text-ink">Periodic webcam snapshots + face monitoring (optional):</strong> allow camera access and a still photo will be taken roughly every 60 seconds. An on-device AI detector also checks that your face stays in frame and looks toward the screen, and that no other person or phone appears in view. Your instructor can review all of this afterwards.
                                {webcamOk === false && <span className="block text-xs text-warm-ink mt-0.5">Camera was not granted — you can continue without snapshots.</span>}
                            </span>
                        </label>
                    </li>
                    <li>
                        <label htmlFor="audio-consent" className="inline-flex items-start gap-2 cursor-pointer mt-1">
                            <input id="audio-consent" name="audioConsent" type="checkbox" checked={!!audioOk} onChange={e => setAudioOk(e.target.checked)} className="mt-0.5 accent-accent" />
                            <span>
                                <strong className="text-ink">Voice/noise monitoring (optional):</strong> allow microphone access so background voices or loud noise are detected. Audio is analysed locally and never recorded.
                                {audioOk === false && <span className="block text-xs text-warm-ink mt-0.5">Microphone was not granted — you can continue without voice detection.</span>}
                            </span>
                        </label>
                    </li>
                </ul>

                <div className="text-sm bg-ink/4 border border-line rounded-lg px-4 py-3 text-muted mb-6">
                    The exam has a time limit of <strong className="text-ink-2">{exam?.time_limit_minutes ?? '—'} minutes</strong> once started, answers auto-save periodically, and the exam submits automatically when time runs out. If too many integrity violations occur, your exam is submitted automatically.
                </div>

                {error && <div className="mb-4 text-sm text-danger bg-danger/8 border border-danger/25 rounded-lg px-3 py-2">{error}</div>}

                <button onClick={begin} disabled={busy} className="btn-primary w-full py-3">
                    {busy ? 'Starting…' : 'I understand and agree to begin'}
                </button>
            </div>
        </div>
    );
}