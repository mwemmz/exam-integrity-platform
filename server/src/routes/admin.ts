import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticate } from '../middleware/auth';

const router = Router();
const pool = new Pool();

router.get('/users', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const result = await pool.query(
            `SELECT u.id, u.name, u.email, u.role, i.name AS institution
             FROM users u LEFT JOIN institutions i ON u.institution_id = i.id
             ORDER BY u.id`
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.get('/institutions', authenticate, async (req: any, res: Response) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
    try {
        const result = await pool.query('SELECT id, name FROM institutions ORDER BY id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch institutions' });
    }
});

export default router;
