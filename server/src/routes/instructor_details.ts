import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';

const router = Router();
const pool = new Pool();

router.get('/exams/:examId/attempts/:attemptId', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });

    try {
        const attempt = await pool.query(
            `SELECT a.*, u.name AS student_name, e.title AS exam_title
             FROM exam_attempts a JOIN users u ON a.student_id = u.id JOIN exams e ON a.exam_id = e.id
             WHERE a.id = $1`,
            [req.params.attemptId]
        );
        if (!attempt.rows.length) return res.status(404).json({ error: 'Attempt not found' });

        const answers = await pool.query(
            `SELECT q.id AS question_id, q.type, q.prompt, q.points, q.options, q.correct_answer,
                    an.response_text, an.file_url, an.auto_score, an.manual_score, an.feedback
             FROM questions q
             LEFT JOIN answers an ON an.question_id = q.id AND an.attempt_id = $1
             WHERE q.exam_id = $2
             ORDER BY q.order_index`,
            [req.params.attemptId, req.params.examId]
        );

        const events = await pool.query(
            'SELECT * FROM integrity_events WHERE attempt_id = $1 ORDER BY "timestamp"',
            [req.params.attemptId]
        );

        const snapshots = await pool.query(
            'SELECT id, image_url, captured_at FROM webcam_snapshots WHERE attempt_id = $1 ORDER BY captured_at',
            [req.params.attemptId]
        );

        res.json({
            attempt: attempt.rows[0],
            answers: answers.rows,
            events: events.rows,
            snapshots: snapshots.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch attempt details' });
    }
});

export default router;
