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
                <div className="glass-strong p-8">
                    <h1 className="text-lg font-extrabold mb-2 text-[#b45309]">Grades not released yet</h1>
                    <p className="text-sm text-[#5b6b84] mb-4">Your exam was submitted successfully. Your instructor will release the grades when grading is complete.</p>
                    {getAuthUser()?.role === 'instructor'
                        ? <Link to="/instructor" className="text-[#e2231a] hover:text-[#b81e16] hover:underline text-sm font-medium">Back to dashboard</Link>
                        : <Link to="/student" className="text-[#e2231a] hover:text-[#b81e16] hover:underline text-sm font-medium">Back to dashboard</Link>}
                </div>
            </div>
        );
    }

    if (!data) return <div className="p-8 text-[#5b6b84]">Loading results…</div>;

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
            <div className="glass-strong p-6">
                <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
                    <h1 className="text-xl font-extrabold tracking-tight text-[#0a1322]">Your Result</h1>
                    <span className={`chip ${
                        data.status === 'auto_submitted'
                            ? 'bg-[#e2231a]/10 text-[#b81e16] border border-[#e2231a]/25'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}>
                        {data.status === 'auto_submitted' ? 'Auto-submitted' : 'Submitted'}
                    </span>
                </div>
                {data.submittedAt && <p className="text-xs text-[#5b6b84] mb-3">Submitted {new Date(data.submittedAt).toLocaleString()}</p>}
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold tracking-tight text-[#e2231a]">{data.totalScore ?? '—'}</span>
                    <span className="text-[#5b6b84] text-sm">total points
                        {data.answers.length > 0 && ` (${data.answers.reduce((s, a) => s + a.points, 0)} possible)`}
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                {data.answers.map((a, i) => {
                    const score = a.manual_score ?? a.auto_score;
                    return (
                        <div key={a.question_id} className="glass glass-glow p-5">
                            <div className="flex items-start justify-between gap-4 mb-2">
                                <p className="font-extrabold text-sm text-[#0a1322]">{i + 1}. {a.prompt}</p>
                                <span className={`shrink-0 chip ${score != null
                                    ? 'bg-[#13203c]/8 text-[#13203c] border border-[#e2e8f2]'
                                    : 'bg-[#0a1322]/5 text-[#5b6b84] border border-[#e2e8f2]'}`}>
                                    {score != null ? `${score} / ${a.points}` : `${a.points} pts`}
                                </span>
                            </div>
                            {a.response_text && (
                                <pre className="text-xs bg-[#0a1322]/4 border border-[#e2e8f2] rounded-lg p-3 whitespace-pre-wrap font-sans text-[#2c3a55]">{a.response_text}</pre>
                            )}
                        </div>
                    );
                })}
            </div>

            <Link to={getAuthUser()?.role === 'instructor' ? '/instructor' : '/student'} className="inline-block text-[#e2231a] hover:text-[#b81e16] hover:underline text-sm font-medium">
                ← Back to dashboard
            </Link>
        </div>
    );
}