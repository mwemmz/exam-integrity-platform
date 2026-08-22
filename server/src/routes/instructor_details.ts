import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';

const router = Router();
const pool = new Pool();

router.get('/exams/:examId/attempts/:attemptId', authenticate, async (req: any, res) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });

    try {
        const attempt = await pool.query(
            'SELECT a.*, u.name as student_name, e.title as exam_title FROM exam_attempts a JOIN users u ON a.student_id = u.id JOIN exams e ON a.exam_id = e.id WHERE a.id = $1',
            [req.params.attemptId]
        );
        const answers = await pool.query('SELECT * FROM answers WHERE attempt_id = $1', [req.params.attemptId]);
        const events = await pool.query('SELECT * FROM integrity_events WHERE attempt_id = $1 ORDER BY timestamp', [req.params.attemptId]);
        const snapshots = await pool.query('SELECT * FROM webcam_snapshots WHERE attempt_id = $1 ORDER BY captured_at', [req.params.attemptId]);

        res.json({ attempt: attempt.rows[0], answers: answers.rows, events: events.rows, snapshots: snapshots.rows });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attempt details' });
    }
});

export default router;
