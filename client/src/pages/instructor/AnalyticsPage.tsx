import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

interface Overall {
    total_attempts: number;
    submitted_count: number;
    auto_submitted_count: number;
    in_progress_count: number;
    flagged_count: number;
    avg_score: number | null;
    max_score: number | null;
}

interface Quest {
    id: number;
    type: string;
    prompt: string;
    points: number;
    order_index: number;
    answered_count: number;
    correct_count: number;
    avg_score: number | null;
}

interface AnalyticsData {
    overall: Overall;
    totalPoints: number;
    perQuestion: Quest[];
}

export default function AnalyticsPage() {
    const { examId = '' } = useParams();
    const [exam, setExam] = useState<{ title: string } | null>(null);
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        api(`/api/exams/${examId}`).then(setExam).catch(() => {});
        api<AnalyticsData>(`/api/instructor/exams/${examId}/analytics`)
            .then(setData)
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load analytics'));
    }, [examId]);

    const card = (label: string, value: string | number, sub?: string) => (
        <div className="glass rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-cyan-300 glow-text">{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
            <div>
                <Link to={`/instructor/exams/${examId}/live`} className="text-sky-300 hover:text-sky-200 hover:underline text-sm font-medium">← Back to live view</Link>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-300 to-cyan-300 text-transparent bg-clip-text glow-text">{exam ? `${exam.title} — Analytics` : 'Analytics'}</h1>
            </div>
            {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</div>}
            {!data && !error && <p className="text-slate-400">Loading analytics…</p>}

            {data && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {card('Total attempts', data.overall.total_attempts)}
                        {card('Submitted', data.overall.submitted_count, `${data.overall.in_progress_count} still in progress`)}
                        {card('Completion', data.overall.total_attempts ? `${Math.round((data.overall.submitted_count / data.overall.total_attempts) * 100)}%` : '—')}
                        {card('Auto-submitted', data.overall.auto_submitted_count, 'by violation rules')}
                        {card('Flagged', data.overall.flagged_count, 'flagged or auto-submitted')}
                        {card('Average score', data.overall.avg_score ?? '—', `out of ${data.totalPoints} pts`)}
                        {card('Top score', data.overall.max_score ?? '—')}
                    </div>

                    <div className="glass rounded-xl overflow-hidden">
                        <div className="scroll-x">
                            <table className="tbl w-full text-sm min-w-[720px]">
                                <thead>
                                    <tr>
                                        <th className="th">#</th>
                                        <th className="th">Question</th>
                                        <th className="th">Type</th>
                                        <th className="th">Pts</th>
                                        <th className="th">Answered</th>
                                        <th className="th">Avg score</th>
                                        <th className="th">% wrong (MCQ)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.perQuestion.map(q => {
                                        const wrongPct = q.type === 'mcq' && q.answered_count
                                            ? Math.round(((q.answered_count - q.correct_count) / q.answered_count) * 100)
                                            : null;
                                        return (
                                            <tr key={q.id}>
                                                <td className="td text-slate-500">{q.order_index}</td>
                                                <td className="td max-w-[320px]">
                                                    <p className="truncate" title={q.prompt}>{q.prompt}</p>
                                                </td>
                                                <td className="td"><span className="chip bg-white/5 border border-white/10 text-slate-300">{q.type}</span></td>
                                                <td className="td">{q.points}</td>
                                                <td className="td">{q.answered_count}</td>
                                                <td className="td font-semibold">{q.avg_score ?? '—'}</td>
                                                <td className="td">
                                                    {wrongPct !== null
                                                        ? <span className={`chip ${wrongPct >= 60 ? 'bg-red-500/15 border border-red-400/40 text-red-300' : wrongPct >= 30 ? 'bg-amber-500/15 border border-amber-400/40 text-amber-300' : 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300'}`}>{wrongPct}%</span>
                                                        : <span className="text-slate-500">graded manually</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}