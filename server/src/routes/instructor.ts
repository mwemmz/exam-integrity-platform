import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { authenticate } from '../middleware/auth';
import { emitToExam, broadcastAttemptUpdate } from '../realtime';

const router = Router();

function isInstructor(req: any, res: Response): boolean {
    if (req.user.role !== 'instructor') {
        res.status(403).json({ error: 'Unauthorized' });
        return false;
    }
    return true;
}

async function ownExam(req: any, res: Response): Promise<number | null> {
    const r = await pool.query('SELECT 1 FROM exams WHERE id=$1 AND instructor_id=$2', [req.params.examId, req.user.userId]);
    if (!r.rows.length) {
        res.status(403).json({ error: 'Not your exam' });
        return null;
    }
    return Number(req.params.examId);
}

async function ownAttempt(req: any, res: Response): Promise<{ examId: number; attemptId: number } | null> {
    const r = await pool.query(
        'SELECT a.id, a.exam_id FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id=$1 AND e.instructor_id=$2',
        [req.params.attemptId, req.user.userId]
    );
    if (!r.rows.length) {
        res.status(403).json({ error: 'Not your student attempt' });
        return null;
    }
    return { examId: r.rows[0].exam_id, attemptId: r.rows[0].id };
}

// ---------------------------------------------------------------------------
// Students & groups
// ---------------------------------------------------------------------------

router.get('/students', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    try {
        const result = await pool.query(
            `SELECT u.id, u.name, u.email FROM users u
             WHERE u.role = 'student' AND u.institution_id =
                 (SELECT institution_id FROM users WHERE id = $1)
             ORDER BY u.name`,
            [req.user.userId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

router.get('/groups', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    try {
        const result = await pool.query(
            `SELECT g.id, g.name,
                    (SELECT COUNT(*) FROM student_group_members m WHERE m.group_id = g.id) AS member_count
             FROM student_groups g
             WHERE g.institution_id = (SELECT institution_id FROM users WHERE id = $1)
             ORDER BY g.name`,
            [req.user.userId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

router.post('/groups', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Group name required' });
    try {
        const result = await pool.query(
            'INSERT INTO student_groups (institution_id, name) VALUES ((SELECT institution_id FROM users WHERE id=$1), $2) RETURNING id',
            [req.user.userId, name.trim()]
        );
        res.status(201).json({ id: result.rows[0].id, name: name.trim() });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create group' });
    }
});

router.get('/groups/:id/members', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    try {
        const result = await pool.query(
            'SELECT student_id FROM student_group_members WHERE group_id = $1',
            [req.params.id]
        );
        res.json(result.rows.map(r => r.student_id));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch members' });
    }
});

router.post('/groups/:id/members', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds)) return res.status(400).json({ error: 'studentIds (array) required' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM student_group_members WHERE group_id = $1', [req.params.id]);
        for (const sid of studentIds) {
            await client.query(
                'INSERT INTO student_group_members (group_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [req.params.id, sid]
            );
        }
        await client.query('COMMIT');
        res.json({ studentIds });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to update members' });
    } finally {
        client.release();
    }
});

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

router.get('/bank', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { type, search } = req.query;
    try {
        let query = `SELECT qb.*, u.name AS instructor_name FROM question_bank qb
                     JOIN users u ON u.id = qb.instructor_id
                     WHERE qb.institution_id = (SELECT institution_id FROM users WHERE id = $1)`;
        const params: any[] = [req.user.userId];
        if (type) {
            params.push(type);
            query += ` AND qb.type = $${params.length}`;
        }
        if (search) {
            params.push(`%${String(search).toLowerCase()}%`);
            query += ` AND LOWER(qb.prompt) LIKE $${params.length}`;
        }
        query += ' ORDER BY qb.created_at DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch question bank' });
    }
});

router.post('/bank', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { type, prompt, points, options, correctAnswer } = req.body;
    if (!type || !prompt || !prompt.trim()) return res.status(400).json({ error: 'type and prompt required' });
    try {
        const result = await pool.query(
            `INSERT INTO question_bank (institution_id, instructor_id, type, prompt, points, options, correct_answer)
             VALUES ((SELECT institution_id FROM users WHERE id=$1), $1, $2, $3, $4, $5, $6) RETURNING id`,
            [req.user.userId, type, prompt.trim(), points || 1,
             options && options.length ? JSON.stringify(options) : null,
             correctAnswer !== undefined ? JSON.stringify(correctAnswer) : null]
        );
        res.status(201).json({ id: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save to bank' });
    }
});

// ---------------------------------------------------------------------------
// Accommodations
// ---------------------------------------------------------------------------

router.get('/exams/:examId/accommodations', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    try {
        if (!(await ownExam(req, res))) return;
        const result = await pool.query(
            `SELECT a.*, u.name AS student_name, u.email AS student_email
             FROM exam_accommodations a JOIN users u ON u.id = a.student_id
             WHERE a.exam_id = $1 ORDER BY u.name`,
            [req.params.examId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch accommodations' });
    }
});

router.post('/exams/:examId/accommodations', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { studentId, extraTimeMinutes, customStartAt, customEndAt } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId required' });
    try {
        if (!(await ownExam(req, res))) return;
        await pool.query(
            `INSERT INTO exam_accommodations (exam_id, student_id, extra_time_minutes, custom_start_at, custom_end_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (exam_id, student_id)
             DO UPDATE SET extra_time_minutes = EXCLUDED.extra_time_minutes,
                           custom_start_at = EXCLUDED.custom_start_at,
                           custom_end_at = EXCLUDED.custom_end_at`,
            [req.params.examId, studentId, extraTimeMinutes || 0, customStartAt || null, customEndAt || null]
        );
        res.json({ message: 'Accommodation saved' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save accommodation' });
    }
});

router.delete('/exams/:examId/accommodations/:studentId', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    try {
        if (!(await ownExam(req, res))) return;
        await pool.query('DELETE FROM exam_accommodations WHERE exam_id = $1 AND student_id = $2', [req.params.examId, req.params.studentId]);
        res.json({ message: 'Accommodation removed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove accommodation' });
    }
});

// ---------------------------------------------------------------------------
// Gradebook, bulk actions, CSV export
// ---------------------------------------------------------------------------

router.get('/exams/:examId/gradebook', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    try {
        if (!(await ownExam(req, res))) return;
        const result = await pool.query(
            `SELECT a.id AS attempt_id, a.status, a.total_score, a.submitted_at, a.flagged_for_review,
                    u.name AS student_name, u.email AS student_email,
                    (SELECT COUNT(*) FROM integrity_events ie WHERE ie.attempt_id = a.id) AS violations
             FROM exam_attempts a JOIN users u ON a.student_id = u.id
             WHERE a.exam_id = $1 ORDER BY u.name`,
            [req.params.examId]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch gradebook' });
    }
});

router.post('/exams/:examId/bulk/flag', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { attemptIds, flagged } = req.body;
    if (!Array.isArray(attemptIds) || !attemptIds.length) return res.status(400).json({ error: 'attemptIds required' });
    try {
        if (!(await ownExam(req, res))) return;
        await pool.query(
            'UPDATE exam_attempts SET flagged_for_review = $1 WHERE id = ANY($2) AND exam_id = $3',
            [!!flagged, attemptIds, req.params.examId]
        );
        for (const aid of attemptIds) await broadcastAttemptUpdate(req.params.examId, aid);
        res.json({ message: 'Updated', flagged: !!flagged });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update flag' });
    }
});

router.post('/exams/:examId/bulk/release', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { attemptIds } = req.body;
    if (!Array.isArray(attemptIds) || !attemptIds.length) return res.status(400).json({ error: 'attemptIds required' });
    try {
        if (!(await ownExam(req, res))) return;
        await pool.query(
            "UPDATE exams SET grades_released = TRUE WHERE id = $1 AND EXISTS (SELECT 1 FROM exam_attempts WHERE exam_id = $1 AND id = ANY($2))",
            [req.params.examId, attemptIds]
        );
        res.json({ message: 'Grades released for the exam' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to release grades' });
    }
});

router.get('/exams/:examId/export/csv', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    try {
        if (!(await ownExam(req, res))) return;
        const exam = await pool.query('SELECT title FROM exams WHERE id = $1', [req.params.examId]);
        const questions = await pool.query(
            'SELECT id, prompt, type, points, order_index FROM questions WHERE exam_id = $1 ORDER BY order_index',
            [req.params.examId]
        );
        const attempts = await pool.query(
            `SELECT a.id, a.status, a.total_score, u.name AS student_name, u.email AS student_email
             FROM exam_attempts a JOIN users u ON a.student_id = u.id
             WHERE a.exam_id = $1 AND a.status <> 'in_progress'
             ORDER BY u.name`,
            [req.params.examId]
        );
        const answers = await pool.query(
            'SELECT attempt_id, question_id, COALESCE(auto_score, 0) + COALESCE(manual_score, 0) AS score FROM answers WHERE attempt_id = ANY($1)',
            [attempts.rows.map((a: any) => a.id)]
        );
        const scoreMap = new Map<string, number>();
        for (const an of answers.rows) scoreMap.set(`${an.attempt_id}:${an.question_id}`, an.score);

        const qHeaders = questions.rows.map((q: any) => `Q${q.order_index} (${q.type})`);
        const header = ['Student name', 'Email', 'Status', 'Total score', ...qHeaders];
        const lines = [header.map(escCsv).join(',')];
        for (const a of attempts.rows) {
            const row = [
                a.student_name, a.student_email, a.status.replace('_', ' '),
                a.total_score ?? '',
                ...questions.rows.map((q: any) => scoreMap.get(`${a.id}:${q.id}`) ?? '')
            ];
            lines.push(row.map(escCsv).join(','));
        }
        const safeTitle = exam.rows[0].title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle || 'exam'}_results.csv"`);
        res.send('\uFEFF' + lines.join('\r\n'));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to export results' });
    }
});

function escCsv(v: any): string {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------------------------------------------------------------------------
// Live dashboard, messaging, extensions
// ---------------------------------------------------------------------------

router.get('/exams/:examId/live', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    try {
        if (!(await ownExam(req, res))) return;
        const result = await pool.query(
            `SELECT u.id AS student_id, u.name AS student_name, u.email AS student_email,
                    a.id AS attempt_id, a.status, a.end_time, a.flagged_for_review,
                    (SELECT COUNT(*) FROM integrity_events ie WHERE ie.attempt_id = a.id) AS integrity_count
             FROM users u
             LEFT JOIN exam_attempts a ON a.exam_id = $1 AND a.student_id = u.id
             WHERE u.role = 'student' AND u.institution_id = (SELECT institution_id FROM exams WHERE id = $1)
             ORDER BY u.name`,
            [req.params.examId]
        );
        const rows = result.rows.map((r: any) => ({
            ...r,
            status: r.status || 'not_started',
            remainingSeconds: r.status === 'in_progress' && r.end_time
                ? Math.max(0, Math.round((new Date(r.end_time).getTime() - Date.now()) / 1000))
                : 0
        }));
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch live dashboard' });
    }
});

router.post('/exams/:examId/message', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { studentId, message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });
    try {
        await ownExam(req, res);
        const result = await pool.query(
            'INSERT INTO exam_messages (exam_id, instructor_id, student_id, message) VALUES ($1, $2, $3, $4) RETURNING id, sent_at',
            [req.params.examId, req.user.userId, studentId || null, message.trim()]
        );
        const row = result.rows[0];
        const payload = {
            id: row.id,
            examId: Number(req.params.examId),
            instructorId: req.user.userId,
            studentId: studentId || null,
            message: message.trim(),
            sentAt: row.sent_at
        };
        emitToExam(req.params.examId, 'exam_message', payload);
        res.status(201).json(payload);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

router.post('/attempts/:attemptId/extend', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { minutes } = req.body;
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins <= 0) return res.status(400).json({ error: 'Valid minutes required' });
    try {
        const owned = await ownAttempt(req, res);
        if (!owned) return;
        const attempt = await pool.query(
            "SELECT a.*, e.time_limit_minutes FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = $1 AND a.status = 'in_progress'",
            [owned.attemptId]
        );
        if (!attempt.rows.length) return res.status(409).json({ error: 'Attempt not in progress' });
        const row = attempt.rows[0];
        const baseEnd = row.end_time
            ? new Date(row.end_time)
            : new Date(new Date(row.started_at).getTime() + (row.time_limit_minutes || 0) * 60000);
        const newEnd = new Date(baseEnd.getTime() + mins * 60000);
        await pool.query(
            'UPDATE exam_attempts SET end_time = $1 WHERE id = $2',
            [newEnd.toISOString(), owned.attemptId]
        );
        emitToExam(owned.examId, 'time_extended', {
            attemptId: owned.attemptId,
            endTime: newEnd.toISOString(),
            minutes: mins
        });
        await broadcastAttemptUpdate(owned.examId, owned.attemptId);
        res.json({ endTime: newEnd.toISOString() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to extend time' });
    }
});

// ---------------------------------------------------------------------------
// Reopen auto-submitted attempt
// ---------------------------------------------------------------------------

router.post('/attempts/:attemptId/reopen', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required to reopen the attempt' });
    try {
        const owned = await ownAttempt(req, res);
        if (!owned) return;
        const attempt = await pool.query(
            `SELECT a.*, e.time_limit_minutes FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = $1`,
            [owned.attemptId]
        );
        const row = attempt.rows[0];
        if (row.status !== 'auto_submitted') return res.status(409).json({ error: 'Only auto-submitted attempts can be reopened' });

        const startedMs = new Date(row.started_at).getTime();
        const endMs = (row.submitted_at ? new Date(row.submitted_at) : new Date()).getTime();
        const elapsedMs = Math.max(0, endMs - startedMs);
        const remainingMs = Math.max(60000, (row.time_limit_minutes || 0) * 60000 - elapsedMs);
        const newEnd = new Date(Date.now() + remainingMs);

        await pool.query(
            "UPDATE exam_attempts SET status = 'in_progress', submitted_at = NULL, end_time = $1, total_score = NULL WHERE id = $2",
            [newEnd.toISOString(), owned.attemptId]
        );
        await pool.query(
            'INSERT INTO integrity_events (attempt_id, event_type, metadata) VALUES ($1, $2, $3)',
            [owned.attemptId, 'instructor_override', JSON.stringify({ reason: reason.trim(), instructorId: req.user.userId })]
        );
        emitToExam(owned.examId, 'attempt_update', { attemptId: owned.attemptId, reopened: true, endTime: newEnd.toISOString() });
        await broadcastAttemptUpdate(owned.examId, owned.attemptId);
        res.json({ endTime: newEnd.toISOString() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to reopen attempt' });
    }
});

// ---------------------------------------------------------------------------
// Attempt notes + review
// ---------------------------------------------------------------------------

router.post('/attempts/:attemptId/notes', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { noteText } = req.body;
    if (!noteText || !noteText.trim()) return res.status(400).json({ error: 'Note text required' });
    try {
        const owned = await ownAttempt(req, res);
        if (!owned) return;
        const result = await pool.query(
            `INSERT INTO attempt_notes (attempt_id, instructor_id, note_text)
             VALUES ($1, $2, $3) RETURNING id, created_at`,
            [owned.attemptId, req.user.userId, noteText.trim()]
        );
        const r = result.rows[0];
        res.status(201).json({
            id: r.id,
            attemptId: owned.attemptId,
            instructorId: req.user.userId,
            instructorName: req.user.name || 'Instructor',
            noteText: noteText.trim(),
            createdAt: r.created_at
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add note' });
    }
});

router.post('/attempts/:attemptId/review', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    try {
        const owned = await ownAttempt(req, res);
        if (!owned) return;
        await pool.query(
            'UPDATE exam_attempts SET reviewed_at = NOW(), reviewed_by = $1 WHERE id = $2',
            [req.user.userId, owned.attemptId]
        );
        res.json({ message: 'Marked as reviewed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark reviewed' });
    }
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

router.get('/exams/:examId/analytics', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    try {
        if (!(await ownExam(req, res))) return;

        const overall = await pool.query(
            `SELECT
                COUNT(*)::int AS total_attempts,
                COUNT(*) FILTER (WHERE status IN ('submitted', 'auto_submitted'))::int AS submitted_count,
                COUNT(*) FILTER (WHERE status = 'auto_submitted')::int AS auto_submitted_count,
                COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
                COUNT(*) FILTER (WHERE flagged_for_review OR status = 'auto_submitted')::int AS flagged_count,
                ROUND(AVG(total_score) FILTER (WHERE status <> 'in_progress'), 2) AS avg_score,
                MAX(total_score) FILTER (WHERE status <> 'in_progress') AS max_score
             FROM exam_attempts WHERE exam_id = $1`,
            [req.params.examId]
        );

        const perQuestion = await pool.query(
            `SELECT q.id, q.type, q.prompt, q.points, q.order_index,
                    COUNT(an.id) FILTER (WHERE a.status <> 'in_progress')::int AS answered_count,
                    COUNT(an.id) FILTER (WHERE a.status <> 'in_progress' AND an.auto_score = q.points)::int AS correct_count,
                    ROUND(AVG(COALESCE(an.auto_score, 0) + COALESCE(an.manual_score, 0)) FILTER (WHERE a.status <> 'in_progress'), 2) AS avg_score
             FROM questions q
             LEFT JOIN answers an ON an.question_id = q.id
             LEFT JOIN exam_attempts a ON a.id = an.attempt_id
             WHERE q.exam_id = $1
             GROUP BY q.id
             ORDER BY q.order_index`,
            [req.params.examId]
        );

        res.json({
            overall: overall.rows[0],
            totalPoints: perQuestion.rows.reduce((s: number, r: any) => s + Number(r.points || 0), 0),
            perQuestion: perQuestion.rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to compute analytics' });
    }
});

// ---------------------------------------------------------------------------
// Violation tracker
// ---------------------------------------------------------------------------

const TRACKED_EVENT_TYPES = ['tab_switch', 'fullscreen_exit', 'paste_blocked', 'face_missing', 'multi_face', 'phone_detected', 'voice_detected', 'gaze_away', 'camera_blocked', 'proctor_unavailable', 'auto_submit_triggered', 'policy_flagged', 'instructor_override'];

router.get('/violations', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;
    const { examId, type, from, to, flaggedOnly, sort } = req.query;
    try {
        const params: any[] = [req.user.userId];
        let where = `ie.event_type = ANY($${params.length + 1})`;
        params.push(TRACKED_EVENT_TYPES);

        if (examId) {
            params.push(examId);
            where += ` AND e.id = $${params.length}`;
        }
        if (type) {
            params.push(type);
            where += ` AND ie.event_type = $${params.length}`;
        }
        if (from) {
            params.push(from);
            where += ` AND ie."timestamp" >= $${params.length}`;
        }
        if (to) {
            params.push(to);
            where += ` AND ie."timestamp" <= $${params.length}`;
        }
        if (flaggedOnly && String(flaggedOnly) === 'true') {
            where += ` AND a.flagged_for_review = TRUE`;
        }

        const orderBy = sort === 'student'
            ? 'u.name ASC, ie."timestamp" DESC'
            : sort === 'exam'
                ? 'e.title ASC, ie."timestamp" DESC'
                : 'ie."timestamp" DESC';

        const rows = await pool.query(
            `SELECT ie.id AS event_id, ie.event_type, ie."timestamp", ie.metadata,
                    a.id AS attempt_id, a.status, a.flagged_for_review, a.reviewed_at,
                    u.id AS student_id, u.name AS student_name, u.email AS student_email,
                    e.id AS exam_id, e.title AS exam_title,
                    EXISTS (SELECT 1 FROM attempt_notes n WHERE n.attempt_id = a.id) AS has_notes,
                    EXISTS (SELECT 1 FROM integrity_events ie3 WHERE ie3.attempt_id = a.id AND ie3.event_type = 'instructor_override') AS has_override
             FROM integrity_events ie
             JOIN exam_attempts a ON a.id = ie.attempt_id
             JOIN users u ON u.id = a.student_id
             JOIN exams e ON e.id = a.exam_id
             WHERE e.instructor_id = $1 AND ${where}
             ORDER BY ${orderBy}`,
            params
        );

        const summary = await pool.query(
            `WITH my AS (
                SELECT e.id AS exam_id
                FROM exams e WHERE e.instructor_id = $1
             )
             SELECT
                (SELECT COUNT(*)::int FROM integrity_events ie
                   JOIN exam_attempts a ON a.id = ie.attempt_id
                   WHERE a.exam_id IN (SELECT exam_id FROM my)
                     AND ie."timestamp" >= NOW() - interval '7 days') AS total_this_week,
                (SELECT ie2.event_type FROM integrity_events ie2
                   JOIN exam_attempts a2 ON a2.id = ie2.attempt_id
                   WHERE a2.exam_id IN (SELECT exam_id FROM my)
                   GROUP BY ie2.event_type ORDER BY COUNT(*) DESC LIMIT 1) AS most_common_type,
                (SELECT COUNT(*)::int FROM exam_attempts a
                   WHERE a.exam_id IN (SELECT exam_id FROM my)
                     AND (a.status = 'auto_submitted' OR a.flagged_for_review)
                     AND a.reviewed_at IS NULL
                     AND NOT EXISTS (SELECT 1 FROM attempt_notes n WHERE n.attempt_id = a.id)
                     AND NOT EXISTS (SELECT 1 FROM integrity_events ie4 WHERE ie4.attempt_id = a.id AND ie4.event_type = 'instructor_override')) AS unresolved_count`,
            [req.user.userId]
        );

        res.json({
            rows: rows.rows,
            summary: summary.rows[0]
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch violations' });
    }
});

// ---------------------------------------------------------------------------
// Existing: grading + release toggle
// ---------------------------------------------------------------------------

router.post('/attempts/:attemptId/grade', authenticate, async (req: any, res: Response) => {
    if (!isInstructor(req, res)) return;

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
    if (!isInstructor(req, res)) return;
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