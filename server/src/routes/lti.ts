import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import { JWT_SECRET } from '../config';
import { authenticate } from '../middleware/auth';
import { verifySignature, checkFreshness, postGrade } from '../lib/lti';

const router = Router();

const CONSUMER_KEY = process.env.LTI_CONSUMER_KEY;
const SHARED_SECRET = process.env.LTI_SHARED_SECRET;
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
const CLIENT_URL = (process.env.CLIENT_URL || '').replace(/\/$/, '');

export const ltiEnabled = () => Boolean(CONSUMER_KEY && SHARED_SECRET && PUBLIC_API_URL);

// Tool configuration for the LMS admin (Moodle: Site admin > Plugins > External tool > Manage tools).
router.get('/config', (_req, res) => {
    res.json({
        enabled: ltiEnabled(),
        launchUrl: `${PUBLIC_API_URL}/api/lti/launch`,
        consumerKey: CONSUMER_KEY || null,
        customParameters: 'exam_id=<exam id>',
        note: 'Set the shared secret in the LMS to the value of LTI_SHARED_SECRET. LTI 1.1 basic launch with grade return.'
    });
});

// LTI 1.1 basic launch (form POST from the LMS).
router.post('/launch', async (req: Request, res: Response) => {
    if (!ltiEnabled()) return res.status(503).send('LTI is not configured on this server');
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.body || {})) p[k] = String(v);

    if (p.lti_message_type !== 'basic-lti-launch-request' || p.oauth_consumer_key !== CONSUMER_KEY) {
        return res.status(401).send('Invalid LTI launch');
    }
    if (!verifySignature('POST', `${PUBLIC_API_URL}/api/lti/launch`, p, SHARED_SECRET!) || !checkFreshness(p)) {
        return res.status(401).send('LTI signature check failed');
    }

    const email = (p.lis_person_contact_email_primary || '').toLowerCase().trim();
    if (!email) return res.status(400).send('The LMS did not send the learner email');
    const isInstructor = /instructor|teacher|administrator/i.test(p.roles || '');

    try {
        let user = (await pool.query('SELECT id, role FROM users WHERE lower(email) = $1', [email])).rows[0];
        if (!user) {
            // Learners are provisioned just-in-time; instructors must already have an account.
            if (isInstructor) return res.status(403).send('Instructor accounts must be created in ExamTech first');
            const inst = process.env.LTI_INSTITUTION_ID
                ? Number(process.env.LTI_INSTITUTION_ID)
                : (await pool.query('SELECT id FROM institutions ORDER BY id LIMIT 1')).rows[0]?.id;
            const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
            const name = p.lis_person_name_full || email;
            user = (await pool.query(
                "INSERT INTO users (name, email, password_hash, role, institution_id) VALUES ($1, $2, $3, 'student', $4) RETURNING id, role",
                [name, email, hash, inst]
            )).rows[0];
        }
        if (user.role === 'admin') return res.status(403).send('Admin accounts cannot use LTI launch');

        const examId = Number(p.custom_exam_id || p.exam_id) || null;
        if (examId && p.lis_result_sourcedid && p.lis_outcome_service_url) {
            await pool.query(
                `INSERT INTO lti_outcomes (user_id, exam_id, service_url, sourcedid) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id, exam_id) DO UPDATE SET service_url = EXCLUDED.service_url, sourcedid = EXCLUDED.sourcedid`,
                [user.id, examId, p.lis_outcome_service_url, p.lis_result_sourcedid]
            );
        }

        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
        const target = examId && user.role === 'student' ? `/exam/${examId}/consent` : '';
        // Token travels in the URL fragment so it is never sent to a server or logged.
        res.redirect(303, `${CLIENT_URL}/lti#token=${encodeURIComponent(token)}&to=${encodeURIComponent(target)}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('LTI launch failed');
    }
});

// Send one attempt's score back to the LMS gradebook. Returns false if not applicable.
export async function passbackAttempt(attemptId: number): Promise<boolean> {
    if (!ltiEnabled()) return false;
    const r = await pool.query(
        `SELECT a.student_id, a.exam_id, a.total_score,
                (SELECT COALESCE(SUM(points), 0) FROM questions WHERE exam_id = a.exam_id) AS max_points,
                o.service_url, o.sourcedid
         FROM exam_attempts a JOIN lti_outcomes o ON o.user_id = a.student_id AND o.exam_id = a.exam_id
         WHERE a.id = $1`,
        [attemptId]
    );
    const row = r.rows[0];
    if (!row || row.total_score === null || !Number(row.max_points)) return false;
    try {
        return await postGrade(row.service_url, CONSUMER_KEY!, SHARED_SECRET!, row.sourcedid, Number(row.total_score) / Number(row.max_points));
    } catch (e) {
        console.error('LTI grade passback failed', e);
        return false;
    }
}

// Instructor: push all current scores for an exam to the LMS (e.g. after manual grading).
router.post('/sync/:examId', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Unauthorized' });
    if (!ltiEnabled()) return res.status(503).json({ error: 'LTI is not configured' });
    const own = await pool.query('SELECT 1 FROM exams WHERE id = $1 AND instructor_id = $2', [req.params.examId, req.user.userId]);
    if (!own.rows.length) return res.status(403).json({ error: 'Not your exam' });
    const attempts = await pool.query("SELECT id FROM exam_attempts WHERE exam_id = $1 AND status <> 'in_progress'", [req.params.examId]);
    let sent = 0;
    for (const a of attempts.rows) if (await passbackAttempt(a.id)) sent++;
    res.json({ attempts: attempts.rows.length, sent });
});

export default router;
