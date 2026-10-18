import { Router, Request, Response } from 'express';
import { pool } from '../../db';

import { passbackAttempt } from '../lti';
import { authenticate } from '../../middleware/auth';
import { broadcastAttemptUpdate } from '../../realtime';

const router = Router();

router.post('/:examId/start', authenticate, async (req: any, res: Response) => {
    try {
        const existing = await pool.query(
            "SELECT id, end_time FROM exam_attempts WHERE exam_id = $1 AND student_id = $2 AND status = 'in_progress'",
            [req.params.examId, req.user.userId]
        );
        if (existing.rows.length) {
            return res.json({ attemptId: existing.rows[0].id, endTime: existing.rows[0].end_time, resumed: true });
        }

        const exam = await pool.query('SELECT * FROM exams WHERE id = $1 AND published = TRUE', [req.params.examId]);
        if (!exam.rows.length) return res.status(403).json({ error: 'Exam not available' });
        const selected = exam.rows[0];

        const acc = await pool.query(
            'SELECT * FROM exam_accommodations WHERE exam_id = $1 AND student_id = $2',
            [req.params.examId, req.user.userId]
        );
        const accommodation = acc.rows[0] || {};

        const limitMinutes = (selected.time_limit_minutes || 0) + (Number(accommodation.extra_time_minutes) || 0);
        const endFromLimit = new Date(Date.now() + limitMinutes * 60000);
        const customEnd = accommodation.custom_end_at ? new Date(accommodation.custom_end_at) : null;
        const startWindowOpen = !accommodation.custom_start_at || new Date(accommodation.custom_start_at) <= new Date();
        const endTime = customEnd && customEnd < endFromLimit ? customEnd : endFromLimit;

        if (!startWindowOpen) {
            return res.status(409).json({ error: 'Exam window has not opened for you yet' });
        }
        if (customEnd && new Date() >= customEnd) {
            return res.status(409).json({ error: 'Your exam window has already closed' });
        }

        const result = await pool.query(
            'INSERT INTO exam_attempts (exam_id, student_id, status, end_time) VALUES ($1, $2, $3, $4) RETURNING id',
            [req.params.examId, req.user.userId, 'in_progress', endTime.toISOString()]
        );
        const attemptId = result.rows[0].id;
        await broadcastAttemptUpdate(req.params.examId, attemptId);
        res.status(201).json({ attemptId, endTime: endTime.toISOString(), timeLimitMinutes: limitMinutes, resumed: false });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to start exam' });
    }
});

router.get('/:attemptId/status', authenticate, async (req: any, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT a.id, a.status, a.started_at, a.end_time, e.time_limit_minutes,
                    (SELECT ie.metadata FROM integrity_events ie
                     WHERE ie.attempt_id = a.id AND ie.event_type = 'auto_submit_triggered'
                     ORDER BY ie."timestamp" DESC LIMIT 1) AS auto_submit_reason
             FROM exam_attempts a JOIN exams e ON a.exam_id = e.id WHERE a.id = $1`,
            [req.params.attemptId]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Attempt not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

router.post('/:attemptId/answer', authenticate, async (req: any, res: Response) => {
    const { questionId, responseText } = req.body;
    if (!questionId) return res.status(400).json({ error: 'questionId required' });

    try {
        const attempt = await pool.query('SELECT status FROM exam_attempts WHERE id = $1', [req.params.attemptId]);
        if (!attempt.rows.length || attempt.rows[0].status !== 'in_progress') {
            return res.status(409).json({ error: 'Attempt is locked' });
        }

        const existing = await pool.query(
            'SELECT id FROM answers WHERE attempt_id = $1 AND question_id = $2',
            [req.params.attemptId, questionId]
        );
        if (existing.rows.length) {
            await pool.query('UPDATE answers SET response_text = $1 WHERE id = $2', [responseText ?? null, existing.rows[0].id]);
        } else {
            await pool.query(
                'INSERT INTO answers (attempt_id, question_id, response_text) VALUES ($1, $2, $3)',
                [req.params.attemptId, questionId, responseText ?? null]
            );
        }
        res.json({ message: 'Answer saved' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save answer' });
    }
});

function normalizeSelection(raw: any): string {
    let arr: number[] = [];
    try {
        arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(arr)) arr = [];
    } catch {
        arr = [];
    }
    return [...arr].sort((a, b) => a - b).join(',');
}

router.post('/:attemptId/submit', authenticate, async (req: any, res: Response) => {
    try {
        const attempt = await pool.query(
            'SELECT * FROM exam_attempts WHERE id = $1 AND student_id = $2',
            [req.params.attemptId, req.user.userId]
        );
        if (!attempt.rows.length) return res.status(404).json({ error: 'Attempt not found' });
        if (attempt.rows[0].status !== 'in_progress') {
            return res.status(409).json({ error: 'Already submitted' });
        }

        const questions = await pool.query(
            "SELECT * FROM questions WHERE type = 'mcq' AND exam_id = (SELECT exam_id FROM exam_attempts WHERE id = $1)",
            [req.params.attemptId]
        );

        for (const q of questions.rows) {
            const ans = await pool.query(
                'SELECT response_text FROM answers WHERE attempt_id = $1 AND question_id = $2',
                [req.params.attemptId, q.id]
            );
            const selected = ans.rows.length ? normalizeSelection(ans.rows[0].response_text) : '';
            const correct = normalizeSelection(q.correct_answer);
            const score = selected !== '' && selected === correct ? Number(q.points) : 0;
            await pool.query(
                'UPDATE answers SET auto_score = $1 WHERE attempt_id = $2 AND question_id = $3',
                [score, req.params.attemptId, q.id]
            );
        }

        const total = await pool.query(
            'SELECT COALESCE(SUM(COALESCE(auto_score, 0) + COALESCE(manual_score, 0)), 0) AS total FROM answers WHERE attempt_id = $1',
            [req.params.attemptId]
        );

        await pool.query(
            "UPDATE exam_attempts SET status = 'submitted', submitted_at = NOW(), total_score = $1 WHERE id = $2",
            [total.rows[0].total, req.params.attemptId]
        );

        const examIdRow = await pool.query('SELECT exam_id FROM exam_attempts WHERE id = $1', [req.params.attemptId]);
        if (examIdRow.rows.length) await broadcastAttemptUpdate(examIdRow.rows[0].exam_id, req.params.attemptId);

        void passbackAttempt(Number(req.params.attemptId));
        res.json({ message: 'Exam submitted', totalScore: total.rows[0].total });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to submit exam' });
    }
});

router.get('/:attemptId/result', authenticate, async (req: any, res: Response) => {
    try {
        const attempt = await pool.query(
            `SELECT a.*, u.name AS student_name, e.title AS exam_title, e.grades_released
             FROM exam_attempts a JOIN users u ON a.student_id = u.id JOIN exams e ON a.exam_id = e.id
             WHERE a.id = $1`,
            [req.params.attemptId]
        );
        if (!attempt.rows.length) return res.status(404).json({ error: 'Attempt not found' });
        const row = attempt.rows[0];

        const isInstructorOrAdmin = req.user.role === 'instructor' || req.user.role === 'admin';
        if (!isInstructorOrAdmin && !row.grades_released && req.user.userId !== row.student_id) {
            return res.status(403).json({ released: false });
        }
        if (!isInstructorOrAdmin && !row.grades_released) {
            return res.json({
                status: row.status,
                submittedAt: row.submitted_at,
                totalScore: null,
                gradesReleased: false,
                answers: []
            });
        }

        const answers = await pool.query(
            `SELECT an.question_id, an.response_text, an.auto_score, an.manual_score, an.feedback,
                    q.type, q.prompt, q.points, q.options, q.correct_answer
             FROM answers an RIGHT JOIN questions q ON an.question_id = q.id AND an.attempt_id = $1
             WHERE q.exam_id = (SELECT exam_id FROM exam_attempts WHERE id = $1)
             ORDER BY q.order_index`,
            [req.params.attemptId]
        );

        res.json({
            status: row.status,
            submittedAt: row.submitted_at,
            totalScore: row.total_score,
            gradesReleased: true,
            studentName: row.student_name,
            examTitle: row.exam_title,
            answers: answers.rows.map(a => ({
                ...a,
                correct_answer: isInstructorOrAdmin ? a.correct_answer : undefined,
                options: a.options || undefined
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch result' });
    }
});

export default router;
