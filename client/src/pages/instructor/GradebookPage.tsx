import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getToken } from '../../lib/api';

interface Exam {
    id: number;
    title: string;
    status: string;
}

interface Row {
    attemptId: number;
    studentName: string;
    studentEmail: string;
    status: string;
    submittedAt: string | null;
    totalScore: number | null;
    violations: number;
    flagged_for_review: boolean;
}

const BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function GradebookPage() {
    const { examId = '' } = useParams();
    const [exam, setExam] = useState<Exam | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        api<Exam>(`/api/exams/${examId}`).then(setExam).catch(() => {});
        api<Row[]>(`/api/instructor/exams/${examId}/gradebook`)
            .then(setRows)
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load gradebook'));
    }, [examId]);

    useEffect(load, [load]);

    const toggle = (attemptId: number) => {
        setSelected(s => {
            const n = new Set(s);
            if (n.has(attemptId)) n.delete(attemptId); else n.add(attemptId);
            return n;
        });
    };

    const toggleAll = () => {
        setSelected(s => s.size === rows.length ? new Set() : new Set(rows.map(r => r.attemptId)));
    };

    const flash = (msg: string) => {
        setNotice(msg);
        setTimeout(() => setNotice(''), 3000);
    };

    const bulkFlag = async () => {
        if (!selected.size) return;
        setBusy(true);
        try {
            await api(`/api/instructor/exams/${examId}/bulk/flag`, {
                method: 'POST',
                body: { attemptIds: Array.from(selected), flagged: true }
            });
            flash(`Flagged ${selected.size} attempt(s) for review.`);
            setSelected(new Set());
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to flag attempts');
        } finally {
            setBusy(false);
        }
    };

    const bulkRelease = async () => {
        if (!selected.size) return;
        if (!window.confirm(`Release grades for the selected ${selected.size} attempt(s)? Students will see their scores immediately.`)) return;
        setBusy(true);
        try {
            await api(`/api/instructor/exams/${examId}/bulk/release`, {
                method: 'POST',
                body: { attemptIds: Array.from(selected) }
            });
            flash('Grades released. Students can now see their results.');
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to release grades');
        } finally {
            setBusy(false);
        }
    };

    const exportCsv = async () => {
        try {
            const res = await fetch(`${BASE}/api/instructor/exams/${examId}/export/csv`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'exam_results.csv';
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to export');
        }
    };

    const pill = (status: string) => {
        if (status === 'auto_submitted') return 'bg-red-500/15 border border-red-400/40 text-red-300';
        if (status === 'submitted') return 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300';
        return 'bg-amber-500/15 border border-amber-400/40 text-amber-300';
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <Link to="/instructor" className="text-sky-300 hover:text-sky-200 hover:underline text-sm font-medium">← All exams</Link>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-300 to-cyan-300 text-transparent bg-clip-text glow-text">{exam ? exam.title : 'Gradebook'}</h1>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Link to={`/instructor/exams/${examId}/analytics`} className="btn-soft px-3 py-1.5 text-xs">Analytics</Link>
                    <button onClick={() => void exportCsv()} className="btn-soft px-3 py-1.5 text-xs border-emerald-400/30 text-emerald-300">Export CSV</button>
                </div>
            </div>
            {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</div>}
            {notice && <div className="text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-400/40 rounded-lg px-3 py-2">{notice}</div>}

            <div className="flex gap-2 flex-wrap items-center">
                <span className="text-xs text-slate-400">{selected.size} selected</span>
                <button onClick={() => void bulkFlag()} disabled={busy || !selected.size} className="btn-soft px-3 py-1.5 text-xs border-amber-400/30 text-amber-300">Flag for review</button>
                <button onClick={() => void bulkRelease()} disabled={busy || !selected.size} className="btn-primary px-3 py-1.5 text-xs">Release grades</button>
            </div>

            <div className="glass rounded-xl overflow-hidden">
                <div className="scroll-x">
                    <table className="tbl w-full text-sm min-w-[760px]">
                        <thead>
                            <tr>
                                <th className="th w-8">
                                    <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} className="accent-sky-400" aria-label="Select all" />
                                </th>
                                <th className="th">Student</th>
                                <th className="th">Status</th>
                                <th className="th">Score</th>
                                <th className="th">Violations</th>
                                <th className="th">Submitted</th>
                                <th className="th"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={7} className="td text-center text-slate-400 py-8">No attempts yet.</td></tr>
                            )}
                            {rows.map(r => (
                                <tr key={r.attemptId} className={r.flagged_for_review ? 'bg-amber-500/5' : ''}>
                                    <td className="td">
                                        <input type="checkbox" checked={selected.has(r.attemptId)} onChange={() => toggle(r.attemptId)} className="accent-sky-400" aria-label={`Select ${r.studentName}`} />
                                    </td>
                                    <td className="td">
                                        <p className="font-medium">{r.studentName}</p>
                                        <p className="text-xs text-slate-500">{r.studentEmail}</p>
                                        {r.flagged_for_review && <span className="chip bg-amber-500/10 border border-amber-400/30 text-amber-300 mt-1">flagged</span>}
                                    </td>
                                    <td className="td"><span className={`chip ${pill(r.status)}`}>{r.status.replace('_', ' ')}</span></td>
                                    <td className="td font-semibold">{r.totalScore ?? '—'}</td>
                                    <td className="td">
                                        {r.violations > 0
                                            ? <span className={`chip ${r.status === 'in_progress' ? 'bg-red-500/15 border border-red-400/40 text-red-300' : 'bg-amber-500/15 border border-amber-400/40 text-amber-300'}`}>{r.violations}</span>
                                            : <span className="text-slate-500">0</span>}
                                    </td>
                                    <td className="td text-slate-500 text-xs">{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}</td>
                                    <td className="td text-right">
                                        <Link to={`/instructor/exams/${examId}/attempts/${r.attemptId}`} className="text-sky-300 hover:text-sky-200 hover:underline font-medium whitespace-nowrap">Review →</Link>
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