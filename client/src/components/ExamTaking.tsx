import { useState, useEffect } from 'react';
import IntegrityTracker from './IntegrityTracker';
import WebcamSnapshot from './WebcamSnapshot';

export default function ExamTaking({ attemptId, questions }: { attemptId: number, questions: any[] }) {
    const [answers, setAnswers] = useState<Record<number, string>>({});

    const saveAnswer = async (questionId: number, text: string) => {
        await fetch(`/api/attempts/${attemptId}/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questionId, responseText: text })
        });
    };

    // Auto-save every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            Object.entries(answers).forEach(([qId, text]) => saveAnswer(Number(qId), text));
        }, 30000);
        return () => clearInterval(interval);
    }, [answers]);

    return (
        <div className="p-4">
            <IntegrityTracker attemptId={attemptId} />
            <WebcamSnapshot attemptId={attemptId} />
            {questions.map((q) => (
                <div key={q.id} className="mb-6">
                    <p>{q.prompt}</p>
                    <textarea 
                        className="w-full border p-2"
                        onChange={(e) => setAnswers({...answers, [q.id]: e.target.value})}
                    />
                </div>
            ))}
        </div>
    );
}
