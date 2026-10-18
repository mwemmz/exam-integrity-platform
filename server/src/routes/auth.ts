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
        res.status(500).json({ error: 'Login failed' });
    }
});

export default router;
