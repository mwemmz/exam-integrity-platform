import { Router } from 'express';
import { pool } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';


const router = Router();

import { JWT_SECRET } from '../config';

router.post('/register', async (req, res) => {
    const { name, email, password, role, institution_id } = req.body;
    if (!name || !email || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Name, email and a password of at least 6 characters are required' });
    }
    // Self-registration is limited to students and instructors; admins are created by seeding/admins only.
    if (!['student', 'instructor'].includes(role)) {
        return res.status(400).json({ error: 'Role must be student or instructor' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    // Emails are stored lower-case so phones that capitalise the first letter can still sign in.
    const cleanEmail = String(email).trim().toLowerCase();

    try {
        const taken = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [cleanEmail]);
        if (taken.rows.length) return res.status(409).json({ error: 'An account with this email already exists' });
        const result = await pool.query(
            'INSERT INTO users (name, email, password_hash, role, institution_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, cleanEmail, passwordHash, role, institution_id]
        );
        res.status(201).json({ userId: result.rows[0].id });
    } catch (error: any) {
        if (error?.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
        res.status(500).json({ error: 'Registration failed' });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const result = await pool.query('SELECT * FROM users WHERE lower(email) = lower(trim($1))', [String(email ?? '')]);
        const user = result.rows[0];
        
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
        res.json({ token });
    } catch (error) {
        console.error('LOGIN ERROR:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

export default router;
