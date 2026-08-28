import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

interface Exam {
    id: number;
    title: string;
    description: string | null;
    status: string;
    time_limit_minutes: number | null;
    grades_released: boolean;
}

interface DraftQ {
    type: 'mcq' | 'essay' | 'practical';
    prompt: string;
    points: number;
    optionsText: string;
    correct: number[];
}

export default function InstructorDashboard() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [timeLimit, setTimeLimit] = useState('60');
    const [questions, setQuestions] = useState<DraftQ[]>([]);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const loadExams = useCallback(() => {
        api<Exam[]>('/api/exams').then(setExams).catch(err => setError(err instanceof Error ? err.message : 'Failed to load exams'));
    }, []);

    useEffect(loadExams, [loadExams]);

    const addQuestion = (type: DraftQ['type']) => {
        setQuestions(qs => [...qs, { type, prompt: '', points: 10, optionsText: '', correct: [] }]);
    };

    const updateQ = (i: number, patch: Partial<DraftQ>) => {
        setQuestions(qs => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
    };

    const createExam = async () => {
        if (!title.trim() || questions.length === 0) {
            setError('A title and at least one question are required.');
            return;
        }
        for (let i = 0; i < questions.length; i++) {
            if (!questions[i].prompt.trim()) { setError(`Question ${i + 1} needs a prompt.`); return; }
            if (questions[i].type === 'mcq' && questions[i].correct.length === 0) {
                setError(`MCQ question ${i + 1} needs at least one correct answer marked.`);
                return;
            }
        }
        setSaving(true);
        setError('');
        try {
            await api('/api/exams', {
                method: 'POST',
                body: {
                    title,
                    description,
                    timeLimitMinutes: Number(timeLimit) || null,
                    randomizeOrder: false,
                    questions: questions.map(q => ({
                        type: q.type,
                        prompt: q.prompt,
                        points: q.points,
                        options: q.type === 'mcq'
                            ? q.optionsText.split(',').map(s => s.trim()).filter(Boolean)
                            : undefined,
                        correctAnswer: q.type === 'mcq' ? [...q.correct].sort((a, b) => a - b) : undefined
                    }))
                }
            });
            setTitle(''); setDescription(''); setTimeLimit('60'); setQuestions([]); setShowForm(false);
            loadExams();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create exam');
        } finally {
            setSaving(false);
        }
    };

    const togglePublish = async (e: Exam) => {
        try {
            await api(`/api/exams/${e.id}/publish`, { method: 'POST', body: { published: e.status !== 'published' } });
            loadExams();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update exam');
        }
    };

    const toggleRelease = async (e: Exam) => {
        try {
            await api(`/api/instructor/exams/${e.id}/release`, { method: 'POST', body: { gradesReleased: !e.grades_released } });
            loadExams();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update exam');
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-300 to-cyan-300 text-transparent bg-clip-text glow-text">Instructor Dashboard</h1>
                <button
                    onClick={() => setShowForm(v => !v)}
                    className={showForm ? 'btn-soft px-4 py-2 text-sm' : 'btn-primary px-4 py-2 text-sm'}
                >
                    {showForm ? 'Cancel' : '+ New Exam'}
                </button>
            </div>

            {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</div>}

            {showForm && (
                <div className="glass-strong glass-glow rounded-xl p-5 space-y-4">
                    <h2 className="font-semibold text-slate-100">Create Exam</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input id="exam-title" name="title" aria-label="Exam title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Exam title" className="input-glass col-span-2" />
                        <input id="exam-time-limit" name="timeLimitMinutes" type="number" min="1" aria-label="Time limit in minutes" value={timeLimit} onChange={e => setTimeLimit(e.target.value)} placeholder="Time limit (min)" className="input-glass" />
                        <textarea id="exam-description" name="description" aria-label="Exam description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Instructions / description" rows={2} className="input-glass col-span-3 resize-none" />
                    </div>

                    <div className="space-y-3">
                        {questions.map((q, i) => (
                            <div key={i} className="glass rounded-lg p-4 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`chip ${q.type === 'mcq' ? 'bg-blue-500/15 border border-blue-400/40 text-blue-300' : q.type === 'essay' ? 'bg-pink-500/15 border border-pink-400/40 text-pink-300' : 'bg-orange-500/15 border border-orange-400/40 text-orange-300'}`}>{q.type}</span>
                                    <span className="text-xs text-slate-500">Question {i + 1}</span>
                                    <div className="ml-auto flex items-center gap-2">
                                        <label htmlFor={`q-${i}-points`} className="text-xs text-slate-400">Points</label>
                                        <input id={`q-${i}-points`} name={`q-${i}-points`} type="number" min="1" aria-label={`Points for question ${i + 1}`} value={q.points} onChange={e => updateQ(i, { points: Number(e.target.value) || 1 })} className="input-glass w-16 py-1 text-xs" />
                                        <button onClick={() => setQuestions(qs => qs.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 text-xs font-medium">Remove</button>
                                    </div>
                                </div>
                                <input id={`q-${i}-prompt`} name={`q-${i}-prompt`} aria-label={`Question ${i + 1} prompt`} value={q.prompt} onChange={e => updateQ(i, { prompt: e.target.value })} placeholder={`Question ${i + 1} prompt`} className="input-glass" />
                                {q.type === 'mcq' && (
                                    <>
                                        <input id={`q-${i}-options`} name={`q-${i}-options`} aria-label={`Question ${i + 1} options`} value={q.optionsText} onChange={e => updateQ(i, { optionsText: e.target.value, correct: [] })} placeholder="Options, comma-separated (e.g. 4, 5, 22)" className="input-glass" />
                                        {q.optionsText.split(',').map(s => s.trim()).filter(Boolean).length > 0 && (
                                            <div className="flex flex-wrap gap-3">
                                                {q.optionsText.split(',').map(s => s.trim()).filter(Boolean).map((opt, idx) => (
                                                    <label key={idx} className="flex items-center gap-1.5 text-xs bg-white/5 border border-white/15 rounded-full px-3 py-1 cursor-pointer hover:border-sky-400/50 transition-colors">
                                                        <input type="checkbox" name={`q-${i}-correct`} value={idx} checked={q.correct.includes(idx)} onChange={() => updateQ(i, { correct: q.correct.includes(idx) ? q.correct.filter(x => x !== idx) : [...q.correct, idx] })} className="accent-sky-400" />
                                                        <span>{opt}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-xs text-slate-500">Check the box next to each correct option.</p>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <button onClick={() => addQuestion('mcq')} className="btn-soft px-3 py-1.5 text-xs border-blue-400/30 text-blue-300">+ MCQ</button>
                        <button onClick={() => addQuestion('essay')} className="btn-soft px-3 py-1.5 text-xs border-pink-400/30 text-pink-300">+ Essay</button>
                        <button onClick={() => addQuestion('practical')} className="btn-soft px-3 py-1.5 text-xs border-orange-400/30 text-orange-300">+ Practical</button>
                    </div>

                    <button onClick={createExam} disabled={saving} className="btn-primary px-5 py-2 text-sm">
                        {saving ? 'Creating…' : 'Create Exam'}
                    </button>
                </div>
            )}

            <div className="space-y-3">
                {exams.length === 0 && !showForm && (
                    <p className="text-slate-400 text-sm">No exams yet — click “+ New Exam” to build your first one.</p>
                )}
                {exams.map(exam => (
                    <div key={exam.id} className="glass glass-glow rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="font-semibold break-words">{exam.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5 break-words">
                                {exam.time_limit_minutes ? `${exam.time_limit_minutes} min · ` : ''}{exam.description || ''}
                            </p>
                            <div className="flex gap-2 mt-1.5 flex-wrap">
                                <span className={`chip ${exam.status === 'published' ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300' : 'bg-white/5 border border-white/10 text-slate-400'}`}>
                                    {exam.status}
                                </span>
                                <span className={`chip ${exam.grades_released ? 'bg-sky-500/15 border border-sky-400/40 text-sky-300' : 'bg-amber-500/10 border border-amber-400/30 text-amber-300'}`}>
                                    {exam.grades_released ? 'grades released' : 'grades hidden'}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Link to={`/instructor/exams/${exam.id}/gradebook`} className="btn-soft px-3 py-1.5 text-xs">Gradebook</Link>
                            <button onClick={() => toggleRelease(exam)} className="btn-soft px-3 py-1.5 text-xs border-sky-400/30 text-sky-300">
                                {exam.grades_released ? 'Hide grades' : 'Release grades'}
                            </button>
                            <button onClick={() => togglePublish(exam)} className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all duration-200 ${exam.status === 'published'
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/45 hover:brightness-110'
                                : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/45 hover:brightness-110'}`}>
                                {exam.status === 'published' ? 'Unpublish' : 'Publish'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}