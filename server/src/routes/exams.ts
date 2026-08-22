import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';

const router = Router();
const pool = new Pool();

router.get('/', authenticate, async (req: any, res: Response) => {
    try {
        let result;
        if (req.user.role === 'instructor') {
            result = await pool.query(
                'SELECT * FROM exams WHERE instructor_id = $1 ORDER BY id DESC',
                [req.user.userId]
            );
        } else {
            result = await pool.query(
                'SELECT * FROM exams WHERE published = TRUE ORDER BY id DESC'
            );
        }
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
});

router.get('/:id', authenticate, async (req: any, res: Response) => {
    try {
        const result = await pool.query('SELECT * FROM exams WHERE id = $1', [req.params.id]);
        if (!result.rows.length) return res.status(404).json({ error: 'Exam not found' });
        const exam = result.rows[0];
        if (req.user.role !== 'instructor' && !exam.published) {
            return res.status(403).json({ error: 'Exam not available' });
        }
        res.json(exam);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch exam' });
    }
});

router.get('/:id/questions', authenticate, async (req: any, res: Response) => {
    try {
        const isOwner = req.user.role === 'instructor' &&
            (await pool.query('SELECT 1 FROM exams WHERE id=$1 AND instructor_id=$2', [req.params.id, req.user.userId])).rows.length > 0;
        if (isOwner) {
            const result = await pool.query(
                'SELECT * FROM questions WHERE exam_id = $1 ORDER BY order_index',
                [req.params.id]
            );
            return res.json(result.rows);
        }
        const published = await pool.query('SELECT 1 FROM exams WHERE id=$1 AND published=TRUE', [req.params.id]);
        if (!published.rows.length) return res.status(403).json({ error: 'Exam not available' });
        const result = await pool.query(
            'SELECT id, type, prompt, points, order_index, options FROM questions WHERE exam_id = $1 ORDER BY order_index',
            [req.params.id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch questions' });
    }
});

router.post('/', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { title, description, timeLimitMinutes, startsAt, endsAt, randomizeOrder, webcamEnabled, questions } = req.body;

    if (!title || !Array.isArray(questions)) {
        return res.status(400).json({ error: 'Title and questions are required' });
    }

    try {
        const examResult = await pool.query(
            `INSERT INTO exams (institution_id, instructor_id, title, description, time_limit_minutes, starts_at, ends_at, randomize_order)
             VALUES ((SELECT institution_id FROM users WHERE id = $1), $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [req.user.userId, title, description || null, timeLimitMinutes || 60, startsAt || null, endsAt || null, !!randomizeOrder]
        );
        const examId = examResult.rows[0].id;

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await pool.query(
                'INSERT INTO questions (exam_id, type, prompt, points, order_index, options, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [examId, q.type, q.prompt, q.points || 1, i + 1,
                 q.options ? JSON.stringify(q.options) : null,
                 q.correctAnswer ? JSON.stringify(q.correctAnswer) : null]
            );
        }

        res.status(201).json({ examId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Exam creation failed' });
    }
});

router.post('/:id/publish', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const owner = await pool.query('SELECT 1 FROM exams WHERE id=$1 AND instructor_id=$2', [req.params.id, req.user.userId]);
        if (!owner.rows.length) return res.status(403).json({ error: 'Not your exam' });
        await pool.query('UPDATE exams SET published = NOT published WHERE id = $1', [req.params.id]);
        const updated = await pool.query('SELECT published FROM exams WHERE id = $1', [req.params.id]);
        res.json({ published: updated.rows[0].published });
    } catch (error) {
        res.status(500).json({ error: 'Failed to toggle publish' });
    }
});

export default router;
