import { Router } from 'express';
import { pool } from '../../db';
import { authenticate } from '../../middleware/auth';
import { UPLOADS_DIR } from '../../config';
import fs from 'fs';
import path from 'path';

const router = Router();

const DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/;
const MAX_SNAPSHOT_BYTES = 1_500_000;

// Upload a webcam snapshot (only by the student who owns an in-progress attempt)
router.post('/:attemptId/snapshot', authenticate, async (req: any, res) => {
    const { imageBase64 } = req.body || {};
    const attemptId = Number(req.params.attemptId);
    if (!Number.isInteger(attemptId)) return res.status(400).json({ error: 'Invalid attempt' });

    const match = typeof imageBase64 === 'string' ? DATA_URL.exec(imageBase64) : null;
    if (!match) return res.status(400).json({ error: 'Expected a JPEG data URL' });
    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length > MAX_SNAPSHOT_BYTES) return res.status(413).json({ error: 'Snapshot too large' });

    try {
        const owned = await pool.query(
            "SELECT 1 FROM exam_attempts WHERE id = $1 AND student_id = $2 AND status = 'in_progress'",
            [attemptId, req.user.userId]
        );
        if (!owned.rows.length) return res.status(403).json({ error: 'Not your active attempt' });

        await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
        const filename = `snapshot_${attemptId}_${Date.now()}.jpg`;
        await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), buffer);

        await pool.query('INSERT INTO webcam_snapshots (attempt_id, image_url) VALUES ($1, $2)', [attemptId, `/uploads/${filename}`]);
        res.status(201).json({ message: 'Snapshot saved' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save snapshot' });
    }
});

export default router;
