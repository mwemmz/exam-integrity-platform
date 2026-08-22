import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

const router = Router();
const pool = new Pool(); // Needs DB config

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

router.post('/register', async (req, res) => {
    const { name, email, password, role, institution_id } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    
    try {
        const result = await pool.query(
            'INSERT INTO users (name, email, password_hash, role, institution_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, email, passwordHash, role, institution_id]
        );
        res.status(201).json({ userId: result.rows[0].id });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error('LOGIN ERROR:', error);
        const e = error as any;
        const parts: string[] = [];
        if (Array.isArray(e?.errors)) {
            for (const x of e.errors) parts.push(`${x?.code || ''} ${x?.address || ''}:${x?.port || ''} ${x?.message || ''}`.trim());
        }
        if (e?.code) parts.push(`code=${e.code}`);
        if (e?.message) parts.push(e.message);
        res.status(500).json({ error: 'Login failed', debug: parts.join(' | ') || String(error) });
    }
});

export default router;
