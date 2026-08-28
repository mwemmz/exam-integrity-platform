import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { startProctoring } from '../../lib/proctor';

interface Question {
    id: number;
    type: string;
    prompt: string;
    points: number;
    options?: string[] | null;
}

interface StatusResp {
    status: string;
    started_at: string | null;
    time_limit_minutes: number | null;
    auto_submit_reason?: { rule?: string } | null;
}

function fmt(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export default function ExamPage() {
    const { attemptId = '', examId = '' } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const webcamEnabled = !!(location.state as { webcamEnabled?: boolean } | null)?.webcamEnabled;
    const audioEnabled = !!(location.state as { audioEnabled?: boolean } | null)?.audioEnabled;

    const [questions, setQuestions] = useState<Question[]>([]);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [phase, setPhase] = useState<'loading' | 'active' | 'locked'>('loading');
    const [autoReason, setAutoReason] = useState('');
    const [remaining, setRemaining] = useState(0);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [proctorStatus, setProctorStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

    const answersRef = useRef(answers);
    const dirtyRef = useRef<Set<number>>(new Set());
    const phaseRef = useRef(phase);
    const deadlineRef = useRef<number | null>(null);
    const fsExitAtRef = useRef<number | null>(null);
    const submittedRef = useRef(false);

    useEffect(() => { answersRef.current = answers; }, [answers]);
    useEffect(() => { phaseRef.current = phase; }, [phase]);

    const lockExam = useCallback((reason: string) => {
        setAutoReason(reason);
        setPhase('locked');
        document.exitFullscreen().catch(() => {});
    }, []);

    const logEvent = useCallback(async (eventType: string, metadata?: Record<string, unknown>) => {
        if (phaseRef.current !== 'active') return;
        try {
            const res = await api<{ autoSubmitted: boolean; rule?: string }>(
                `/api/integrity/${attemptId}/event`,
                { method: 'POST', body: { eventType, metadata } }
            );
            if (res.autoSubmitted) lockExam(res.rule || 'Integrity rules were violated');
        } catch {
            // network hiccup: keep going rather than failing the student's exam
        }
    }, [attemptId, lockExam]);

    const flushSaves = useCallback(async () => {
        for (const qid of Array.from(dirtyRef.current)) {
            dirtyRef.current.delete(qid);
            try {
                await api(`/api/attempts/${attemptId}/answer`, {
                    method: 'POST',
                    body: { questionId: qid, responseText: answersRef.current[qid] ?? '' }
                });
            } catch {
                dirtyRef.current.add(qid);
            }
        }
    }, [attemptId]);

    const submitExam = useCallback(async () => {
        if (submittedRef.current) return;
        submittedRef.current = true;
        setSubmitting(true);
        await flushSaves();
        try {
            await api(`/api/attempts/${attemptId}/submit`, { method: 'POST' });
        } catch {
            // already submitted (e.g. by rule engine)
        }
        document.exitFullscreen().catch(() => {});
        navigate(`/results/${attemptId}`);
    }, [attemptId, navigate, flushSaves]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const st = await api<StatusResp>(`/api/attempts/${attemptId}/status`);
                if (st.status !== 'in_progress') {
                    lockExam(
                        st.status === 'auto_submitted'
                            ? (st.auto_submit_reason?.rule || 'Integrity rules were violated')
                            : 'This attempt was already submitted'
                    );
                    return;
                }
                if (st.started_at && st.time_limit_minutes) {
                    deadlineRef.current = new Date(st.started_at).getTime() + st.time_limit_minutes * 60000;
                    setRemaining(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)));
                }
                const qs = await api<Question[]>(`/api/exams/${examId}/questions`);
                if (!cancelled) {
                    setQuestions(qs);
                    setPhase('active');
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load exam');
            }
        })();
        return () => { cancelled = true; };
    }, [attemptId, examId, lockExam]);

    useEffect(() => {
        const iv = setInterval(() => {
            if (deadlineRef.current) setRemaining(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)));
        }, 1000);
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        if (deadlineRef.current && remaining <= 0 && phaseRef.current === 'active' && !submittedRef.current) {
            void submitExam();
        }
    }, [remaining, submitExam]);

    useEffect(() => {
        const iv = setInterval(async () => {
            if (phaseRef.current !== 'active') return;
            try {
                const st = await api<StatusResp>(`/api/attempts/${attemptId}/status`);
                if (st.status === 'auto_submitted') lockExam(st.auto_submit_reason?.rule || 'Too many integrity violations');
                else if (st.status !== 'in_progress') lockExam('This attempt was already submitted');
            } catch {
                // ignore polling errors
            }
        }, 8000);
        return () => clearInterval(iv);
    }, [attemptId, lockExam]);

    useEffect(() => {
        const iv = setInterval(() => {
            if (phaseRef.current === 'active') void flushSaves();
        }, 15000);
        return () => clearInterval(iv);
    }, [flushSaves]);

    useEffect(() => {
        const onVis = () => { if (document.hidden) void logEvent('tab_switch'); };
        const onFs = () => {
            if (!document.fullscreenElement) {
                fsExitAtRef.current = Date.now();
            } else if (fsExitAtRef.current !== null) {
                const seconds = Math.round((Date.now() - fsExitAtRef.current) / 1000);
                fsExitAtRef.current = null;
                void logEvent('fullscreen_exit', { seconds });
            }
        };
        document.addEventListener('visibilitychange', onVis);
        document.addEventListener('fullscreenchange', onFs);
        return () => {
            document.removeEventListener('visibilitychange', onVis);
            document.removeEventListener('fullscreenchange', onFs);
            if (fsExitAtRef.current !== null) {
                const seconds = Math.round((Date.now() - fsExitAtRef.current) / 1000);
                fsExitAtRef.current = null;
                void logEvent('fullscreen_exit', { seconds });
            }
        };
    }, [logEvent]);

    useEffect(() => {
        if (!webcamEnabled && !audioEnabled) return;
        let cancelled = false;
        let mediaStream: MediaStream | null = null;
        let stopProctor: (() => void) | null = null;
        let snapIv: ReturnType<typeof setInterval> | null = null;
        setProctorStatus('loading');

        navigator.mediaDevices.getUserMedia({ video: !!webcamEnabled, audio: !!audioEnabled })
            .then(async s => {
                if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
                mediaStream = s;
                const video = document.createElement('video');
                video.muted = true;
                video.playsInline = true;
                if (webcamEnabled) {
                    video.srcObject = s;
                    await video.play().catch(() => {});
                }
                stopProctor = await startProctoring({
                    videoStream: s,
                    audioStream: audioEnabled ? s : undefined,
                    onFlag: flag => void logEvent(flag.type, flag.metadata),
                    onError: () => { /* keep monitoring degradable */ }
                });
                if (cancelled) return;
                setProctorStatus('ready');
                if (webcamEnabled) {
                    snapIv = setInterval(async () => {
                        if (!video.videoWidth) return;
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        canvas.getContext('2d')?.drawImage(video, 0, 0);
                        try {
                            await api(`/api/snapshots/${attemptId}/snapshot`, {
                                method: 'POST',
                                body: { imageBase64: canvas.toDataURL('image/jpeg', 0.6) }
                            });
                        } catch {
                            // ignore snapshot upload failures
                        }
                    }, 60000);
                }
            })
            .catch(() => {
                if (!cancelled) setProctorStatus('error');
            });

        return () => {
            cancelled = true;
            stopProctor?.();
            if (snapIv) clearInterval(snapIv);
            mediaStream?.getTracks().forEach(t => t.stop());
        };
    }, [webcamEnabled, audioEnabled, attemptId, logEvent]);

    const updateAnswer = (qid: number, value: string) => {
        setAnswers(prev => ({ ...prev, [qid]: value }));
        dirtyRef.current.add(qid);
    };

    const selectedFor = (qid: number): number[] => {
        try {
            const v = JSON.parse(answers[qid] || '[]');
            return Array.isArray(v) ? v : [];
        } catch {
            return [];
        }
    };

    const toggleMcq = (qid: number, idx: number) => {
        const cur = selectedFor(qid);
        const next = cur.includes(idx) ? cur.filter(i => i !== idx) : [...cur, idx];
        updateAnswer(qid, JSON.stringify(next));
    };

    if (phase === 'loading') {
        return <div className="p-8 text-slate-500">Loading exam…</div>;
    }

    if (phase === 'locked') {
        return (
            <div className="min-h-[70vh] flex items-center justify-center px-4">
                <div className={`max-w-md w-full rounded-xl p-8 text-center border ${autoReason ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                    <h1 className="text-xl font-bold mb-2">
                        {autoReason ? 'Exam submitted automatically' : 'Exam submitted'}
                    </h1>
                    {autoReason && (
                        <p className="text-sm text-red-700 mb-4">Your exam was submitted automatically because {autoReason.toLowerCase()}.</p>
                    )}
                    <p className="text-sm text-slate-500 mb-6">Your answers up to this point have been saved.</p>
                    <div className="flex gap-3 justify-center">
                        <Link to={`/results/${attemptId}`} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">View status</Link>
                        <Link to="/student" className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300">Back to dashboard</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div onContextMenu={e => e.preventDefault()} className="pb-28">
            <div className="sticky top-0 z-10 bg-indigo-700 text-white px-3 sm:px-6 py-3 flex items-center justify-between gap-2 shadow">
                <div className="text-sm min-w-0">
                    <span className="font-semibold">Exam in progress</span>
                    {proctorStatus !== 'idle' && (
                        <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full font-medium align-middle ${
                            proctorStatus === 'ready'
                                ? 'bg-emerald-900/60 text-emerald-200'
                                : proctorStatus === 'loading'
                                    ? 'bg-amber-900/50 text-amber-200'
                                    : 'bg-slate-800/60 text-slate-300'
                        }`}>
                            {proctorStatus === 'ready' ? 'AI monitoring active' : proctorStatus === 'loading' ? 'Starting AI monitoring…' : 'AI monitoring unavailable'}
                        </span>
                    )}
                    <span className="ml-2 text-indigo-200 hidden md:inline">Tab switches and full-screen exits are being recorded</span>
                </div>
                <div className={`px-3 py-1.5 rounded-lg font-mono font-bold text-base sm:text-lg shrink-0 ${remaining <= 60 ? 'bg-red-600' : 'bg-indigo-900/60'}`}>
                    {deadlineRef.current ? fmt(remaining) : '--:--'}
                </div>
            </div>

            <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
                {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

                {questions.map((q, i) => (
                    <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-5">
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <p className="font-medium">{i + 1}. {q.prompt}</p>
                            <span className="shrink-0 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{q.points} pts · {q.type}</span>
                        </div>

                        {q.type === 'mcq' && (
                            <div className="space-y-1.5">
                                {(q.options || []).map((opt, idx) => (
                                    <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer hover:text-indigo-700">
                                        <input
                                            type="checkbox"
                                            name={`q${q.id}`}
                                            value={idx}
                                            checked={selectedFor(q.id).includes(idx)}
                                            onChange={() => toggleMcq(q.id, idx)}
                                        />
                                        <span>{opt}</span>
                                    </label>
                                ))}
                                <p className="text-xs text-slate-400 mt-1">Select all answers that apply.</p>
                            </div>
                        )}

                        {(q.type === 'essay' || q.type === 'practical') && (
                            <textarea
                                name={`q${q.id}`}
                                aria-label={`Answer to question ${i + 1}`}
                                value={answers[q.id] || ''}
                                onChange={e => updateAnswer(q.id, e.target.value)}
                                onPaste={e => { e.preventDefault(); void logEvent('paste_blocked', { questionId: q.id }); }}
                                rows={q.type === 'practical' ? 10 : 6}
                                placeholder={q.type === 'practical' ? 'Type or write your answer here (paste is disabled)…' : 'Write your answer here…'}
                                className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        )}
                    </div>
                ))}
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <span className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">Answers auto-save every 15 seconds</span>
                <button
                    onClick={() => { if (window.confirm('Submit your exam for grading? You cannot change answers afterwards.')) void submitExam(); }}
                    disabled={submitting}
                    className="flex-1 sm:flex-none bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                    {submitting ? 'Submitting…' : 'Submit Exam'}
                </button>
            </div>
        </div>
    );
}
