import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

interface Match {
    questionId: number;
    attemptA: number;
    attemptB: number;
    similarity: number;
    studentA?: string;
    studentB?: string;
    question?: string;
}

interface Result {
    threshold: number;
    method: string;
    matches: Match[];
}

export default function SimilarityPage() {
    const { examId } = useParams();
    const [threshold, setThreshold] = useState(0.6);
    const [data, setData] = useState<Result | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setError('');
        try {
            setData(await api<Result>(`/api/instructor/similarity/${examId}?threshold=${threshold}`));
        } catch (e: any) {
            setError(e.message || 'Failed to run similarity check');
        }
    }, [examId, threshold]);

    useEffect(() => { void load(); }, [load]);

    return (
        <div className="space-y-4">
            <Link to={`/instructor/exams/${examId}/gradebook`} className="text-accent hover:text-accent-strong hover:underline text-sm font-medium">← Gradebook</Link>
            <h1 className="text-2xl font-extrabold text-ink">Answer similarity check</h1>
            <p className="text-sm text-muted">
                Compares written answers (essay and practical) between students on the same question. A high score is a prompt
                to review the two attempts, not proof of copying.
            </p>

            <label className="flex items-center gap-3 text-sm text-ink">
                Flag at or above {Math.round(threshold * 100)}% similarity
                <input type="range" min={0.3} max={0.95} step={0.05} value={threshold} onChange={e => setThreshold(Number(e.target.value))} />
            </label>

            {error && <p className="text-danger">{error}</p>}
            {!data && !error && <p className="text-muted">Running check…</p>}
            {data && data.matches.length === 0 && <p className="text-muted">No pairs at or above this threshold.</p>}

            {data && data.matches.length > 0 && (
                <div className="glass overflow-hidden">
                    <div className="scroll-x">
                        <table className="tbl w-full text-sm min-w-[640px]">
                            <thead>
                                <tr>
                                    <th className="th">Similarity</th>
                                    <th className="th">Students</th>
                                    <th className="th">Question</th>
                                    <th className="th">Review</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.matches.map((m, i) => (
                                    <tr key={i}>
                                        <td className="td font-extrabold text-danger">{Math.round(m.similarity * 100)}%</td>
                                        <td className="td text-ink">{m.studentA} &amp; {m.studentB}</td>
                                        <td className="td max-w-[320px]"><p className="truncate" title={m.question}>{m.question}</p></td>
                                        <td className="td whitespace-nowrap">
                                            <Link className="text-accent hover:underline font-semibold mr-3" to={`/instructor/exams/${examId}/attempts/${m.attemptA}`}>A →</Link>
                                            <Link className="text-accent hover:underline font-semibold" to={`/instructor/exams/${examId}/attempts/${m.attemptB}`}>B →</Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
