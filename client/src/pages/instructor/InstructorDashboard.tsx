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
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Instructor Dashboard</h1>
                <button
                    onClick={() => setShowForm(v => !v)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                    {showForm ? 'Cancel' : '+ New Exam'}
                </button>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

            {showForm && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <h2 className="font-semibold">Create Exam</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input id="exam-title" name="title" aria-label="Exam title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Exam title" className="col-span-2 border border-slate-300 rounded-lg p-2 text-sm" />
                        <input id="exam-time-limit" name="timeLimitMinutes" type="number" min="1" aria-label="Time limit in minutes" value={timeLimit} onChange={e => setTimeLimit(e.target.value)} placeholder="Time limit (min)" className="border border-slate-300 rounded-lg p-2 text-sm" />
                        <textarea id="exam-description" name="description" aria-label="Exam description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Instructions / description" rows={2} className="col-span-3 border border-slate-300 rounded-lg p-2 text-sm" />
                    </div>

                    <div className="space-y-3">
                        {questions.map((q, i) => (
                            <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50">
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${q.type === 'mcq' ? 'bg-blue-100 text-blue-700' : q.type === 'essay' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{q.type}</span>
                                    <span className="text-xs text-slate-400">Question {i + 1}</span>
                                    <div className="ml-auto flex items-center gap-2">
                                        <label htmlFor={`q-${i}-points`} className="text-xs text-slate-500">Points</label>
                                        <input id={`q-${i}-points`} name={`q-${i}-points`} type="number" min="1" aria-label={`Points for question ${i + 1}`} value={q.points} onChange={e => updateQ(i, { points: Number(e.target.value) || 1 })} className="w-16 border border-slate-300 rounded p-1 text-xs" />
                                        <button onClick={() => setQuestions(qs => qs.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
                                    </div>
                                </div>
                                <input id={`q-${i}-prompt`} name={`q-${i}-prompt`} aria-label={`Question ${i + 1} prompt`} value={q.prompt} onChange={e => updateQ(i, { prompt: e.target.value })} placeholder={`Question ${i + 1} prompt`} className="w-full border border-slate-300 rounded p-2 text-sm" />
                                {q.type === 'mcq' && (
                                    <>
                                        <input id={`q-${i}-options`} name={`q-${i}-options`} aria-label={`Question ${i + 1} options`} value={q.optionsText} onChange={e => updateQ(i, { optionsText: e.target.value, correct: [] })} placeholder="Options, comma-separated (e.g. 4, 5, 22)" className="w-full border border-slate-300 rounded p-2 text-sm" />
                                        {q.optionsText.split(',').map(s => s.trim()).filter(Boolean).length > 0 && (
                                            <div className="flex flex-wrap gap-3">
                                                {q.optionsText.split(',').map(s => s.trim()).filter(Boolean).map((opt, idx) => (
                                                    <label key={idx} className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-full px-3 py-1 cursor-pointer">
                                                        <input type="checkbox" name={`q-${i}-correct`} value={idx} checked={q.correct.includes(idx)} onChange={() => updateQ(i, { correct: q.correct.includes(idx) ? q.correct.filter(x => x !== idx) : [...q.correct, idx] })} />
                                                        <span>{opt}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-xs text-slate-400">Check the box next to each correct option.</p>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <button onClick={() => addQuestion('mcq')} className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-100">+ MCQ</button>
                        <button onClick={() => addQuestion('essay')} className="bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-100">+ Essay</button>
                        <button onClick={() => addQuestion('practical')} className="bg-orange-50 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-orange-100">+ Practical</button>
                    </div>

                    <button onClick={createExam} disabled={saving} className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                        {saving ? 'Creating…' : 'Create Exam'}
                    </button>
                </div>
            )}

            <div className="space-y-3">
                {exams.length === 0 && !showForm && (
                    <p className="text-slate-500 text-sm">No exams yet — click “+ New Exam” to build your first one.</p>
                )}
                {exams.map(exam => (
                    <div key={exam.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="font-semibold">{exam.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {exam.time_limit_minutes ? `${exam.time_limit_minutes} min · ` : ''}{exam.description || ''}
                            </p>
                            <div className="flex gap-2 mt-1.5">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${exam.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {exam.status}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${exam.grades_released ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-50 text-amber-700'}`}>
                                    {exam.grades_released ? 'grades released' : 'grades hidden'}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Link to={`/instructor/exams/${exam.id}/gradebook`} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700">Gradebook</Link>
                            <button onClick={() => toggleRelease(exam)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700">
                                {exam.grades_released ? 'Hide grades' : 'Release grades'}
                            </button>
                            <button onClick={() => togglePublish(exam)} className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white ${exam.status === 'published' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                                {exam.status === 'published' ? 'Unpublish' : 'Publish'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
