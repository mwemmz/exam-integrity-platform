import { Router, Request, Response } from 'express';
import { pool } from '../db';

import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/exams/:examId/gradebook', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });

    try {
        const result = await pool.query(
            `SELECT a.id AS attempt_id, a.status, a.total_score, a.submitted_at,
                    u.name AS student_name
             FROM exam_attempts a JOIN users u ON a.student_id = u.id
             WHERE a.exam_id = $1 ORDER BY u.name`,
            [req.params.examId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gradebook' });
    }
});

router.post('/attempts/:attemptId/grade', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });

    const { questionId, score, feedback } = req.body;
    if (!questionId) return res.status(400).json({ error: 'questionId required' });

    try {
        const existing = await pool.query(
            'SELECT id FROM answers WHERE attempt_id = $1 AND question_id = $2',
            [req.params.attemptId, questionId]
        );
        if (!existing.rows.length) {
            await pool.query(
                'INSERT INTO answers (attempt_id, question_id, manual_score, feedback) VALUES ($1, $2, $3, $4)',
                [req.params.attemptId, questionId, score ?? null, feedback ?? null]
            );
        } else {
            await pool.query(
                'UPDATE answers SET manual_score = $1, feedback = $2 WHERE id = $3',
                [score === '' || score === undefined ? null : Number(score), feedback ?? null, existing.rows[0].id]
            );
        }

        const total = await pool.query(
            'SELECT COALESCE(SUM(COALESCE(auto_score, 0) + COALESCE(manual_score, 0)), 0) AS total FROM answers WHERE attempt_id = $1',
            [req.params.attemptId]
        );
        await pool.query('UPDATE exam_attempts SET total_score = $1 WHERE id = $2', [total.rows[0].total, req.params.attemptId]);

        res.json({ message: 'Grade updated', totalScore: total.rows[0].total });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update grade' });
    }
});

router.post('/exams/:examId/release', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });
    const { gradesReleased } = req.body;
    try {
        await pool.query(
            'UPDATE exams SET grades_released = $1 WHERE id = $2 AND instructor_id = $3',
            [!!gradesReleased, req.params.examId, req.user.userId]
        );
        res.json({ gradesReleased: !!gradesReleased });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update release status' });
    }
});

export default router;
