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
    policy_flagged: 'Flagged for review (rule)',
    instructor_override: 'Instructor override'
};

const TYPE_COLORS: Record<string, string> = {
    auto_submit_triggered: 'bg-[#e2231a]/10 border-[#e2231a]/30 text-[#b81e16]',
    instructor_override: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    face_missing: 'bg-[#e2231a]/10 border-[#e2231a]/30 text-[#b81e16]',
    multi_face: 'bg-[#e2231a]/10 border-[#e2231a]/30 text-[#b81e16]',
    phone_detected: 'bg-[#f4b400]/12 border-[#f4b400]/40 text-[#8a5d00]',
    voice_detected: 'bg-[#f4b400]/12 border-[#f4b400]/40 text-[#8a5d00]',
    gaze_away: 'bg-[#f4b400]/12 border-[#f4b400]/40 text-[#8a5d00]',
    tab_switch: 'bg-[#13203c]/5 border-[#e2e8f2] text-[#13203c]',
    fullscreen_exit: 'bg-[#13203c]/5 border-[#e2e8f2] text-[#13203c]',
    paste_blocked: 'bg-[#0a1322]/4 border border-[#e2e8f2] text-[#5b6b84]'
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
                <Link to="/instructor" className="text-[#e2231a] hover:text-[#b81e16] hover:underline text-sm font-medium">← All exams</Link>
                <h1 className="text-[2rem] font-extrabold tracking-tight text-[#f4f7fc]">Violation Tracker</h1>
                <p className="text-sm text-[#5b6b84]">Every integrity event across all your exams, in one place.</p>
            </div>

            {error && <div className="text-sm text-[#b81e16] bg-[#e2231a]/8 border border-[#e2231a]/25 rounded-lg px-3 py-2">{error}</div>}

            {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="glass rounded-xl p-4">
                        <p className="text-xs text-[#5b6b84] uppercase tracking-wider font-semibold">Violations this week</p>
                        <p className="text-2xl font-extrabold text-[#0a1322]">{summary.total_this_week}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <p className="text-xs text-[#5b6b84] uppercase tracking-wider font-semibold">Most common violation</p>
                        <p className="text-lg font-extrabold mt-1 text-[#0a1322]">{summary.most_common_type ? (LABELS[summary.most_common_type] || summary.most_common_type) : '—'}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <p className="text-xs text-[#5b6b84] uppercase tracking-wider font-semibold">Unresolved attempts</p>
                        <p className="text-2xl font-extrabold text-[#b81e16]">{summary.unresolved_count}</p>
                        <p className="text-xs text-[#5b6b84] mt-0.5">auto-submitted or flagged, not yet reviewed</p>
                    </div>
                </div>
            )}

            <div className="glass-strong p-4 flex flex-wrap gap-2 items-end">
                <div>
                    <label className="label">Exam</label>
                    <select value={examId} onChange={e => setExamId(e.target.value)} className="input-glass bg-white w-48">
                        <option value="">All exams</option>
                        {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
                    </select>
                </div>
                <div>
                    <label className="label">Event type</label>
                    <select value={type} onChange={e => setType(e.target.value)} className="input-glass bg-white w-44">
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
                    <select value={sort} onChange={e => setSort(e.target.value)} className="input-glass bg-white w-40">
                        <option value="recent">Most recent</option>
                        <option value="student">By student</option>
                        <option value="exam">By exam</option>
                    </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-[#2c3a55] pb-2 cursor-pointer">
                    <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} className="accent-[#e2231a]" />
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
                            {loading && <tr><td colSpan={6} className="td text-center text-[#5b6b84] py-8">Loading…</td></tr>}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={6} className="td text-center text-[#5b6b84] py-8">No violations match these filters.</td></tr>
                            )}
                            {rows.map(r => (
                                <tr key={r.event_id} className={r.status === 'auto_submitted' || r.flagged_for_review ? 'bg-[#e2231a]/5' : ''}>
                                    <td className="td">
                                        <Link to={`/instructor/exams/${r.exam_id}/attempts/${r.attempt_id}`} className="font-semibold text-[#e2231a] hover:text-[#b81e16] hover:underline">
                                            {r.student_name}
                                        </Link>
                                        <p className="text-xs text-[#5b6b84]">{r.student_email}</p>
                                    </td>
                                    <td className="td font-medium text-[#0a1322]">{r.exam_title}</td>
                                    <td className="td">
                                        <span className={`chip border ${TYPE_COLORS[r.event_type] || 'bg-[#0a1322]/4 border border-[#e2e8f2] text-[#5b6b84]'}`}>
                                            {LABELS[r.event_type] || r.event_type.replace(/_/g, ' ')}
                                        </span>
                                        {r.event_type === 'instructor_override' && (r.metadata as any)?.reason && (
                                            <p className="text-[11px] text-[#5b6b84] mt-0.5 max-w-[220px] truncate" title={(r.metadata as any).reason}>{(r.metadata as any).reason}</p>
                                        )}
                                    </td>
                                    <td className="td text-xs text-[#5b6b84]">{new Date(r.timestamp).toLocaleString()}</td>
                                    <td className="td">
                                        <span className={`chip ${r.status === 'auto_submitted' ? 'bg-[#e2231a]/10 text-[#b81e16] border border-[#e2231a]/25' : r.status === 'in_progress' ? 'bg-[#13203c]/8 text-[#13203c] border border-[#e2e8f2]' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                                            {r.status.replace('_', ' ')}
                                        </span>
                                        {r.flagged_for_review && <span className="chip bg-[#f4b400]/12 border border-[#f4b400]/40 text-[#8a5d00] ml-1">flagged</span>}
                                    </td>
                                    <td className="td text-right whitespace-nowrap">
                                        {isUnresolved(r) && (
                                            <button onClick={() => void markReviewed(r.attempt_id)} className="btn-primary px-3 py-1.5 text-xs">Mark reviewed</button>
                                        )}
                                        {r.reviewed_at && <span className="text-xs text-emerald-800 font-semibold">reviewed</span>}
                                        <Link to={`/instructor/exams/${r.exam_id}/attempts/${r.attempt_id}`} className="ml-2 text-[#e2231a] hover:text-[#b81e16] hover:underline font-semibold text-xs">Open →</Link>
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