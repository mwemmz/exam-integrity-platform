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
    assigned_groups?: string[];
}

interface DraftQ {
    type: 'mcq' | 'essay' | 'practical';
    prompt: string;
    points: number;
    optionsText: string;
    correct: number[];
}

interface Group {
    id: number;
    name: string;
    member_count?: number;
}

interface Student {
    id: number;
    name: string;
    email: string;
}

interface BankItem {
    id: number;
    type: string;
    prompt: string;
    points: number;
    options?: string[] | null;
    correct_answer?: number[] | null;
    instructor_name: string;
}

interface Accommodation {
    exam_id: number;
    student_id: number;
    extra_time_minutes: number | null;
    custom_start_at: string | null;
    custom_end_at: string | null;
    student_name: string;
    student_email: string;
}

export default function InstructorDashboard() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [error, setError] = useState('');

    // builder
    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [timeLimit, setTimeLimit] = useState('60');
    const [questions, setQuestions] = useState<DraftQ[]>([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
    const [saving, setSaving] = useState(false);

    // question bank
    const [bankOpen, setBankOpen] = useState(false);
    const [bankItems, setBankItems] = useState<BankItem[]>([]);
    const [bankType, setBankType] = useState('');
    const [bankSearch, setBankSearch] = useState('');
    const [bankLoading, setBankLoading] = useState(false);

    // groups management
    const [showGroups, setShowGroups] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [groupMembers, setGroupMembers] = useState<Record<number, number[]>>({});

    // accommodations
    const [accForExam, setAccForExam] = useState<Exam | null>(null);
    const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
    const [accStudentId, setAccStudentId] = useState<number | null>(null);
    const [accExtra, setAccExtra] = useState('0');
    const [accStart, setAccStart] = useState('');
    const [accEnd, setAccEnd] = useState('');

    const loadExams = useCallback(() => {
        api<Exam[]>('/api/exams').then(setExams).catch(err => setError(err instanceof Error ? err.message : 'Failed to load exams'));
    }, []);

    const loadGroups = useCallback(() => {
        api<Group[]>('/api/instructor/groups').then(setGroups).catch(() => {});
    }, []);

    const loadStudents = useCallback(() => {
        api<Student[]>('/api/instructor/students').then(setStudents).catch(() => {});
    }, []);

    useEffect(loadExams, [loadExams]);
    useEffect(loadGroups, [loadGroups]);
    useEffect(loadStudents, [loadStudents]);

    const loadBank = useCallback(async () => {
        setBankLoading(true);
        try {
            const params = new URLSearchParams();
            if (bankType) params.set('type', bankType);
            if (bankSearch) params.set('search', bankSearch);
            setBankItems(await api<BankItem[]>(`/api/instructor/bank?${params.toString()}`));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load question bank');
        } finally {
            setBankLoading(false);
        }
    }, [bankType, bankSearch]);

    useEffect(() => {
        if (bankOpen) void loadBank();
    }, [bankOpen, loadBank]);

    const addQuestion = (type: DraftQ['type']) => {
        setQuestions(qs => [...qs, { type, prompt: '', points: 10, optionsText: '', correct: [] }]);
    };

    const updateQ = (i: number, patch: Partial<DraftQ>) => {
        setQuestions(qs => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
    };

    const saveQToBank = async (i: number) => {
        const q = questions[i];
        if (!q.prompt.trim()) { setError('Question has no prompt to save.'); return; }
        try {
            await api('/api/instructor/bank', {
                method: 'POST',
                body: {
                    type: q.type,
                    prompt: q.prompt,
                    points: q.points,
                    options: q.type === 'mcq' ? q.optionsText.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                    correctAnswer: q.type === 'mcq' ? [...q.correct].sort((a, b) => a - b) : undefined
                }
            });
            setError('Saved to question bank.');
            setTimeout(() => setError(''), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save to bank');
        }
    };

    const importFromBank = (item: BankItem) => {
        const q: DraftQ = {
            type: item.type as DraftQ['type'],
            prompt: item.prompt,
            points: item.points,
            optionsText: Array.isArray(item.options) ? item.options.join(', ') : '',
            correct: Array.isArray(item.correct_answer) ? item.correct_answer : []
        };
        setQuestions(qs => [...qs, q]);
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
                    groupIds: selectedGroupIds,
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
            setTitle(''); setDescription(''); setTimeLimit('60'); setQuestions([]); setSelectedGroupIds([]); setShowForm(false);
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

    const duplicateExam = async (e: Exam) => {
        try {
            await api(`/api/exams/${e.id}/duplicate`, { method: 'POST' });
            loadExams();
            setError('Exam duplicated — edit the copy, then publish.');
            setTimeout(() => setError(''), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to duplicate exam');
        }
    };

    const openAccommodations = async (e: Exam) => {
        setAccForExam(e);
        setAccStudentId(null); setAccExtra('0'); setAccStart(''); setAccEnd('');
        try {
            setAccommodations(await api<Accommodation[]>(`/api/instructor/exams/${e.id}/accommodations`));
        } catch {
            setAccommodations([]);
        }
    };

    const saveAccommodation = async () => {
        if (!accForExam || !accStudentId) return;
        try {
            await api(`/api/instructor/exams/${accForExam.id}/accommodations`, {
                method: 'POST',
                body: {
                    studentId: accStudentId,
                    extraTimeMinutes: Number(accExtra) || 0,
                    customStartAt: accStart ? new Date(accStart).toISOString() : null,
                    customEndAt: accEnd ? new Date(accEnd).toISOString() : null
                }
            });
            setAccExtra('0'); setAccStart(''); setAccEnd('');
            setAccommodations(await api<Accommodation[]>(`/api/instructor/exams/${accForExam.id}/accommodations`));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save accommodation');
        }
    };

    const removeAccommodation = async (studentId: number) => {
        if (!accForExam) return;
        try {
            await api(`/api/instructor/exams/${accForExam.id}/accommodations/${studentId}`, { method: 'DELETE' });
            setAccommodations(await api<Accommodation[]>(`/api/instructor/exams/${accForExam.id}/accommodations`));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to remove accommodation');
        }
    };

    const createGroup = async () => {
        if (!newGroupName.trim()) return;
        try {
            await api('/api/instructor/groups', { method: 'POST', body: { name: newGroupName } });
            setNewGroupName('');
            loadGroups();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create group');
        }
    };

    const toggleMember = async (groupId: number, studentId: number) => {
        const current = groupMembers[groupId] || [];
        const next = current.includes(studentId) ? current.filter(x => x !== studentId) : [...current, studentId];
        setGroupMembers(g => ({ ...g, [groupId]: next }));
        try {
            await api(`/api/instructor/groups/${groupId}/members`, { method: 'POST', body: { studentIds: next } });
            loadGroups();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update group');
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-[2rem] font-extrabold tracking-tight text-[#f4f7fc]">Instructor Dashboard</h1>
                <div className="flex gap-2 flex-wrap">
                    <Link to="/instructor/violations" className="btn-soft px-4 py-2 text-sm border-[#e2231a]/40 text-[#f4b7b3]">Violation Tracker</Link>
                    <button onClick={() => setShowGroups(v => !v)} className="btn-soft px-4 py-2 text-sm">{showGroups ? 'Done' : 'Manage groups'}</button>
                    <button
                        onClick={() => setShowForm(v => !v)}
                        className={showForm ? 'btn-soft px-4 py-2 text-sm' : 'btn-primary px-4 py-2 text-sm'}
                    >
                        {showForm ? 'Cancel' : '+ New Exam'}
                    </button>
                </div>
            </div>

            {error && <div className="text-sm text-[#b81e16] bg-[#e2231a]/8 border border-[#e2231a]/25 rounded-lg px-3 py-2">{error}</div>}

            {showGroups && (
                <div className="glass-strong p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-extrabold text-[#0a1322]">Student groups</h2>
                        <div className="flex gap-2">
                            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="New group name" className="input-glass w-44" />
                            <button onClick={createGroup} className="btn-primary px-3 py-1.5 text-xs">Add</button>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {groups.length === 0 && <p className="text-sm text-[#5b6b84]">No groups yet.</p>}
                        {groups.map(g => (
                            <div key={g.id} className="glass p-4 space-y-2">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <p className="font-extrabold text-sm text-[#0a1322]">{g.name} <span className="text-xs text-[#5b6b84] font-medium">({g.member_count || 0} students)</span></p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {students.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => void toggleMember(g.id, s.id)}
                                                className={`chip border px-2.5 py-1 cursor-pointer transition-colors ${(groupMembers[g.id] || []).includes(s.id) ? 'bg-[#e2231a]/10 border-[#e2231a]/40 text-[#b81e16]' : 'bg-white border-[#e2e8f2] text-[#5b6b84] hover:border-[#e2231a]/50'}`}
                                                title={`${s.name} (${s.email})`}
                                            >
                                                {s.name.split(' ')[0]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showForm && (
                <div className="glass-strong p-5 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h2 className="font-extrabold text-[#0a1322]">Create Exam</h2>
                        <button onClick={() => setBankOpen(v => !v)} className="btn-light px-3 py-1.5 text-xs border-[#13203c]/25">
                            {bankOpen ? 'Close question bank' : 'Import from question bank'}
                        </button>
                    </div>

                    {bankOpen && (
                        <div className="glass p-4 space-y-3">
                            <div className="flex gap-2 flex-wrap">
                                <select value={bankType} onChange={e => setBankType(e.target.value)} className="input-glass bg-white w-32">
                                    <option value="">All types</option>
                                    <option value="mcq">MCQ</option>
                                    <option value="essay">Essay</option>
                                    <option value="practical">Practical</option>
                                </select>
                                <input value={bankSearch} onChange={e => setBankSearch(e.target.value)} placeholder="Search questions…" className="input-glass flex-1 min-w-[160px]" />
                            </div>
                            {bankLoading && <p className="text-xs text-[#5b6b84]">Loading…</p>}
                            {!bankLoading && bankItems.length === 0 && <p className="text-xs text-[#5b6b84]">No bank questions match.</p>}
                            {bankItems.map(item => (
                                <div key={item.id} className="flex items-start justify-between gap-3 border-b border-[#e2e8f2] pb-2">
                                    <div className="min-w-0">
                                        <p className="text-sm text-[#2c3a55]">{item.prompt}</p>
                                        <p className="text-[11px] text-[#5b6b84]">by {item.instructor_name} · {item.type} · {item.points} pts</p>
                                    </div>
                                    <button onClick={() => importFromBank(item)} className="btn-primary px-3 py-1 text-xs shrink-0">+ Add</button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input id="exam-title" name="title" aria-label="Exam title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Exam title" className="input-glass col-span-2" />
                        <input id="exam-time-limit" name="timeLimitMinutes" type="number" min="1" aria-label="Time limit in minutes" value={timeLimit} onChange={e => setTimeLimit(e.target.value)} placeholder="Time limit (min)" className="input-glass" />
                        <textarea id="exam-description" name="description" aria-label="Exam description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Instructions / description" rows={2} className="input-glass col-span-3 resize-none" />
                    </div>

                    <div>
                        <p className="label">Visible to groups (leave blank for the whole institution)</p>
                        <div className="flex flex-wrap gap-2">
                            {groups.map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => setSelectedGroupIds(ids => ids.includes(g.id) ? ids.filter(x => x !== g.id) : [...ids, g.id])}
                                    className={`chip border px-3 py-1.5 cursor-pointer transition-colors ${selectedGroupIds.includes(g.id) ? 'bg-[#e2231a]/10 border-[#e2231a]/40 text-[#b81e16]' : 'bg-white border-[#e2e8f2] text-[#5b6b84] hover:border-[#e2231a]/50'}`}
                                >
                                    {g.name}
                                </button>
                            ))}
                            {groups.length === 0 && <span className="text-xs text-[#5b6b84]">No groups yet — add groups under “Manage groups”.</span>}
                        </div>
                    </div>

                    <div className="space-y-3">
                        {questions.map((q, i) => (
                            <div key={i} className="glass p-4 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`chip ${q.type === 'mcq' ? 'bg-[#13203c]/10 text-[#13203c] border border-[#e2e8f2]' : q.type === 'essay' ? 'bg-[#f4b400]/12 text-[#8a5d00] border border-[#f4b400]/40' : 'bg-[#e2231a]/10 text-[#b81e16] border border-[#e2231a]/25'}`}>{q.type}</span>
                                    <span className="text-xs text-[#5b6b84]">Question {i + 1}</span>
                                    <div className="ml-auto flex items-center gap-2">
                                        <button onClick={() => void saveQToBank(i)} className="text-xs text-[#e2231a] hover:text-[#b81e16] font-semibold">Save to bank</button>
                                        <label htmlFor={`q-${i}-points`} className="text-xs text-[#5b6b84]">Points</label>
                                        <input id={`q-${i}-points`} name={`q-${i}-points`} type="number" min="1" aria-label={`Points for question ${i + 1}`} value={q.points} onChange={e => updateQ(i, { points: Number(e.target.value) || 1 })} className="input-glass w-16 py-1 text-xs" />
                                        <button onClick={() => setQuestions(qs => qs.filter((_, j) => j !== i))} className="text-[#b81e16] hover:text-[#e2231a] text-xs font-semibold">Remove</button>
                                    </div>
                                </div>
                                <input id={`q-${i}-prompt`} name={`q-${i}-prompt`} aria-label={`Question ${i + 1} prompt`} value={q.prompt} onChange={e => updateQ(i, { prompt: e.target.value })} placeholder={`Question ${i + 1} prompt`} className="input-glass" />
                                {q.type === 'mcq' && (
                                    <>
                                        <input id={`q-${i}-options`} name={`q-${i}-options`} aria-label={`Question ${i + 1} options`} value={q.optionsText} onChange={e => updateQ(i, { optionsText: e.target.value, correct: [] })} placeholder="Options, comma-separated (e.g. 4, 5, 22)" className="input-glass" />
                                        {q.optionsText.split(',').map(s => s.trim()).filter(Boolean).length > 0 && (
                                            <div className="flex flex-wrap gap-3">
                                                {q.optionsText.split(',').map(s => s.trim()).filter(Boolean).map((opt, idx) => (
                                                    <label key={idx} className="flex items-center gap-1.5 text-xs bg-white border border-[#e2e8f2] rounded-full px-3 py-1 cursor-pointer hover:border-[#e2231a]/50 transition-colors text-[#2c3a55]">
                                                        <input type="checkbox" name={`q-${i}-correct`} value={idx} checked={q.correct.includes(idx)} onChange={() => updateQ(i, { correct: q.correct.includes(idx) ? q.correct.filter(x => x !== idx) : [...q.correct, idx] })} className="accent-[#e2231a]" />
                                                        <span>{opt}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-xs text-[#5b6b84]">Check the box next to each correct option.</p>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <button onClick={() => addQuestion('mcq')} className="btn-light px-3 py-1.5 text-xs border-[#13203c]/25">+ MCQ</button>
                        <button onClick={() => addQuestion('essay')} className="btn-light px-3 py-1.5 text-xs border-[#f4b400]/50 text-[#8a5d00]">+ Essay</button>
                        <button onClick={() => addQuestion('practical')} className="btn-light px-3 py-1.5 text-xs border-[#e2231a]/30 text-[#b81e16]">+ Practical</button>
                    </div>

                    <button onClick={createExam} disabled={saving} className="btn-primary px-5 py-2 text-sm">
                        {saving ? 'Creating…' : 'Create Exam'}
                    </button>
                </div>
            )}

            <div className="space-y-3">
                {exams.length === 0 && !showForm && (
                    <p className="text-[#5b6b84] text-sm">No exams yet — click “+ New Exam” to build your first one.</p>
                )}
                {exams.map(exam => (
                    <div key={exam.id} className="glass glass-glow p-5 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="font-extrabold text-[#0a1322] break-words">{exam.title}</p>
                            <p className="text-xs text-[#5b6b84] mt-0.5 break-words">
                                {exam.time_limit_minutes ? `${exam.time_limit_minutes} min · ` : ''}{exam.description || ''}
                            </p>
                            <div className="flex gap-2 mt-1.5 flex-wrap">
                                <span className={`chip ${exam.status === 'published' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-white text-[#5b6b84] border border-[#e2e8f2]'}`}>
                                    {exam.status}
                                </span>
                                <span className={`chip ${exam.grades_released ? 'bg-[#13203c]/8 text-[#13203c] border border-[#e2e8f2]' : 'bg-[#f4b400]/12 text-[#8a5d00] border border-[#f4b400]/40'}`}>
                                    {exam.grades_released ? 'grades released' : 'grades hidden'}
                                </span>
                                {Array.isArray(exam.assigned_groups) && exam.assigned_groups.length > 0 && (
                                    <span className="chip bg-white text-[#5b6b84] border border-[#e2e8f2]">
                                        {exam.assigned_groups.join(', ')}
                                    </span>
                                )}
                            </div>
                            {(exam.status === 'published' ? null : (
                                <p className="text-[11px] text-[#8a5d00] mt-1 font-medium">Draft — not visible to students yet.</p>
                            ))}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Link to={`/instructor/exams/${exam.id}/gradebook`} className="btn-light px-3 py-1.5 text-xs">Gradebook</Link>
                            <Link to={`/instructor/exams/${exam.id}/live`} className="btn-light px-3 py-1.5 text-xs border-emerald-300 text-emerald-800">Live</Link>
                            <button onClick={() => void openAccommodations(exam)} className="btn-light px-3 py-1.5 text-xs border-[#13203c]/25">Accommodations</button>
                            <button onClick={() => void duplicateExam(exam)} className="btn-light px-3 py-1.5 text-xs">Duplicate</button>
                            <button onClick={() => toggleRelease(exam)} className="btn-light px-3 py-1.5 text-xs border-[#f4b400]/50 text-[#8a5d00]">
                                {exam.grades_released ? 'Hide grades' : 'Release grades'}
                            </button>
                            <button onClick={() => togglePublish(exam)} className={`px-3 py-1.5 rounded-lg text-xs font-extrabold shadow-lg transition-all duration-200 ${exam.status === 'published'
                                ? 'bg-gradient-to-r from-[#e2231a] to-[#b81e16] text-white shadow-[#e2231a]/25 hover:shadow-[#e2231a]/40 hover:brightness-110'
                                : 'bg-gradient-to-r from-[#f4b400] to-[#d99f00] text-[#3f2a00] shadow-[#f4b400]/25 hover:shadow-[#f4b400]/40 hover:brightness-110'}`}>
                                {exam.status === 'published' ? 'Unpublish' : 'Publish'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {accForExam && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setAccForExam(null)}>
                    <div className="glass-strong p-5 sm:p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-extrabold text-[#0a1322]">Accommodations — {accForExam.title}</h3>
                            <button onClick={() => setAccForExam(null)} className="text-[#5b6b84] hover:text-[#0a1322]">✕</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2">
                                <label className="label">Student</label>
                                <select value={accStudentId ?? ''} onChange={e => setAccStudentId(Number(e.target.value))} className="input-glass bg-white w-full">
                                    <option value="">Choose a student…</option>
                                    {students.map(s => <option key={s.id} value={s.id}>{s.name} — {s.email}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">Extra time (minutes)</label>
                                <input type="number" min="0" value={accExtra} onChange={e => setAccExtra(e.target.value)} className="input-glass w-full" />
                            </div>
                            <div className="flex items-end">
                                <button onClick={() => void saveAccommodation()} disabled={!accStudentId} className="btn-primary px-4 py-2 text-sm w-full">Save</button>
                            </div>
                            <div className="col-span-2 grid grid-cols-2 gap-2">
                                <div>
                                    <label className="label">Custom start</label>
                                    <input type="datetime-local" value={accStart} onChange={e => setAccStart(e.target.value)} className="input-glass w-full" />
                                </div>
                                <div>
                                    <label className="label">Custom end</label>
                                    <input type="datetime-local" value={accEnd} onChange={e => setAccEnd(e.target.value)} className="input-glass w-full" />
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-[#5b6b84]">Extra time is added to the exam limit. A custom end time overrides it if earlier.</p>
                        <div className="space-y-2">
                            {accommodations.length === 0 && <p className="text-xs text-[#5b6b84]">No accommodations yet.</p>}
                            {accommodations.map(a => (
                                <div key={a.student_id} className="glass px-3 py-2 flex items-center justify-between gap-2 text-sm">
                                    <div className="min-w-0">
                                        <p className="font-extrabold text-[#0a1322] truncate">{a.student_name}</p>
                                        <p className="text-[11px] text-[#5b6b84]">
                                            +{a.extra_time_minutes || 0} min
                                            {a.custom_start_at ? ` · starts ${new Date(a.custom_start_at).toLocaleString()}` : ''}
                                            {a.custom_end_at ? ` · ends ${new Date(a.custom_end_at).toLocaleString()}` : ''}
                                        </p>
                                    </div>
                                    <button onClick={() => void removeAccommodation(a.student_id)} className="text-[#b81e16] hover:text-[#e2231a] text-xs shrink-0 font-semibold">Remove</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}