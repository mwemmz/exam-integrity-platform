import { Router, Request, Response } from 'express';
import { pool } from '../../db';

import { authenticate } from '../../middleware/auth';
import { broadcastAttemptUpdate } from '../../realtime';

const router = Router();

const MAX_TAB_SWITCHES = 5;
const MAX_FULLSCREEN_EXIT_SECONDS = 30;
const MAX_FACE_MISSING_SECONDS = 90;
const MAX_MULTI_FACE_SECONDS = 30;

async function evaluateRules(attemptId: string | number): Promise<{ triggered: boolean; rule?: string }> {
    const attempt = await pool.query('SELECT status FROM exam_attempts WHERE id = $1', [attemptId]);
    if (!attempt.rows.length || attempt.rows[0].status !== 'in_progress') {
        return { triggered: false };
    }

    const events = await pool.query('SELECT event_type, metadata FROM integrity_events WHERE attempt_id = $1', [attemptId]);
    const rows = events.rows;

    const tabSwitches = rows.filter(e => e.event_type === 'tab_switch').length;
    if (tabSwitches > MAX_TAB_SWITCHES) {
        return { triggered: true, rule: `More than ${MAX_TAB_SWITCHES} tab switches` };
    }

    function sumSeconds(eventType: string): number {
        let total = 0;
        for (const e of rows) {
            if (e.event_type === eventType && e.metadata) {
                const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata;
                total += Number(meta.seconds) || 0;
            }
        }
        return total;
    }

    const fullscreenSeconds = sumSeconds('fullscreen_exit');
    if (fullscreenSeconds > MAX_FULLSCREEN_EXIT_SECONDS) {
        return { triggered: true, rule: `Full-screen exited for more than ${MAX_FULLSCREEN_EXIT_SECONDS} seconds in total` };
    }

    const faceMissingSeconds = sumSeconds('face_missing');
    if (faceMissingSeconds > MAX_FACE_MISSING_SECONDS) {
        return { triggered: true, rule: `No face detected for more than ${MAX_FACE_MISSING_SECONDS} seconds in total` };
    }

    const multiFaceSeconds = sumSeconds('multi_face');
    if (multiFaceSeconds > MAX_MULTI_FACE_SECONDS) {
        return { triggered: true, rule: `More than one person detected for more than ${MAX_MULTI_FACE_SECONDS} seconds in total` };
    }

    return { triggered: false };
}

router.post('/:attemptId/event', authenticate, async (req: any, res: Response) => {
    const { eventType, metadata } = req.body;
    const validEvents = ['tab_switch', 'fullscreen_exit', 'paste_blocked', 'face_missing', 'multi_face', 'phone_detected', 'voice_detected', 'gaze_away'];
    if (!validEvents.includes(eventType)) {
        return res.status(400).json({ error: 'Invalid event type' });
    }

    try {
        const owned = await pool.query('SELECT 1 FROM exam_attempts WHERE id = $1 AND student_id = $2', [req.params.attemptId, req.user.userId]);
        if (!owned.rows.length) return res.status(403).json({ error: 'Not your attempt' });

        await pool.query(
            'INSERT INTO integrity_events (attempt_id, event_type, metadata) VALUES ($1, $2, $3)',
            [req.params.attemptId, eventType, metadata ? JSON.stringify(metadata) : null]
        );

        const evaluation = await evaluateRules(req.params.attemptId);
        if (evaluation.triggered && evaluation.rule) {
            const pol = await pool.query(
                'SELECT e.proctoring_policy FROM exams e JOIN exam_attempts a ON a.exam_id = e.id WHERE a.id = $1',
                [req.params.attemptId]
            );
            if (pol.rows[0]?.proctoring_policy === 'flag_only') {
                // Human-in-the-loop: do not end the exam, queue it for instructor review (once per rule).
                const already = await pool.query(
                    "SELECT 1 FROM integrity_events WHERE attempt_id = $1 AND event_type = 'policy_flagged' AND metadata->>'rule' = $2",
                    [req.params.attemptId, evaluation.rule]
                );
                if (!already.rows.length) {
                    await pool.query('UPDATE exam_attempts SET flagged_for_review = TRUE WHERE id = $1', [req.params.attemptId]);
                    await pool.query(
                        'INSERT INTO integrity_events (attempt_id, event_type, metadata) VALUES ($1, $2, $3)',
                        [req.params.attemptId, 'policy_flagged', JSON.stringify({ rule: evaluation.rule })]
                    );
                }
                const ex = await pool.query('SELECT exam_id FROM exam_attempts WHERE id = $1', [req.params.attemptId]);
                if (ex.rows.length) await broadcastAttemptUpdate(ex.rows[0].exam_id, req.params.attemptId);
                return res.status(201).json({ message: 'Event logged', autoSubmitted: false, flagged: true });
            }

            await pool.query(
                "UPDATE exam_attempts SET status = 'auto_submitted', submitted_at = NOW() WHERE id = $1 AND status = 'in_progress'",
                [req.params.attemptId]
            );
            await pool.query(
                'INSERT INTO integrity_events (attempt_id, event_type, metadata) VALUES ($1, $2, $3)',
                [req.params.attemptId, 'auto_submit_triggered', JSON.stringify({ rule: evaluation.rule })]
            );
            const examRow = await pool.query('SELECT exam_id FROM exam_attempts WHERE id = $1', [req.params.attemptId]);
            if (examRow.rows.length) await broadcastAttemptUpdate(examRow.rows[0].exam_id, req.params.attemptId);
            return res.status(200).json({ autoSubmitted: true, rule: evaluation.rule });
        }

        const examRow = await pool.query('SELECT exam_id FROM exam_attempts WHERE id = $1', [req.params.attemptId]);
        if (examRow.rows.length) await broadcastAttemptUpdate(examRow.rows[0].exam_id, req.params.attemptId);

        res.status(201).json({ message: 'Event logged', autoSubmitted: false });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to log event' });
    }
});

export default router;
