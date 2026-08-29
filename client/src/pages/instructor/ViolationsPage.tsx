import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

interface Exam {
    id: number;
    title: string;
}

interface ViolationRow {
    event_id: number;
    event_type: string;
    timestamp: string;
    metadata: Record<string, unknown> | null;
    attempt_id: number;
    status: string;
    flagged_for_review: boolean;
    reviewed_at: string | null;
    student_id: number;
    student_name: string;
    student_email: string;
    exam_id: number;
    exam_title: string;
    has_notes: boolean;
    has_override: boolean;
}

interface Summary {
    total_this_week: number;
    most_common_type: string | null;
    unresolved_count: number;
}

const LABELS: Record<string, string> = {
    tab_switch: 'Tab switch',
    fullscreen_exit: 'Full-screen exit',
    paste_blocked: 'Paste blocked',
    face_missing: 'No face detected',
    multi_face: 'Multiple faces',
    phone_detected: 'Phone / media device',
    voice_detected: 'Voice / loud noise',
    gaze_away: 'Looked away',
    auto_submit_triggered: 'Auto-submit (rule)',
    instructor_override: 'Instructor override'
};

const TYPE_COLORS: Record<string, string> = {
    auto_submit_triggered: 'bg-red-500/15 border-red-400/40 text-red-200',
    instructor_override: 'bg-sky-500/15 border-sky-400/40 text-sky-200',
    face_missing: 'bg-red-500/15 border-red-400/40 text-red-200',
    multi_face: 'bg-red-500/15 border-red-400/40 text-red-200',
    phone_detected: 'bg-amber-500/15 border-amber-400/40 text-amber-200',
    voice_detected: 'bg-amber-500/15 border-amber-400/40 text-amber-200',
    gaze_away: 'bg-amber-500/15 border-amber-400/40 text-amber-200',
    tab_switch: 'bg-orange-500/10 border-orange-400/30 text-orange-200',
    fullscreen_exit: 'bg-orange-500/10 border-orange-400/30 text-orange-200',
    paste_blocked: 'bg-white/5 border-white/10 text-slate-300'
};

export default function ViolationsPage() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [rows, setRows] = useState<ViolationRow[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [examId, setExamId] = useState('');
    const [type, setType] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [flaggedOnly, setFlaggedOnly] = useState(false);
    const [sort, setSort] = useState('recent');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        api<Exam[]>('/api/exams').then(setExams).catch(() => {});
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        const p = new URLSearchParams();
        if (examId) p.set('examId', examId);
        if (type) p.set('type', type);
        if (from) p.set('from', new Date(from).toISOString());
        if (to) p.set('to', new Date(to).toISOString());
        if (flaggedOnly) p.set('flaggedOnly', 'true');
        p.set('sort', sort);
        api<{ rows: ViolationRow[]; summary: Summary }>(`/api/instructor/violations?${p.toString()}`)
            .then(d => { setRows(d.rows); setSummary(d.summary); })
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load violations'))
            .finally(() => setLoading(false));
    }, [examId, type, from, to, flaggedOnly, sort]);

    useEffect(() => { void load(); }, [load]);

    const markReviewed = async (attemptId: number) => {
        try {
            await api(`/api/instructor/attempts/${attemptId}/review`, { method: 'POST' });
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to mark reviewed');
        }
    };

    const isUnresolved = (r: ViolationRow) =>
        (r.status === 'auto_submitted' || r.flagged_for_review) && !r.reviewed_at && !r.has_notes && !r.has_override;

    return (
        <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
            <div>
                <Link to="/instructor" className="text-sky-300 hover:text-sky-200 hover:underline text-sm font-medium">← All exams</Link>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-300 to-cyan-300 text-transparent bg-clip-text glow-text">Violation Tracker</h1>
                <p className="text-sm text-slate-400">Every integrity event across all your exams, in one place.</p>
            </div>

            {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</div>}

            {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="glass rounded-xl p-4">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Violations this week</p>
                        <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-cyan-300 glow-text">{summary.total_this_week}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Most common violation</p>
                        <p className="text-lg font-bold mt-1">{summary.most_common_type ? (LABELS[summary.most_common_type] || summary.most_common_type) : '—'}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Unresolved attempts</p>
                        <p className="text-2xl font-bold text-red-300">{summary.unresolved_count}</p>
                        <p className="text-xs text-slate-500 mt-0.5">auto-submitted or flagged, not yet reviewed</p>
                    </div>
                </div>
            )}

            <div className="glass-strong glass-glow rounded-xl p-4 flex flex-wrap gap-2 items-end">
                <div>
                    <label className="label">Exam</label>
                    <select value={examId} onChange={e => setExamId(e.target.value)} className="input-glass bg-[#141831] w-48">
                        <option value="">All exams</option>
                        {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
                    </select>
                </div>
                <div>
                    <label className="label">Event type</label>
                    <select value={type} onChange={e => setType(e.target.value)} className="input-glass bg-[#141831] w-44">
                        <option value="">All types</option>
                        {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </div>
                <div>
                    <label className="label">From</label>
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input-glass" />
                </div>
                <div>
                    <label className="label">To</label>
                    <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input-glass" />
                </div>
                <div>
                    <label className="label">Sort</label>
                    <select value={sort} onChange={e => setSort(e.target.value)} className="input-glass bg-[#141831] w-40">
                        <option value="recent">Most recent</option>
                        <option value="student">By student</option>
                        <option value="exam">By exam</option>
                    </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 pb-2 cursor-pointer">
                    <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} className="accent-sky-400" />
                    Flagged attempts only
                </label>
                <button onClick={() => void load()} className="btn-primary px-4 py-2 text-sm">Apply</button>
            </div>

            <div className="glass rounded-xl overflow-hidden">
                <div className="scroll-x">
                    <table className="tbl w-full text-sm min-w-[900px]">
                        <thead>
                            <tr>
                                <th className="th">Student</th>
                                <th className="th">Exam</th>
                                <th className="th">Event</th>
                                <th className="th">Timestamp</th>
                                <th className="th">Attempt status</th>
                                <th className="th"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <tr><td colSpan={6} className="td text-center text-slate-400 py-8">Loading…</td></tr>}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={6} className="td text-center text-slate-400 py-8">No violations match these filters.</td></tr>
                            )}
                            {rows.map(r => (
                                <tr key={r.event_id} className={r.status === 'auto_submitted' || r.flagged_for_review ? 'bg-red-500/5' : ''}>
                                    <td className="td">
                                        <Link to={`/instructor/exams/${r.exam_id}/attempts/${r.attempt_id}`} className="font-medium text-sky-300 hover:text-sky-200 hover:underline">
                                            {r.student_name}
                                        </Link>
                                        <p className="text-xs text-slate-500">{r.student_email}</p>
                                    </td>
                                    <td className="td text-slate-300">{r.exam_title}</td>
                                    <td className="td">
                                        <span className={`chip border ${TYPE_COLORS[r.event_type] || 'bg-white/5 border-white/10 text-slate-300'}`}>
                                            {LABELS[r.event_type] || r.event_type.replace(/_/g, ' ')}
                                        </span>
                                        {r.event_type === 'instructor_override' && (r.metadata as any)?.reason && (
                                            <p className="text-[11px] text-slate-500 mt-0.5 max-w-[220px] truncate" title={(r.metadata as any).reason}>{(r.metadata as any).reason}</p>
                                        )}
                                    </td>
                                    <td className="td text-xs text-slate-400">{new Date(r.timestamp).toLocaleString()}</td>
                                    <td className="td">
                                        <span className={`chip ${r.status === 'auto_submitted' ? 'bg-red-500/15 border border-red-400/40 text-red-300' : r.status === 'in_progress' ? 'bg-sky-500/15 border border-sky-400/40 text-sky-300' : 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300'}`}>
                                            {r.status.replace('_', ' ')}
                                        </span>
                                        {r.flagged_for_review && <span className="chip bg-amber-500/10 border border-amber-400/30 text-amber-300 ml-1">flagged</span>}
                                    </td>
                                    <td className="td text-right whitespace-nowrap">
                                        {isUnresolved(r) && (
                                            <button onClick={() => void markReviewed(r.attempt_id)} className="btn-primary px-3 py-1.5 text-xs">Mark reviewed</button>
                                        )}
                                        {r.reviewed_at && <span className="text-xs text-emerald-300">reviewed</span>}
                                        <Link to={`/instructor/exams/${r.exam_id}/attempts/${r.attempt_id}`} className="ml-2 text-sky-300 hover:text-sky-200 hover:underline font-medium text-xs">Open →</Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}