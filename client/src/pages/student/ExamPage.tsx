import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, getAuthUser } from '../../lib/api';
import { startProctoring } from '../../lib/proctor';
import { isOnline, loadAnswers, persistAnswers, clearAnswers, loadDirty, persistDirty, clearDirty } from '../../lib/offline';
import { getSocket, joinExamRoom, leaveExamRoom } from '../../lib/socket';
import type { ExamMessagePayload, TimeExtendedPayload, AttemptUpdatePayload } from '../../lib/socket';

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
    end_time: string | null;
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
    const [answers, setAnswers] = useState<Record<number, string>>(() => loadAnswers(attemptId));
    const [phase, setPhase] = useState<'loading' | 'active' | 'locked'>('loading');
    const [autoReason, setAutoReason] = useState('');
    const [remaining, setRemaining] = useState(0);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [online, setOnline] = useState(() => isOnline());
    const [submitError, setSubmitError] = useState('');
    const [proctorStatus, setProctorStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [banner, setBanner] = useState('');

    const answersRef = useRef(answers);
    const dirtyRef = useRef<Set<number>>(loadDirty(attemptId));
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

    const flushSaves = useCallback(async (): Promise<boolean> => {
        if (!isOnline()) return false;
        let ok = true;
        for (const qid of Array.from(dirtyRef.current)) {
            dirtyRef.current.delete(qid);
            try {
                await api(`/api/attempts/${attemptId}/answer`, {
                    method: 'POST',
                    body: { questionId: qid, responseText: answersRef.current[qid] ?? '' }
                });
            } catch {
                dirtyRef.current.add(qid);
                ok = false;
            }
        }
        persistDirty(attemptId, dirtyRef.current);
        return ok;
    }, [attemptId]);

    const submitExam = useCallback(async () => {
        if (submittedRef.current) return;
        if (!isOnline()) {
            setSubmitting(false);
            setSubmitError("You're offline — your answers are saved on this device. Reconnect and press Submit again.");
            return;
        }
        submittedRef.current = true;
        setSubmitting(true);
        setSubmitError('');
        const flushed = await flushSaves();
        if (!flushed) {
            submittedRef.current = false;
            setSubmitting(false);
            setSubmitError('Could not sync all answers to the server yet. Reconnect and press Submit again.');
            return;
        }
        try {
            await api(`/api/attempts/${attemptId}/submit`, { method: 'POST' });
            clearAnswers(attemptId);
            clearDirty(attemptId);
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
                if (st.started_at) {
                    const limitMs = (st.time_limit_minutes || 0) * 60000;
                    const end = st.end_time
                        ? new Date(st.end_time).getTime()
                        : new Date(st.started_at).getTime() + limitMs;
                    deadlineRef.current = end;
                    setRemaining(Math.max(0, Math.round((end - Date.now()) / 1000)));
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
                setOnline(true);
                if (st.status === 'auto_submitted') lockExam(st.auto_submit_reason?.rule || 'Too many integrity violations');
                else if (st.status !== 'in_progress') lockExam('This attempt was already submitted');
            } catch {
                setOnline(false);
                // ignore polling errors
            }
        }, 8000);
        return () => clearInterval(iv);
    }, [attemptId, lockExam]);

    useEffect(() => {
        const onConn = () => setOnline(isOnline());
        window.addEventListener('online', onConn);
        window.addEventListener('offline', onConn);
        return () => {
            window.removeEventListener('online', onConn);
            window.removeEventListener('offline', onConn);
        };
    }, []);

    useEffect(() => {
        const me = getAuthUser();
        const socket = getSocket();
        if (!me || !socket) return;
        joinExamRoom(examId);
        const onMsg = (p: ExamMessagePayload) => {
            if (p.studentId !== null && p.studentId !== me.userId) return;
            setBanner(p.message);
        };
        const onExtend = (p: TimeExtendedPayload) => {
            if (p.attemptId !== Number(attemptId)) return;
            const end = new Date(p.endTime).getTime();
            deadlineRef.current = end;
            setRemaining(Math.max(0, Math.round((end - Date.now()) / 1000)));
        };
        const onUpdate = (p: AttemptUpdatePayload) => {
            if (p.attemptId !== Number(attemptId)) return;
            if (p.reopened && p.endTime && phaseRef.current === 'locked') {
                deadlineRef.current = new Date(p.endTime).getTime();
                setRemaining(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)));
                setBanner("Your instructor has reopened this exam — you can continue where you left off.");
                setAutoReason('');
                setPhase('active');
                void document.documentElement.requestFullscreen().catch(() => {});
            }
        };
        socket.on('exam_message', onMsg);
        socket.on('time_extended', onExtend);
        socket.on('attempt_update', onUpdate);
        return () => {
            leaveExamRoom(examId);
            socket.off('exam_message', onMsg);
            socket.off('time_extended', onExtend);
            socket.off('attempt_update', onUpdate);
        };
    }, [examId, attemptId]);

    useEffect(() => {
        if (!online || phaseRef.current !== 'active') return;
        if (deadlineRef.current && Date.now() >= deadlineRef.current && !submittedRef.current) {
            void submitExam();
        } else {
            void flushSaves();
        }
    }, [online, flushSaves, submitExam]);

    useEffect(() => {
        const iv = setInterval(() => {
            if (phaseRef.current === 'active') void flushSaves();
        }, 15000);
        return () => clearInterval(iv);
    }, [flushSaves]);

    useEffect(() => {
        const onVis = () => {
            if (document.hidden) {
                void logEvent('tab_switch');
                void flushSaves();
            }
        };
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
    }, [logEvent, flushSaves]);

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
        setAnswers(prev => {
            const next = { ...prev, [qid]: value };
            persistAnswers(attemptId, next);
            return next;
        });
        dirtyRef.current.add(qid);
        persistDirty(attemptId, dirtyRef.current);
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
        return <div className="p-8 text-slate-400">Loading exam…</div>;
    }

    if (phase === 'locked') {
        return (
            <div className="min-h-[70vh] flex items-center justify-center px-4">
                <div className={`glass-strong rounded-xl p-8 text-center border ${autoReason ? 'border-red-400/40 bg-red-950/30' : 'border-white/15'}`}>
                    <h1 className="text-xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-cyan-300 glow-text">
                        {autoReason ? 'Exam submitted automatically' : 'Exam submitted'}
                    </h1>
                    {autoReason && (
                        <p className="text-sm text-red-300 mb-4">Your exam was submitted automatically because {autoReason.toLowerCase()}.</p>
                    )}
                    <p className="text-sm text-slate-400 mb-6">Your answers up to this point have been saved.</p>
                    <div className="flex gap-3 justify-center flex-wrap">
                        <Link to={`/results/${attemptId}`} className="btn-primary px-4 py-2 text-sm">View status</Link>
                        <Link to="/student" className="btn-soft px-4 py-2 text-sm">Back to dashboard</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div onContextMenu={e => e.preventDefault()} className="pb-28">
            <div className="sticky top-0 z-10 bg-[#0d1122]/75 backdrop-blur-xl border-b border-white/10 text-white px-3 sm:px-6 py-3 flex items-center justify-between gap-2 shadow-lg shadow-black/20">
                <div className="text-sm min-w-0">
                    <span className="font-semibold">Exam in progress</span>
                    {proctorStatus !== 'idle' && (
                        <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full font-medium align-middle ${
                            proctorStatus === 'ready'
                                ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                                : proctorStatus === 'loading'
                                    ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
                                    : 'bg-white/5 border border-white/15 text-slate-300'
                        }`}>
                            {proctorStatus === 'ready' ? 'AI monitoring active' : proctorStatus === 'loading' ? 'Starting AI monitoring…' : 'AI monitoring unavailable'}
                        </span>
                    )}
                    {!online && (
                        <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full font-semibold align-middle bg-red-500/20 border border-red-400/50 text-red-200">Offline</span>
                    )}
                    <span className="ml-2 text-slate-400 hidden md:inline">Tab switches and full-screen exits are being recorded</span>
                </div>
                <div className={`px-3 py-1.5 rounded-lg font-mono font-bold text-base sm:text-lg shrink-0 border ${remaining <= 60 ? 'bg-red-500/20 border-red-400/50 text-red-200 shadow-lg shadow-red-500/30' : 'bg-sky-500/15 border-sky-400/30 text-sky-100'}`}>
                    {deadlineRef.current ? fmt(remaining) : '--:--'}
                </div>
            </div>

            <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
                {banner && (
                    <div className="glass-strong rounded-xl px-4 py-3 border border-sky-400/40 flex items-center justify-between gap-3">
                        <p className="text-sm text-sky-100 min-w-0">Instructor: {banner}</p>
                        <button onClick={() => setBanner('')} className="shrink-0 text-slate-400 hover:text-white text-lg leading-none">×</button>
                    </div>
                )}
                {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</div>}

                {!online && (
                    <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-400/40 rounded-lg px-4 py-3">
                        You're offline — answers are saved on this device and will sync automatically when you reconnect.
                    </div>
                )}

                {submitError && (
                    <div className="text-sm text-red-200 bg-red-500/10 border border-red-400/40 rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                        <span className="min-w-0">{submitError}</span>
                        <button onClick={() => void submitExam()} disabled={submitting} className="btn-primary px-3 py-1.5 text-xs shrink-0">
                            Retry submit
                        </button>
                    </div>
                )}

                {questions.map((q, i) => (
                    <div key={q.id} className="glass glass-glow rounded-xl p-5">
                        <div className="flex items-start justify-between gap-4 mb-3">
                            <p className="font-medium text-slate-100">{i + 1}. {q.prompt}</p>
                            <span className="shrink-0 chip bg-white/5 border border-white/10 text-slate-400">{q.points} pts · {q.type}</span>
                        </div>

                        {q.type === 'mcq' && (
                            <div className="space-y-1.5">
                                {(q.options || []).map((opt, idx) => (
                                    <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg px-2 -mx-2 py-1 transition-colors hover:bg-white/5">
                                        <input
                                            type="checkbox"
                                            name={`q${q.id}`}
                                            value={idx}
                                            checked={selectedFor(q.id).includes(idx)}
                                            onChange={() => toggleMcq(q.id, idx)}
                                            className="accent-sky-400"
                                        />
                                        <span>{opt}</span>
                                    </label>
                                ))}
                                <p className="text-xs text-slate-500 mt-1">Select all answers that apply.</p>
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
                                className="input-glass resize-none"
                            />
                        )}
                    </div>
                ))}
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-[#0d1122]/85 backdrop-blur-xl border-t border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <span className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">Auto-saves on this device & syncs to the server</span>
                <button
                    onClick={() => { if (window.confirm('Submit your exam for grading? You cannot change answers afterwards.')) void submitExam(); }}
                    disabled={submitting}
                    className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-6 py-2.5 rounded-lg font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/45 hover:brightness-110 disabled:opacity-50 transition-all duration-200"
                >
                    {submitting ? 'Submitting…' : 'Submit Exam'}
                </button>
            </div>
        </div>
    );
}
