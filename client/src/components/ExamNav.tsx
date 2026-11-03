import { Link } from 'react-router-dom';

type Page = 'live' | 'analytics' | 'gradebook' | 'similarity';

const LINKS: { page: Page; label: string }[] = [
    { page: 'live', label: 'Live' },
    { page: 'analytics', label: 'Analytics' },
    { page: 'gradebook', label: 'Gradebook' },
    { page: 'similarity', label: 'Similarity' }
];

// One set of links shared by every per-exam instructor page, so no page loses a button
// (before this, Analytics had no Similarity link and Live had no Gradebook-only tools).
export default function ExamNav({ examId, current }: { examId: string | undefined; current: Page }) {
    return (
        <>
            {LINKS.map(l => l.page === current ? (
                <span key={l.page} aria-current="page" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-ink text-white">{l.label}</span>
            ) : (
                <Link key={l.page} to={`/instructor/exams/${examId}/${l.page}`} className="btn-soft px-3 py-1.5 text-xs">{l.label}</Link>
            ))}
        </>
    );
}
