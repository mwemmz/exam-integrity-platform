import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';

const router = Router();
const pool = new Pool();

// Instructor-only route
router.post('/', authenticate, async (req: any, res) => {
    if (req.user.role !== 'instructor') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { title, description, timeLimitMinutes, startsAt, endsAt, randomizeOrder, questions } = req.body;

    try {
        const examResult = await pool.query(
            'INSERT INTO exams (instructor_id, title, description, time_limit_minutes, starts_at, ends_at, randomize_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [req.user.userId, title, description, timeLimitMinutes, startsAt, endsAt, randomizeOrder]
        );
        const examId = examResult.rows[0].id;

        for (const q of questions) {
            await pool.query(
                'INSERT INTO questions (exam_id, type, prompt, points, order_index, options, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [examId, q.type, q.prompt, q.points, q.orderIndex, JSON.stringify(q.options), JSON.stringify(q.correctAnswer)]
            );
        }

        res.status(201).json({ examId });
    } catch (error) {
        res.status(500).json({ error: 'Exam creation failed' });
    }
});

export default router;
