import { Router, Response } from 'express';
import { pool } from '../db';
import { authenticate } from '../middleware/auth';
import { findSimilar } from '../lib/similarity';

const router = Router();

// GET /api/instructor/similarity/:examId?threshold=0.6
// Flags pairs of students whose written (essay / practical) answers to the same question are near-identical.
router.get('/:examId', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });
    const threshold = Math.min(1, Math.max(0.3, Number(req.query.threshold) || 0.6));
    try {
        const own = await pool.query('SELECT 1 FROM exams WHERE id = $1 AND instructor_id = $2', [req.params.examId, req.user.userId]);
        if (!own.rows.length) return res.status(403).json({ error: 'Not your exam' });

        const rows = await pool.query(
            `SELECT an.attempt_id, an.question_id, an.response_text, q.prompt, u.name AS student_name
             FROM answers an
             JOIN exam_attempts a ON a.id = an.attempt_id
             JOIN questions q ON q.id = an.question_id
             JOIN users u ON u.id = a.student_id
             WHERE a.exam_id = $1 AND q.type <> 'mcq' AND a.status <> 'in_progress'`,
            [req.params.examId]
        );

        const names = new Map<number, string>();
        const prompts = new Map<number, string>();
        for (const r of rows.rows) {
            names.set(r.attempt_id, r.student_name);
            prompts.set(r.question_id, r.prompt);
        }

        const matches = findSimilar(
            rows.rows.map(r => ({ attemptId: r.attempt_id, questionId: r.question_id, text: r.response_text || '' })),
            { threshold }
        ).map(m => ({
            ...m,
            studentA: names.get(m.attemptA),
            studentB: names.get(m.attemptB),
            question: prompts.get(m.questionId)
        }));

        res.json({ threshold, method: 'word 3-gram Jaccard similarity', matches });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to run similarity check' });
    }
});

export default router;
