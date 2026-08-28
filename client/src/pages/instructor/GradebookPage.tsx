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
        if (status === 'auto_submitted') return 'bg-red-100 text-red-700';
        if (status === 'submitted') return 'bg-emerald-100 text-emerald-700';
        return 'bg-amber-100 text-amber-700';
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
            <Link to="/instructor" className="text-indigo-600 hover:underline text-sm font-medium">← All exams</Link>
            <h1 className="text-2xl font-bold">{exam ? exam.title : 'Gradebook'}</h1>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead className="bg-slate-50 text-left text-slate-500 text-xs uppercase">
                            <tr>
                                <th className="px-4 py-3">Student</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Score</th>
                                <th className="px-4 py-3">Submitted</th>
                                <th className="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No attempts yet.</td></tr>
                            )}
                            {rows.map(r => (
                                <tr key={r.attemptId} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <p className="font-medium">{r.studentName}</p>
                                        <p className="text-xs text-slate-400">{r.studentEmail}</p>
                                    </td>
                                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pill(r.status)}`}>{r.status.replace('_', ' ')}</span></td>
                                    <td className="px-4 py-3 font-semibold">{r.totalScore ?? '—'}</td>
                                    <td className="px-4 py-3 text-slate-500 text-xs">{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}</td>
                                    <td className="px-4 py-3 text-right">
                                        <Link to={`/instructor/exams/${examId}/attempts/${r.attemptId}`} className="text-indigo-600 hover:underline font-medium whitespace-nowrap">Review →</Link>
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
