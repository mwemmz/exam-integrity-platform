import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getAuthUser } from '../../lib/api';

interface AnswerRow {
    question_id: number;
    type: string;
    prompt: string;
    points: number;
    response_text?: string | null;
    auto_score?: number | null;
    manual_score?: number | null;
}

interface ResultData {
    status: string;
    submittedAt: string | null;
    totalScore: number | null;
    gradesReleased: boolean;
    answers: AnswerRow[];
}

export default function ResultsPage() {
    const { attemptId } = useParams();
    const [data, setData] = useState<ResultData | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        api<ResultData>(`/api/attempts/${attemptId}/result`)
            .then(setData)
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load results'));
    }, [attemptId]);

    if (error) {
        return (
            <div className="p-8 max-w-xl mx-auto text-center">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-8">
                    <h1 className="text-lg font-semibold mb-2">Grades not released yet</h1>
                    <p className="text-sm text-slate-600 mb-4">Your exam was submitted successfully. Your instructor will release the grades when grading is complete.</p>
                    {getAuthUser()?.role === 'instructor'
                        ? <Link to="/instructor" className="text-indigo-600 hover:underline text-sm font-medium">Back to dashboard</Link>
                        : <Link to="/student" className="text-indigo-600 hover:underline text-sm font-medium">Back to dashboard</Link>}
                </div>
            </div>
        );
    }

    if (!data) return <div className="p-8 text-slate-500">Loading results…</div>;

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-xl font-bold">Your Result</h1>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        data.status === 'auto_submitted' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                        {data.status === 'auto_submitted' ? 'Auto-submitted' : 'Submitted'}
                    </span>
                </div>
                {data.submittedAt && <p className="text-xs text-slate-400 mb-3">Submitted {new Date(data.submittedAt).toLocaleString()}</p>}
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold">{data.totalScore ?? '—'}</span>
                    <span className="text-slate-500 text-sm">total points
                        {data.answers.length > 0 && ` (${data.answers.reduce((s, a) => s + a.points, 0)} possible)`}
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                {data.answers.map((a, i) => {
                    const score = a.manual_score ?? a.auto_score;
                    return (
                        <div key={a.question_id} className="bg-white border border-slate-200 rounded-xl p-5">
                            <div className="flex items-start justify-between gap-4 mb-2">
                                <p className="font-medium text-sm">{i + 1}. {a.prompt}</p>
                                <span className={`shrink-0 text-xs px-2 py-1 rounded-full ${score != null ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {score != null ? `${score} / ${a.points}` : `${a.points} pts`}
                                </span>
                            </div>
                            {a.response_text && (
                                <pre className="text-xs bg-slate-50 border border-slate-100 rounded-lg p-3 whitespace-pre-wrap font-sans text-slate-700">{a.response_text}</pre>
                            )}
                        </div>
                    );
                })}
            </div>

            <Link to={getAuthUser()?.role === 'instructor' ? '/instructor' : '/student'} className="inline-block text-indigo-600 hover:underline text-sm font-medium">
                ← Back to dashboard
            </Link>
        </div>
    );
}
