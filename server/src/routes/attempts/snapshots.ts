import { Router } from 'express';
import { pool } from '../../db';

import { authenticate } from '../../middleware/auth';
import fs from 'fs';
import path from 'path';

const router = Router();

// Upload snapshot
router.post('/:attemptId/snapshot', authenticate, async (req: any, res) => {
    const { imageBase64 } = req.body;
    const { attemptId } = req.params;
    
    const buffer = Buffer.from(imageBase64.split(',')[1], 'base64');
    const filename = `snapshot_${attemptId}_${Date.now()}.jpg`;
    const filepath = path.join(__dirname, '../../../uploads', filename);

    fs.writeFileSync(filepath, buffer);

    try {
        await pool.query(
            'INSERT INTO webcam_snapshots (attempt_id, image_url) VALUES ($1, $2)',
            [attemptId, `/uploads/${filename}`]
        );
        res.status(201).json({ message: 'Snapshot saved' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save snapshot' });
    }
});

export default router;
