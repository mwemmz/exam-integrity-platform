import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import authRoutes from './routes/auth';
import examRoutes from './routes/exams';
import attemptRoutes from './routes/attempts/attempts';
import integrityRoutes from './routes/attempts/integrity';
import snapshotRoutes from './routes/attempts/snapshots';
import instructorRoutes from './routes/instructor';
import instructorDetailsRoutes from './routes/instructor_details';
import adminRoutes from './routes/admin';
import similarityRoutes from './routes/similarity';
import ltiRoutes from './routes/lti';
import { initRealtime } from './realtime';
import helmet from 'helmet';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { UPLOADS_DIR } from './config';

const app = express();
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) { console.warn('[config] cannot create UPLOADS_DIR', UPLOADS_DIR, e); }

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'exam-integrity-server', commit: (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7) });
});

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/static', express.static(path.join(__dirname, '../static')));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/integrity', integrityRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/instructor/details', instructorDetailsRoutes);
app.use('/api/instructor/similarity', similarityRoutes);
app.use('/api/lti', ltiRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
initRealtime(server);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
