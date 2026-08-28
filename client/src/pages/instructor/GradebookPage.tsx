import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

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
}

export default function GradebookPage() {
    const { examId = '' } = useParams();
    const [exam, setExam] = useState<Exam | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {
        api<Exam>(`/api/exams/${examId}`).then(setExam).catch(() => {});
        api<Row[]>(`/api/instructor/exams/${examId}/gradebook`)
            .then(setRows)
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load gradebook'));
    }, [examId]);

    const pill = (status: string) => {
        if (status === 'auto_submitted') return 'bg-red-500/15 border border-red-400/40 text-red-300';
        if (status === 'submitted') return 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300';
        return 'bg-amber-500/15 border border-amber-400/40 text-amber-300';
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
            <Link to="/instructor" className="text-sky-300 hover:text-sky-200 hover:underline text-sm font-medium">← All exams</Link>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-300 to-cyan-300 text-transparent bg-clip-text glow-text">{exam ? exam.title : 'Gradebook'}</h1>
            {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</div>}

            <div className="glass rounded-xl overflow-hidden">
                <div className="scroll-x">
                    <table className="tbl w-full text-sm min-w-[640px]">
                        <thead>
                            <tr>
                                <th className="th">Student</th>
                                <th className="th">Status</th>
                                <th className="th">Score</th>
                                <th className="th">Submitted</th>
                                <th className="th"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={5} className="td text-center text-slate-400 py-8">No attempts yet.</td></tr>
                            )}
                            {rows.map(r => (
                                <tr key={r.attemptId}>
                                    <td className="td">
                                        <p className="font-medium">{r.studentName}</p>
                                        <p className="text-xs text-slate-500">{r.studentEmail}</p>
                                    </td>
                                    <td className="td"><span className={`chip ${pill(r.status)}`}>{r.status.replace('_', ' ')}</span></td>
                                    <td className="td font-semibold">{r.totalScore ?? '—'}</td>
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