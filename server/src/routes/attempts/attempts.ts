import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../../middleware/auth';

const router = Router();
const pool = new Pool();

// Start exam
router.post('/:examId/start', authenticate, async (req: any, res) => {
    try {
        const result = await pool.query(
            'INSERT INTO exam_attempts (exam_id, student_id, status) VALUES ($1, $2, $3) RETURNING id',
            [req.params.examId, req.user.userId, 'in_progress']
        );
        res.status(201).json({ attemptId: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to start exam' });
    }
});

// Auto-save answer
router.post('/:attemptId/answer', authenticate, async (req: any, res) => {
    const { questionId, responseText } = req.body;
    try {
        await pool.query(
            'INSERT INTO answers (attempt_id, question_id, response_text) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET response_text = $3',
            [req.params.attemptId, questionId, responseText]
        );
        res.json({ message: 'Answer saved' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save answer' });
    }
});

export default router;
