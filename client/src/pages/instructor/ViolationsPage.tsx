import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fileUrl } from '../../lib/api';

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
    camera_blocked: 'Camera covered / blocked',
    proctor_unavailable: 'AI monitoring unavailable',
    auto_submit_triggered: 'Auto-submit (rule)',
    policy_flagged: 'Flagged for review (rule)',
    instructor_override: 'Instructor override'
};

const TYPE_COLORS: Record<string, string> = {
    auto_submit_triggered: 'bg-danger/10 border-danger/30 text-danger',
    instructor_override: 'bg-ok/10 border-ok/30 text-ok',
    face_missing: 'bg-danger/10 border-danger/30 text-danger',
    multi_face: 'bg-danger/10 border-danger/30 text-danger',
    phone_detected: 'bg-warm/12 border-warm/40 text-warm-ink',
    voice_detected: 'bg-warm/12 border-warm/40 text-warm-ink',
    gaze_away: 'bg-warm/12 border-warm/40 text-warm-ink',
    camera_blocked: 'bg-danger/10 border-danger/30 text-danger',
    proctor_unavailable: 'bg-warm/12 border-warm/40 text-warm-ink',
    policy_flagged: 'bg-warm/12 border-warm/40 text-warm-ink',
    tab_switch: 'bg-ink-2/5 border-line text-ink-2',
    fullscreen_exit: 'bg-ink-2/5 border-line text-ink-2',
    paste_blocked: 'bg-ink/4 border border-line text-muted'
};


interface StudentGroup {
    studentId: number;
    name: string;
    email: string;
    rows: ViolationRow[];
    attempts: Set<number>;
    byType: Record<string, number>;
    lastAt: number;
    needsReview: boolean;
    reviewedAll: boolean;
}

// Event types that count as a student "violation" in the per-student totals
// (rule outcomes and instructor actions are shown in the list but not counted).
const NON_VIOLATION = new Set(['auto_submit_triggered', 'instructor_override', 'policy_flagged']);

function groupByStudent(rows: ViolationRow[], isUnresolved: (r: ViolationRow) => boolean): StudentGroup[] {
    const map = new Map<number, StudentGroup>();
    for (const r of rows) {
        let g = map.get(r.student_id);
        if (!g) {
            g = { studentId: r.student_id, name: r.student_name, email: r.student_email, rows: [], attempts: new Set(), byType: {}, lastAt: 0, needsReview: false, reviewedAll: true };
            map.set(r.student_id, g);
        }
        g.rows.push(r);
        g.attempts.add(r.attempt_id);
        if (!NON_VIOLATION.has(r.event_type)) g.byType[r.event_type] = (g.byType[r.event_type] || 0) + 1;
        g.lastAt = Math.max(g.lastAt, new Date(r.timestamp).getTime());
        if (isUnresolved(r)) g.needsReview = true;
        if (!r.reviewed_at) g.reviewedAll = false;
    }
    return Array.from(map.values());
}

function isUnresolved(r: ViolationRow): boolean {
    return (r.status === 'auto_submitted' || r.flagged_for_review) && !r.reviewed_at && !r.has_notes && !r.has_override;
}

function violationCount(g: StudentGroup): number {
    return Object.values(g.byType).reduce((a, b) => a + b, 0);
}

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
    const [open, setOpen] = useState<Set<number>>(new Set());

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
        p.set('sort', sort === 'count' ? 'recent' : sort);
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

    const groups = useMemo(() => {
        const g = groupByStudent(rows, isUnresolved);
        if (sort === 'student') g.sort((a, b) => a.name.localeCompare(b.name));
        else if (sort === 'count') g.sort((a, b) => violationCount(b) - violationCount(a) || b.lastAt - a.lastAt);
        else g.sort((a, b) => b.lastAt - a.lastAt);
        return g;
    }, [rows, sort]);

    const toggle = (id: number) => setOpen(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    return (
        <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
            <div>
                <Link to="/instructor" className="text-accent hover:text-accent-strong hover:underline text-sm font-medium">← All exams</Link>
                <h1 className="text-[2rem] font-extrabold tracking-tight text-on-canvas">Violation Tracker</h1>
                <p className="text-sm text-muted">Integrity events grouped by student. Open a student to see each violation.</p>
            </div>

            {error && <div className="text-sm text-danger bg-danger/8 border border-danger/25 rounded-lg px-3 py-2">{error}</div>}

            {summary && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="glass p-4">
                        <p className="text-xs text-muted uppercase tracking-wider font-semibold">Violations this week</p>
                        <p className="text-2xl font-extrabold text-ink">{summary.total_this_week}</p>
                    </div>
                    <div className="glass p-4">
                        <p className="text-xs text-muted uppercase tracking-wider font-semibold">Most common violation</p>
                        <p className="text-lg font-extrabold mt-1 text-ink">{summary.most_common_type ? (LABELS[summary.most_common_type] || summary.most_common_type) : '—'}</p>
                    </div>
                    <div className="glass p-4">
                        <p className="text-xs text-muted uppercase tracking-wider font-semibold">Unresolved attempts</p>
                        <p className="text-2xl font-extrabold text-danger">{summary.unresolved_count}</p>
                        <p className="text-xs text-muted mt-0.5">auto-submitted or flagged, not yet reviewed</p>
                    </div>
                </div>
            )}

            <div className="glass-strong p-4 flex flex-wrap gap-2 items-end">
                <div>
                    <label className="label">Exam</label>
                    <select value={examId} onChange={e => setExamId(e.target.value)} className="input-glass bg-surface w-48">
                        <option value="">All exams</option>
                        {exams.map(ex => <option key={ex.id} value={ex.id}>{ex.title}</option>)}
                    </select>
                </div>
                <div>
                    <label className="label">Event type</label>
                    <select value={type} onChange={e => setType(e.target.value)} className="input-glass bg-surface w-44">
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
                    <select value={sort} onChange={e => setSort(e.target.value)} className="input-glass bg-surface w-40">
                        <option value="recent">Most recent activity</option>
                        <option value="count">Most violations</option>
                        <option value="student">Student name (A-Z)</option>
                    </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-ink-soft pb-2 cursor-pointer">
                    <input type="checkbox" checked={flaggedOnly} onChange={e => setFlaggedOnly(e.target.checked)} className="accent-accent" />
                    Flagged attempts only
                </label>
                <button onClick={() => void load()} className="btn-primary px-4 py-2 text-sm">Apply</button>
            </div>

            {loading && <div className="glass p-8 text-center text-muted text-sm">Loading…</div>}
            {!loading && groups.length === 0 && (
                <div className="glass p-8 text-center text-muted text-sm">No violations match these filters.</div>
            )}

            <div className="space-y-3">
                {!loading && groups.map(g => {
                    const isOpen = open.has(g.studentId);
                    const total = violationCount(g);
                    const typeEntries = Object.entries(g.byType).sort((a, b) => b[1] - a[1]);
                    return (
                        <div key={g.studentId} className={`glass overflow-hidden ${g.needsReview ? 'ring-1 ring-danger/30' : ''}`}>
                            <button
                                type="button"
                                onClick={() => toggle(g.studentId)}
                                aria-expanded={isOpen}
                                className="w-full text-left p-4 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-ink/3"
                            >
                                <span className={`inline-block transition-transform text-muted ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                                <div className="min-w-[180px] flex-1">
                                    <p className="font-bold text-ink">{g.name}</p>
                                    <p className="text-xs text-muted">ID #{g.studentId} · {g.email}</p>
                                </div>
                                <div className="flex flex-wrap gap-1 flex-[2]">
                                    {typeEntries.map(([t, n]) => (
                                        <span key={t} className={`chip border ${TYPE_COLORS[t] || 'bg-ink/4 border border-line text-muted'}`}>
                                            {LABELS[t] || t.replace(/_/g, ' ')} ×{n}
                                        </span>
                                    ))}
                                </div>
                                <div className="text-right">
                                    <p className="text-xl font-extrabold text-ink leading-none">{total}</p>
                                    <p className="text-[11px] text-muted">violation{total === 1 ? '' : 's'} · {g.attempts.size} attempt{g.attempts.size === 1 ? '' : 's'}</p>
                                    <p className="text-[11px] text-muted">last {new Date(g.lastAt).toLocaleString()}</p>
                                </div>
                                {g.needsReview && <span className="chip bg-danger/10 border border-danger/30 text-danger">needs review</span>}
                                {!g.needsReview && g.reviewedAll && <span className="chip bg-ok/10 border border-ok/30 text-ok">reviewed</span>}
                            </button>

                            {isOpen && (
                                <div className="border-t border-line scroll-x">
                                    <table className="tbl w-full text-sm min-w-[760px]">
                                        <thead>
                                            <tr>
                                                <th className="th">Event</th>
                                                <th className="th">Evidence</th>
                                                <th className="th">Exam</th>
                                                <th className="th">Timestamp</th>
                                                <th className="th">Attempt status</th>
                                                <th className="th"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {g.rows.map(r => {
                                                const evidence = (r.metadata as any)?.evidenceUrl as string | undefined;
                                                return (
                                                    <tr key={r.event_id} className={r.status === 'auto_submitted' || r.flagged_for_review ? 'bg-danger/5' : ''}>
                                                        <td className="td">
                                                            <span className={`chip border ${TYPE_COLORS[r.event_type] || 'bg-ink/4 border border-line text-muted'}`}>
                                                                {LABELS[r.event_type] || r.event_type.replace(/_/g, ' ')}
                                                            </span>
                                                            {(r.metadata as any)?.detail && (
                                                                <p className="text-[11px] text-muted mt-0.5 max-w-[220px] truncate" title={String((r.metadata as any).detail)}>{String((r.metadata as any).detail)}</p>
                                                            )}
                                                            {r.event_type === 'instructor_override' && (r.metadata as any)?.reason && (
                                                                <p className="text-[11px] text-muted mt-0.5 max-w-[220px] truncate" title={(r.metadata as any).reason}>{(r.metadata as any).reason}</p>
                                                            )}
                                                        </td>
                                                        <td className="td">
                                                            {evidence ? (
                                                                <a href={fileUrl(evidence)} target="_blank" rel="noreferrer">
                                                                    <img src={fileUrl(evidence)} alt="Evidence frame" className="h-12 w-16 object-cover rounded border border-line" loading="lazy" />
                                                                </a>
                                                            ) : <span className="text-xs text-muted">—</span>}
                                                        </td>
                                                        <td className="td font-medium text-ink">{r.exam_title}</td>
                                                        <td className="td text-xs text-muted">{new Date(r.timestamp).toLocaleString()}</td>
                                                        <td className="td">
                                                            <span className={`chip ${r.status === 'auto_submitted' ? 'bg-danger/10 text-danger border border-danger/25' : r.status === 'in_progress' ? 'bg-ink-2/8 text-ink-2 border border-line' : 'bg-ok/10 text-ok border border-ok/30'}`}>
                                                                {r.status.replace('_', ' ')}
                                                            </span>
                                                            {r.flagged_for_review && <span className="chip bg-warm/12 border border-warm/40 text-warm-ink ml-1">flagged</span>}
                                                        </td>
                                                        <td className="td text-right whitespace-nowrap">
                                                            {isUnresolved(r) && (
                                                                <button onClick={() => void markReviewed(r.attempt_id)} className="btn-primary px-3 py-1.5 text-xs">Mark reviewed</button>
                                                            )}
                                                            {r.reviewed_at && <span className="text-xs text-ok font-semibold">reviewed</span>}
                                                            <Link to={`/instructor/exams/${r.exam_id}/attempts/${r.attempt_id}`} className="ml-2 text-accent hover:text-accent-strong hover:underline font-semibold text-xs">Open →</Link>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}