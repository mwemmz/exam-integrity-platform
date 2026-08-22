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

interface DetailData {
    attempt: Attempt;
    answers: AnswerRow[];
    events: EventRow[];
    snapshots: SnapshotRow[];
}

export default function AttemptDetailPage() {
    const { examId = '', attemptId = '' } = useParams();
    const [data, setData] = useState<DetailData | null>(null);
    const [grades, setGrades] = useState<Record<number, { score: string; feedback: string }>>({});
    const [totalScore, setTotalScore] = useState<number | null>(null);
    const [savedMsg, setSavedMsg] = useState('');

    useEffect(() => {
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
    }, [examId, attemptId]);

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

    if (!data) return <div className="p-8 text-slate-500">Loading attempt…</div>;

    const { attempt } = data;

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <Link to={`/instructor/exams/${examId}/gradebook`} className="text-indigo-600 hover:underline text-sm font-medium">← Back to gradebook</Link>

            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold">{attempt.student_name}</h1>
                    <p className="text-sm text-slate-500">{attempt.exam_title}</p>
                </div>
                <div className="text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${attempt.status === 'auto_submitted' ? 'bg-red-100 text-red-700' : attempt.status === 'submitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {attempt.status.replace('_', ' ')}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">{attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : 'not submitted'}</p>
                    <p className="text-lg font-bold">{totalScore ?? '—'} pts</p>
                    {savedMsg && <span className="text-xs text-emerald-600 font-medium">{savedMsg}</span>}
                </div>
            </div>

            <section className="space-y-3">
                <h2 className="font-semibold">Answers</h2>
                {data.answers.map((a, i) => (
                    <div key={a.question_id} className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <p className="font-medium text-sm">{i + 1}. {a.prompt}</p>
                            <span className="shrink-0 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{a.points} pts · {a.type}</span>
                        </div>

                        {a.type === 'mcq' ? (
                            <div className="space-y-1">
                                {(a.options || []).map((opt, idx) => {
                                    let chosen: number[] = [];
                                    try { chosen = JSON.parse(a.response_text || '[]'); } catch { chosen = []; }
                                    const isCorrect = (a.correct_answer || []).includes(idx);
                                    const isChosen = Array.isArray(chosen) && chosen.includes(idx);
                                    return (
                                        <p key={idx} className={`text-sm ${isCorrect ? 'text-emerald-700' : isChosen ? 'text-red-600' : 'text-slate-500'}`}>
                                            {isCorrect ? '✓' : isChosen ? '✗' : '·'} {opt}
                                            {isCorrect && <span className="ml-1.5 text-xs">(correct)</span>}
                                        </p>
                                    );
                                })}
                                <p className="text-xs text-slate-400 mt-1">Auto-score: {a.auto_score ?? 0} / {a.points}</p>
                            </div>
                        ) : (
                            <>
                                <pre className="text-xs bg-slate-50 border border-slate-100 rounded-lg p-3 whitespace-pre-wrap font-sans text-slate-700 mb-2 max-h-60 overflow-y-auto">
                                    {a.response_text || '(no answer)'}
                                </pre>
                                <div className="flex items-end gap-2">
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Score (max {a.points})</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={a.points}
                                            value={grades[a.question_id]?.score ?? ''}
                                            onChange={e => setGrades(g => ({ ...g, [a.question_id]: { ...g[a.question_id], score: e.target.value } }))}
                                            className="w-24 border border-slate-300 rounded-lg p-2 text-sm"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs text-slate-500 mb-1">Feedback</label>
                                        <textarea
                                            rows={2}
                                            value={grades[a.question_id]?.feedback ?? ''}
                                            onChange={e => setGrades(g => ({ ...g, [a.question_id]: { ...g[a.question_id], feedback: e.target.value } }))}
                                            className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                                        />
                                    </div>
                                    <button onClick={() => void saveGrade(a.question_id)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">Save</button>
                                </div>
                                {a.feedback && !grades[a.question_id]?.feedback && (
                                    <p className="text-xs text-slate-400 mt-1 italic">Previous feedback: “{a.feedback}”</p>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </section>

            <section>
                <h2 className="font-semibold mb-2">Integrity Timeline</h2>
                {data.events.length === 0 ? (
                    <p className="text-sm text-slate-400">No integrity events recorded.</p>
                ) : (
                    <div className="space-y-1">
                        {data.events.map(ev => {
                            const flagged = ev.event_type === 'auto_submit_triggered';
                            return (
                                <div key={ev.id} className={`rounded-lg border px-3 py-2 text-sm flex items-center justify-between ${flagged ? 'border-red-300 bg-red-50 text-red-800 font-medium' : 'border-slate-200 bg-white'}`}>
                                    <span>{ev.event_type.replace(/_/g, ' ')}</span>
                                    <span className="text-xs opacity-70">
                                        {ev.metadata && Object.keys(ev.metadata).length > 0 ? JSON.stringify(ev.metadata) : ''}
                                        {'  '}{new Date(ev.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {data.snapshots.length > 0 && (
                <section>
                    <h2 className="font-semibold mb-2">Webcam Snapshots ({data.snapshots.length})</h2>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                        {data.snapshots.map(s => (
                            <figure key={s.id} className="shrink-0">
                                <img src={fileUrl(s.image_url)} alt={`snapshot at ${s.captured_at}`} className="h-28 w-auto rounded-lg border border-slate-200" />
                                <figcaption className="text-[10px] text-slate-400 mt-1">{new Date(s.captured_at).toLocaleTimeString()}</figcaption>
                            </figure>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
