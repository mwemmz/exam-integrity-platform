import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';

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

    if (loading) return <div className="p-8 text-[#5b6b84]">Loading exams…</div>;

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6">
            <h1 className="text-[2rem] font-extrabold tracking-tight text-[#f4f7fc]">My Exams</h1>
            <p className="text-sm text-[#5b6b84] mb-6">Exams available to you right now.</p>

            {error && <div className="mb-4 text-sm text-[#b81e16] bg-[#e2231a]/8 border border-[#e2231a]/25 rounded-lg px-3 py-2">{error}</div>}

            {!exams.length && !error && (
                <div className="glass glass-glow rounded-xl p-8 text-center text-[#5b6b84]">
                    No exams have been published yet. Check back later.
                </div>
            )}

            <div className="space-y-3">
                {exams.map(exam => (
                    <div key={exam.id} className="glass glass-glow p-4 sm:p-5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="font-extrabold text-[#0a1322] break-words">{exam.title}</div>
                            {exam.description && <div className="text-sm text-[#5b6b84] mt-0.5">{exam.description}</div>}
                            <div className="text-xs text-[#5b6b84] mt-1">Time limit: {exam.time_limit_minutes} minutes</div>
                        </div>
                        <Link
                            to={`/exam/${exam.id}/consent`}
                            className="shrink-0 btn-primary px-3 sm:px-4 py-2 text-xs sm:text-sm"
                        >
                            Start Exam
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    );
}