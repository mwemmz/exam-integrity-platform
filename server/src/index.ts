import express from 'express';
import path from 'path';
import authRoutes from './routes/auth';
import examRoutes from './routes/exams';
import attemptRoutes from './routes/attempts/attempts';
import integrityRoutes from './routes/attempts/integrity';
import snapshotRoutes from './routes/attempts/snapshots';
import instructorRoutes from './routes/instructor';
import instructorDetailsRoutes from './routes/instructor_details';
import adminRoutes from './routes/admin';

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'exam-integrity-server' });
});

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/integrity', integrityRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/instructor/details', instructorDetailsRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
