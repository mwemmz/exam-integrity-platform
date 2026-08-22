import { Router } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../../middleware/auth';

const router = Router();
const pool = new Pool();

// Log integrity event and check rules
router.post('/:attemptId/event', authenticate, async (req: any, res) => {
    const { eventType, metadata } = req.body;
    const { attemptId } = req.params;

    try {
        await pool.query(
            'INSERT INTO integrity_events (attempt_id, event_type, metadata) VALUES ($1, $2, $3)',
            [attemptId, eventType, JSON.stringify(metadata)]
        );

        // Check rules
        const events = await pool.query('SELECT * FROM integrity_events WHERE attempt_id = $1', [attemptId]);
        const tabSwitches = events.rows.filter(e => e.event_type === 'tab_switch').length;

        if (tabSwitches > 5) {
            await pool.query('UPDATE exam_attempts SET status = $1 WHERE id = $2', ['auto_submitted', attemptId]);
            await pool.query(
                'INSERT INTO integrity_events (attempt_id, event_type, metadata) VALUES ($1, $2, $3)',
                [attemptId, 'auto_submit_triggered', JSON.stringify({ reason: 'too_many_tab_switches' })]
            );
            return res.status(200).json({ autoSubmitted: true, message: 'Exam auto-submitted' });
        }

        res.status(201).json({ message: 'Event logged' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to log event' });
    }
});

export default router;
