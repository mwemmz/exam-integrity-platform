import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { IconArrow } from '../../components/Icons';

const TINTS = ['tint-1', 'tint-2', 'tint-3'];

interface Exam {
    id: number;
    title: string;
    description: string | null;
    time_limit_minutes: number;
    published: boolean;
    grades_released?: boolean;
}

export default function StudentDashboard() {
    const [exams, setExams] = useState<Exam[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api<Exam[]>('/api/exams')
            .then(setExams)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-8 text-muted">Loading exams…</div>;

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6">
            <h1 className="text-[2rem] font-extrabold tracking-tight text-on-canvas">My Exams</h1>
            <p className="text-sm text-muted mb-6">Exams available to you right now.</p>

            {error && <div className="mb-4 text-sm text-danger bg-danger/8 border border-danger/25 rounded-lg px-3 py-2">{error}</div>}

            {!exams.length && !error && (
                <div className="glass glass-glow p-8 text-center text-muted">
                    No exams have been published yet. Check back later.
                </div>
            )}

            {exams.length > 0 && (
                <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="tinted tint-1 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Available</p>
                        <p className="text-2xl font-extrabold text-ink">{exams.length}</p>
                    </div>
                    <div className="tinted tint-2 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Next time limit</p>
                        <p className="text-2xl font-extrabold text-ink">{exams[0].time_limit_minutes} min</p>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {exams.map((exam, i) => (
                    <div key={exam.id} className={`tinted ${TINTS[i % 3]} glass-glow p-4 sm:p-5 flex items-center justify-between gap-3`}>
                        <div className="min-w-0">
                            <div className="font-extrabold text-ink break-words">{exam.title}</div>
                            {exam.description && <div className="text-sm text-ink-soft mt-0.5">{exam.description}</div>}
                            <span className="chip mt-2 bg-surface/70 text-ink-soft border border-line">{exam.time_limit_minutes} min</span>
                        </div>
                        <Link
                            to={`/exam/${exam.id}/consent`}
                            className="shrink-0 btn-primary px-3 sm:px-4 py-2 text-xs sm:text-sm"
                        >
                            Start <IconArrow size={16} />
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    );
}