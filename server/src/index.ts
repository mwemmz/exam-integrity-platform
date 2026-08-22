import express from 'express';
import authRoutes from './routes/auth';
import examRoutes from './routes/exams';
import attemptRoutes from './routes/attempts/attempts';
import integrityRoutes from './routes/attempts/integrity';
import snapshotRoutes from './routes/attempts/snapshots';
import instructorRoutes from './routes/instructor';
import instructorDetailsRoutes from './routes/instructor_details';

const app = express();
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/integrity', integrityRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/instructor', instructorRoutes);
app.use('/api/instructor/details', instructorDetailsRoutes);

const PORT = process.env.PORT || 3000;

// NOTE: Set up DATABASE_URL and JWT_SECRET in environment variables!
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
