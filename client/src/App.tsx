import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getToken, getAuthUser, setToken, SESSION_EXPIRED_EVENT } from './lib/api';
import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage';
import StudentDashboard from './pages/student/StudentDashboard';
import ConsentPage from './pages/student/ConsentPage';
import ExamPage from './pages/student/ExamPage';
import ResultsPage from './pages/student/ResultsPage';
import InstructorDashboard from './pages/instructor/InstructorDashboard';
import GradebookPage from './pages/instructor/GradebookPage';
import AttemptDetailPage from './pages/instructor/AttemptDetailPage';
import LiveDashboard from './pages/instructor/LiveDashboard';
import SimilarityPage from './pages/instructor/SimilarityPage';
import AnalyticsPage from './pages/instructor/AnalyticsPage';
import ViolationsPage from './pages/instructor/ViolationsPage';
import AdminDashboard from './pages/AdminDashboard';
import ThemesPage from './pages/ThemesPage';
import Shell from './components/Shell';
import type { ReactNode } from 'react';

// Sidebar layout for signed-in pages. The exam-taking screen stays full-width and distraction free.
function Layout({ role, onLogout, children }: { role: string | null; onLogout: () => void; children: ReactNode }) {
    const { pathname } = useLocation();
    const focus = /^\/exam\/[^/]+\/take\//.test(pathname);
    if (!role || focus) return <>{children}</>;
    return <Shell role={role} onLogout={onLogout}>{children}</Shell>;
}

export default function App() {
    const [, setTick] = useState(0);

    const user = getAuthUser();
    const authed = !!user && !!getToken();

    const logout = () => {
        setToken(null);
        setTick(t => t + 1);
    };

    // A tab left open past the token's 1-hour lifetime (common on the instructor dashboard
    // while watching an exam run) used to leave the page signed-in-looking but silently
    // failing with 403s on every request. Any API call that detects an expired/invalid
    // token signs the tab out and bounces it to the login screen instead.
    useEffect(() => {
        const onExpired = () => setTick(t => t + 1);
        window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    }, []);

    const home =
        !authed ? '/login'
        : user!.role === 'instructor' ? '/instructor'
        : user!.role === 'admin' ? '/admin'
        : '/student';

    return (
        <BrowserRouter>
            <Layout role={authed ? user!.role : null} onLogout={logout}>
                <Routes>
                    <Route path="/login" element={!authed ? <LoginPage onAuthed={() => setTick(t => t + 1)} /> : <Navigate to={home} replace />} />
                    <Route path="/themes" element={authed ? <ThemesPage /> : <Navigate to="/login" replace />} />
                    <Route path="/student" element={authed && user!.role === 'student' ? <StudentDashboard /> : <Navigate to="/login" replace />} />
                    <Route path="/exam/:examId/consent" element={authed && user!.role === 'student' ? <ConsentPage /> : <Navigate to="/login" replace />} />
                    <Route path="/exam/:attemptId/take/:examId" element={authed && user!.role === 'student' ? <ExamPage /> : <Navigate to="/login" replace />} />
                    <Route path="/results/:attemptId" element={authed ? <ResultsPage /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor" element={authed && user!.role === 'instructor' ? <InstructorDashboard /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/exams/:examId/gradebook" element={authed && user!.role === 'instructor' ? <GradebookPage /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/exams/:examId/attempts/:attemptId" element={authed && user!.role === 'instructor' ? <AttemptDetailPage /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/exams/:examId/live" element={authed && user!.role === 'instructor' ? <LiveDashboard /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/exams/:examId/similarity" element={authed && user!.role === 'instructor' ? <SimilarityPage /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/exams/:examId/analytics" element={authed && user!.role === 'instructor' ? <AnalyticsPage /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/violations" element={authed && user!.role === 'instructor' ? <ViolationsPage /> : <Navigate to="/login" replace />} />
                    <Route path="/admin" element={authed && user!.role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" replace />} />
                    <Route path="*" element={<Navigate to={home} replace />} />
                </Routes>
            </Layout>
        </BrowserRouter>
    );
}
