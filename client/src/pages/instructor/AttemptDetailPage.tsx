import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fileUrl } from '../../lib/api';

interface Attempt {
    id: number;
    status: string;
    total_score: number | null;
    submitted_at: string | null;
    student_name: string;
    exam_title: string;
}

interface AnswerRow {
    question_id: number;
    type: string;
    prompt: string;
    points: number;
    options?: string[] | null;
    correct_answer?: number[] | null;
    response_text?: string | null;
    auto_score?: number | null;
    manual_score?: number | null;
    feedback?: string | null;
}

interface EventRow {
    id: number;
    event_type: string;
    timestamp: string;
    metadata?: Record<string, unknown> | null;
}

interface SnapshotRow {
    id: number;
    image_url: string;
    captured_at: string;
}

interface NoteRow {
    id: number;
    note_text: string;
    created_at: string;
    instructor_name: string;
}

interface DetailData {
    attempt: Attempt;
    answers: AnswerRow[];
    events: EventRow[];
    snapshots: SnapshotRow[];
    notes: NoteRow[];
}

export default function AttemptDetailPage() {
    const { examId = '', attemptId = '' } = useParams();
    const [data, setData] = useState<DetailData | null>(null);
    const [grades, setGrades] = useState<Record<number, { score: string; feedback: string }>>({});
    const [totalScore, setTotalScore] = useState<number | null>(null);
    const [savedMsg, setSavedMsg] = useState('');
    const [noteText, setNoteText] = useState('');
    const [noteBusy, setNoteBusy] = useState(false);
    const [reopenBusy, setReopenBusy] = useState(false);
    const [msg, setMsg] = useState('');

    const load = () => {
        api<DetailData>(`/api/instructor/details/exams/${examId}/attempts/${attemptId}`)
            .then(d => {
                setData(d);
                setTotalScore(d.attempt.total_score);
                const init: Record<number, { score: string; feedback: string }> = {};
                d.answers.forEach(a => {
                    if (a.type !== 'mcq') {
                        init[a.question_id] = {
                            score: a.manual_score != null ? String(a.manual_score) : '',
                            feedback: a.feedback || ''
                        };
                    }
                });
                setGrades(init);
            })
            .catch(err => console.error(err instanceof Error ? err.message : 'Failed to load attempt'));
    };

    useEffect(load, [examId, attemptId]);

    const saveGrade = async (questionId: number) => {
        const g = grades[questionId];
        try {
            await api<{ totalScore: number }>(`/api/instructor/attempts/${attemptId}/grade`, {
                method: 'POST',
                body: { questionId, score: g.score === '' ? null : Number(g.score), feedback: g.feedback }
            });
            setSavedMsg('Saved');
            setTimeout(() => setSavedMsg(''), 2000);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to save grade');
        }
    };

    const addNote = async () => {
        if (!noteText.trim()) return;
        setNoteBusy(true);
        try {
            await api(`/api/instructor/attempts/${attemptId}/notes`, {
                method: 'POST',
                body: { noteText: noteText.trim() }
            });
            setNoteText('');
            load();
        } catch (err) {
            setMsg(err instanceof Error ? err.message : 'Failed to add note');
        } finally {
            setNoteBusy(false);
        }
    };

    const reopen = async () => {
        const reason = window.prompt('Reason for reopening this attempt (required):', '');
        if (reason === null) return;
        if (!reason.trim()) { alert('A reason is required.'); return; }
        setReopenBusy(true);
        try {
            await api(`/api/instructor/attempts/${attemptId}/reopen`, {
                method: 'POST',
                body: { reason: reason.trim() }
            });
            setMsg('Attempt reopened — the student can now resume from where they left off.');
            setTimeout(() => setMsg(''), 4000);
            load();
        } catch (err) {
            setMsg(err instanceof Error ? err.message : 'Failed to reopen attempt');
        } finally {
            setReopenBusy(false);
        }
    };

    if (!data) return <div className="p-8 text-slate-400">Loading attempt…</div>;

    const { attempt } = data;

    const eventStyles: Record<string, string> = {
        auto_submit_triggered: 'border-red-400/40 bg-red-500/15 text-red-200 font-medium',
        face_missing: 'border-red-400/40 bg-red-500/15 text-red-200',
        multi_face: 'border-red-400/40 bg-red-500/15 text-red-200',
        phone_detected: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
        voice_detected: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
        gaze_away: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
        tab_switch: 'border-orange-400/30 bg-orange-500/10 text-orange-200',
        fullscreen_exit: 'border-orange-400/30 bg-orange-500/10 text-orange-200',
        paste_blocked: 'border-white/10 bg-white/5 text-slate-300'
    };
    const eventLabels: Record<string, string> = {
        auto_submit_triggered: 'Auto-submitted (rule)',
        face_missing: 'No face detected',
        multi_face: 'Multiple faces',
        phone_detected: 'Phone / media device',
        voice_detected: 'Voice / loud noise',
        gaze_away: 'Looked away from screen',
        tab_switch: 'Tab switch',
        fullscreen_exit: 'Full-screen exit',
        paste_blocked: 'Paste blocked'
    };
    const flagEventTypes: Array<keyof typeof eventLabels> = ['auto_submit_triggered', 'face_missing', 'multi_face', 'phone_detected', 'voice_detected', 'gaze_away'];

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
            <Link to={`/instructor/exams/${examId}/gradebook`} className="text-sky-300 hover:text-sky-200 hover:underline text-sm font-medium">← Back to gradebook</Link>

            <div className="glass-strong glass-glow rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-cyan-300 glow-text">{attempt.student_name}</h1>
                    <p className="text-sm text-slate-400 break-words">{attempt.exam_title}</p>
                </div>
                <div className="text-right">
                    <span className={`chip ${attempt.status === 'auto_submitted' ? 'bg-red-500/15 border border-red-400/40 text-red-300' : attempt.status === 'submitted' ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300' : 'bg-sky-500/15 border border-sky-400/40 text-sky-300'}`}>
                        {attempt.status.replace('_', ' ')}
                    </span>
                    {attempt.status === 'auto_submitted' && (
                        <div className="mt-2">
                            <button onClick={() => void reopen()} disabled={reopenBusy} className="btn-secondary px-4 py-2 text-xs">
                                {reopenBusy ? 'Reopening…' : 'Un-flag and reopen'}
                            </button>
                            <p className="text-[11px] text-slate-500 mt-1">Lets the student resume; reason is logged.</p>
                        </div>
                    )}
                    <p className="text-xs text-slate-500 mt-1">{attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : 'not submitted'}</p>
                    <p className="text-lg font-bold">{totalScore ?? '—'} pts</p>
                    {savedMsg && <span className="text-xs text-emerald-300 font-medium">{savedMsg}</span>}
                </div>
            </div>

            {msg && <div className={`text-sm rounded-lg px-4 py-3 border ${msg.startsWith('Failed') ? 'text-red-300 bg-red-500/10 border-red-400/30' : 'text-emerald-200 bg-emerald-500/10 border-emerald-400/40'}`}>{msg}</div>}

            <section className="space-y-3">
                <h2 className="font-semibold text-slate-100">Answers</h2>
                {data.answers.map((a, i) => (
                    <div key={a.question_id} className="glass glass-glow rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <p className="font-medium text-sm text-slate-100">{i + 1}. {a.prompt}</p>
                            <span className="shrink-0 chip bg-white/5 border border-white/10 text-slate-400">{a.points} pts · {a.type}</span>
                        </div>

                        {a.type === 'mcq' ? (
                            <div className="space-y-1">
                                {(a.options || []).map((opt, idx) => {
                                    let chosen: number[] = [];
                                    try { chosen = JSON.parse(a.response_text || '[]'); } catch { chosen = []; }
                                    const isCorrect = (a.correct_answer || []).includes(idx);
                                    const isChosen = Array.isArray(chosen) && chosen.includes(idx);
                                    return (
                                        <p key={idx} className={`text-sm ${isCorrect ? 'text-emerald-300' : isChosen ? 'text-red-300' : 'text-slate-400'}`}>
                                            {isCorrect ? '✓' : isChosen ? '✗' : '·'} {opt}
                                            {isCorrect && <span className="ml-1.5 text-xs">(correct)</span>}
                                        </p>
                                    );
                                })}
                                <p className="text-xs text-slate-500 mt-1">Auto-score: {a.auto_score ?? 0} / {a.points}</p>
                            </div>
                        ) : (
                            <>
                                <pre className="text-xs bg-black/25 border border-white/10 rounded-lg p-3 whitespace-pre-wrap font-sans text-slate-300 mb-2 max-h-60 overflow-y-auto">
                                    {a.response_text || '(no answer)'}
                                </pre>
                                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                                    <div className="sm:w-24">
                                        <label htmlFor={`score-${a.question_id}`} className="block text-xs text-slate-400 mb-1">Score (max {a.points})</label>
                                        <input
                                            id={`score-${a.question_id}`}
                                            name={`score-${a.question_id}`}
                                            type="number"
                                            min={0}
                                            max={a.points}
                                            value={grades[a.question_id]?.score ?? ''}
                                            onChange={e => setGrades(g => ({ ...g, [a.question_id]: { ...g[a.question_id], score: e.target.value } }))}
                                            className="input-glass"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label htmlFor={`feedback-${a.question_id}`} className="block text-xs text-slate-400 mb-1">Feedback</label>
                                        <textarea
                                            id={`feedback-${a.question_id}`}
                                            name={`feedback-${a.question_id}`}
                                            rows={2}
                                            value={grades[a.question_id]?.feedback ?? ''}
                                            onChange={e => setGrades(g => ({ ...g, [a.question_id]: { ...g[a.question_id], feedback: e.target.value } }))}
                                            className="input-glass resize-none"
                                        />
                                    </div>
                                    <button onClick={() => void saveGrade(a.question_id)} className="btn-primary px-4 py-2 text-sm self-start sm:self-auto">Save</button>
                                </div>
                                {a.feedback && !grades[a.question_id]?.feedback && (
                                    <p className="text-xs text-slate-500 mt-1 italic">Previous feedback: “{a.feedback}”</p>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </section>

            <section>
                <h2 className="font-semibold mb-2 text-slate-100">Integrity Timeline</h2>
                {data.events.length === 0 ? (
                    <p className="text-sm text-slate-400">No integrity events recorded.</p>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {flagEventTypes.map(t => {
                                const n = data.events.filter(e => e.event_type === t).length;
                                if (!n) return null;
                                const red = t === 'auto_submit_triggered' || t === 'face_missing' || t === 'multi_face';
                                return <span key={t} className={`chip border ${red ? 'bg-red-500/15 border-red-400/40 text-red-300' : 'bg-amber-500/15 border-amber-400/40 text-amber-300'}`}>{eventLabels[t]}: {n}</span>;
                            })}
                        </div>
                        <div className="space-y-1">
                            {data.events.map(ev => (
                                <div key={ev.id} className={`rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-x-3 gap-y-1 ${eventStyles[ev.event_type] || 'border-white/10 bg-white/5 text-slate-300'}`}>
                                    <span className="min-w-0">{eventLabels[ev.event_type] || ev.event_type.replace(/_/g, ' ')}</span>
                                    <span className="text-xs opacity-70 text-right ml-auto">
                                        {ev.metadata && Object.keys(ev.metadata).length > 0 ? JSON.stringify(ev.metadata) : ''}
                                        {'  '}{new Date(ev.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </section>

            {data.snapshots.length > 0 && (
                <section>
                    <h2 className="font-semibold mb-2 text-slate-100">Webcam Snapshots ({data.snapshots.length})</h2>
                    <div className="flex gap-3 scroll-x pb-2">
                        {data.snapshots.map(s => (
                            <figure key={s.id} className="shrink-0">
                                <img src={fileUrl(s.image_url)} alt={`snapshot at ${s.captured_at}`} className="h-28 w-auto rounded-lg border border-white/15" />
                                <figcaption className="text-[10px] text-slate-500 mt-1">{new Date(s.captured_at).toLocaleTimeString()}</figcaption>
                            </figure>
                        ))}
                    </div>
                </section>
            )}

            <section className="glass-strong glass-glow rounded-xl p-5 space-y-3">
                <h2 className="font-semibold text-slate-100">Instructor notes (private)</h2>
                <p className="text-xs text-slate-500">Only instructors at this institution can see these — never the student.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void addNote(); }} placeholder="Add a note…" className="input-glass flex-1" />
                    <button onClick={() => void addNote()} disabled={noteBusy || !noteText.trim()} className="btn-primary px-4 py-2 text-sm shrink-0">
                        {noteBusy ? 'Adding…' : 'Add note'}
                    </button>
                </div>
                <div className="space-y-2">
                    {data.notes.length === 0 && <p className="text-xs text-slate-400">No notes yet.</p>}
                    {data.notes.map(n => (
                        <div key={n.id} className="glass rounded-lg px-3 py-2">
                            <p className="text-sm text-slate-200 whitespace-pre-wrap">{n.note_text}</p>
                            <p className="text-[11px] text-slate-500 mt-1">{n.instructor_name} · {new Date(n.created_at).toLocaleString()}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}