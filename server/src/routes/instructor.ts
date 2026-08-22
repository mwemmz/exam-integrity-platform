import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';

const router = Router();
const pool = new Pool();

// Get gradebook for exam
router.get('/exams/:examId/gradebook', authenticate, async (req: any, res) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });
    
    try {
        const result = await pool.query(
            'SELECT a.id, u.name as student_name, a.total_score, a.status FROM exam_attempts a JOIN users u ON a.student_id = u.id WHERE a.exam_id = $1',
            [req.params.examId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gradebook' });
    }
});

// Update manual score
router.post('/attempts/:attemptId/grade', authenticate, async (req: any, res) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });
    
    const { questionId, score, feedback } = req.body;
    try {
        await pool.query(
            'UPDATE answers SET manual_score = $1, feedback = $2 WHERE attempt_id = $3 AND question_id = $4',
            [score, feedback, req.params.attemptId, questionId]
        );
        
        // Recalculate total score
        const total = await pool.query(
            'SELECT SUM(COALESCE(auto_score, 0) + COALESCE(manual_score, 0)) as total FROM answers WHERE attempt_id = $1',
            [req.params.attemptId]
        );
        await pool.query('UPDATE exam_attempts SET total_score = $1 WHERE id = $2', [total.rows[0].total, req.params.attemptId]);
        
        res.json({ message: 'Grade updated' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update grade' });
    }
});

export default router;
