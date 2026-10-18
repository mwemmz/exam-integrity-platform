import { Router, Request, Response } from 'express';
import { pool } from '../db';

import { authenticate } from '../middleware/auth';

const router = Router();

const EXAM_COLS = `e.id, e.institution_id, e.instructor_id, e.title, e.description, e.time_limit_minutes,
    e.starts_at, e.ends_at, e.randomize_order, e.published, e.grades_released,
    CASE WHEN e.published THEN 'published' ELSE 'draft' END AS status`;

router.get('/', authenticate, async (req: any, res: Response) => {
    try {
        let result;
        if (req.user.role === 'instructor') {
            result = await pool.query(
                `SELECT ${EXAM_COLS},
                        COALESCE(json_agg(DISTINCT g.name) FILTER (WHERE g.id IS NOT NULL), '[]') AS assigned_groups
                 FROM exams e
                 LEFT JOIN exam_assignments ea ON ea.exam_id = e.id
                 LEFT JOIN student_groups g ON g.id = ea.group_id
                 WHERE e.instructor_id = $1
                 GROUP BY e.id
                 ORDER BY e.id DESC`,
                [req.user.userId]
            );
        } else {
            result = await pool.query(
                `SELECT ${EXAM_COLS} FROM exams e
                 WHERE e.published = TRUE AND
                   (NOT EXISTS (SELECT 1 FROM exam_assignments WHERE exam_id = e.id)
                    OR EXISTS (SELECT 1 FROM exam_assignments xa
                               JOIN student_group_members m ON m.group_id = xa.group_id
                               WHERE xa.exam_id = e.id AND m.student_id = $1))
                 ORDER BY e.id DESC`,
                [req.user.userId]
            );
        }
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
});

router.get('/:id', authenticate, async (req: any, res: Response) => {
    try {
        const result = await pool.query(`SELECT ${EXAM_COLS} FROM exams e WHERE e.id = $1`, [req.params.id]);
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

router.get('/:id/assignments', authenticate, async (req: any, res: Response) => {
    try {
        const result = await pool.query(
            'SELECT group_id FROM exam_assignments WHERE exam_id = $1',
            [req.params.id]
        );
        res.json(result.rows.map(r => r.group_id));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch assignments' });
    }
});

router.post('/', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { title, description, timeLimitMinutes, startsAt, endsAt, randomizeOrder, webcamEnabled, proctoringPolicy, groupIds, questions } = req.body;

    if (!title || !Array.isArray(questions)) {
        return res.status(400).json({ error: 'Title and questions are required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const examResult = await client.query(
            `INSERT INTO exams (institution_id, instructor_id, title, description, time_limit_minutes, starts_at, ends_at, randomize_order, webcam_enabled, proctoring_policy)
             VALUES ((SELECT institution_id FROM users WHERE id = $1), $1, $2, $3, $4, $5, $6, $7, COALESCE($8, FALSE), $9) RETURNING id`,
            [req.user.userId, title, description || null, timeLimitMinutes || 60, startsAt || null, endsAt || null, !!randomizeOrder, webcamEnabled ?? null, proctoringPolicy === 'flag_only' ? 'flag_only' : 'auto_submit']
        );
        const examId = examResult.rows[0].id;

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await client.query(
                'INSERT INTO questions (exam_id, type, prompt, points, order_index, options, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [examId, q.type, q.prompt, q.points || 1, i + 1,
                 q.options ? JSON.stringify(q.options) : null,
                 q.correctAnswer ? JSON.stringify(q.correctAnswer) : null]
            );
        }

        if (Array.isArray(groupIds) && groupIds.length) {
            for (const gid of groupIds) {
                await client.query(
                    'INSERT INTO exam_assignments (exam_id, group_id) VALUES ($1, $2)',
                    [examId, gid]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ examId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Exam creation failed' });
    } finally {
        client.release();
    }
});

router.post('/:id/duplicate', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });
    const client = await pool.connect();
    try {
        const owner = await client.query('SELECT * FROM exams WHERE id=$1 AND instructor_id=$2', [req.params.id, req.user.userId]);
        if (!owner.rows.length) return res.status(403).json({ error: 'Not your exam' });
        const src = owner.rows[0];

        await client.query('BEGIN');
        const copyRes = await client.query(
            `INSERT INTO exams (institution_id, instructor_id, title, description, time_limit_minutes, starts_at, ends_at, randomize_order, webcam_enabled, proctoring_policy, published, grades_released)
             VALUES ($1, $2, $3, $4, $5, NULL, NULL, $6, COALESCE($7, FALSE), $8, FALSE, FALSE)
             RETURNING id`,
            [src.institution_id, req.user.userId, `${src.title} (Copy)`, src.description, src.time_limit_minutes, src.randomize_order, src.webcam_enabled, src.proctoring_policy || 'auto_submit']
        );
        const examId = copyRes.rows[0].id;

        const questions = await client.query(
            'SELECT * FROM questions WHERE exam_id = $1 ORDER BY order_index',
            [req.params.id]
        );
        for (let i = 0; i < questions.rows.length; i++) {
            const q = questions.rows[i];
            await client.query(
                'INSERT INTO questions (exam_id, type, prompt, points, order_index, options, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [examId, q.type, q.prompt, q.points, i + 1, q.options ? JSON.stringify(q.options) : null, q.correct_answer ? JSON.stringify(q.correct_answer) : null]
            );
        }

        const assignments = await client.query(
            'SELECT group_id FROM exam_assignments WHERE exam_id = $1',
            [req.params.id]
        );
        for (const a of assignments.rows) {
            await client.query('INSERT INTO exam_assignments (exam_id, group_id) VALUES ($1, $2)', [examId, a.group_id]);
        }

        await client.query('COMMIT');
        res.status(201).json({ examId, status: 'draft' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Failed to duplicate exam' });
    } finally {
        client.release();
    }
});

router.post('/:id/assignments', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });
    const { groupIds } = req.body;
    if (!Array.isArray(groupIds)) return res.status(400).json({ error: 'groupIds (array) required' });

    const client = await pool.connect();
    try {
        const owner = await client.query('SELECT 1 FROM exams WHERE id=$1 AND instructor_id=$2', [req.params.id, req.user.userId]);
        if (!owner.rows.length) return res.status(403).json({ error: 'Not your exam' });

        await client.query('BEGIN');
        await client.query('DELETE FROM exam_assignments WHERE exam_id = $1', [req.params.id]);
        for (const gid of groupIds) {
            await client.query('INSERT INTO exam_assignments (exam_id, group_id) VALUES ($1, $2)', [req.params.id, gid]);
        }
        await client.query('COMMIT');
        res.json({ groupIds });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to update assignments' });
    } finally {
        client.release();
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