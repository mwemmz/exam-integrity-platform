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

    if (loading) return <div className="p-8 text-slate-500">Loading exams…</div>;

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6">
            <h1 className="text-2xl font-bold mb-1">My Exams</h1>
            <p className="text-sm text-slate-500 mb-6">Exams available to you right now.</p>

            {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

            {!exams.length && !error && (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                    No exams have been published yet. Check back later.
                </div>
            )}

            <div className="space-y-3">
                {exams.map(exam => (
                    <div key={exam.id} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="font-semibold break-words">{exam.title}</div>
                            {exam.description && <div className="text-sm text-slate-500 mt-0.5">{exam.description}</div>}
                            <div className="text-xs text-slate-400 mt-1">Time limit: {exam.time_limit_minutes} minutes</div>
                        </div>
                        <Link
                            to={`/exam/${exam.id}/consent`}
                            className="shrink-0 bg-indigo-600 text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-indigo-700"
                        >
                            Start Exam
                        </Link>
                    </div>
                ))}
            </div>
        </div>
    );
}
