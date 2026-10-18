import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken, getAuthUser, setToken } from './lib/api';
import { useState } from 'react';
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

export default function App() {
    const [, setTick] = useState(0);

    const user = getAuthUser();
    const authed = !!user && !!getToken();

    const logout = () => {
        setToken(null);
        setTick(t => t + 1);
    };

    const home =
        !authed ? '/login'
        : user!.role === 'instructor' ? '/instructor'
        : user!.role === 'admin' ? '/admin'
        : '/student';

    return (
        <BrowserRouter>
            <div className="min-h-screen relative overflow-x-clip">
                <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
                    <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-[#1d2c4a]/60 blur-3xl" />
                    <div className="absolute top-1/3 -left-32 h-80 w-80 rounded-full bg-[#13203c]/70 blur-3xl" />
                    <div className="absolute -bottom-24 right-1/4 h-72 w-72 rounded-full bg-[#0d1830]/80 blur-3xl" />
                </div>
                {authed && (
                    <header className="sticky top-0 z-40 border-b border-[#e2e8f2]/10 bg-[#0a1322]/80 backdrop-blur-xl px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
                        <span className="font-extrabold tracking-tight text-[16px] text-[#f4f7fc] truncate">Exam Integrity Platform</span>
                        <div className="flex items-center gap-2 sm:gap-4 text-sm shrink-0">
                            <span className="text-[#f4f7fc] capitalize hidden sm:inline">{user!.role}</span>
                            <button onClick={logout} className="btn-soft px-3 py-1.5 text-xs sm:text-sm">
                                Log out
                            </button>
                        </div>
                    </header>
                )}
                <Routes>
                    <Route path="/login" element={!authed ? <LoginPage onAuthed={() => setTick(t => t + 1)} /> : <Navigate to={home} replace />} />
                    <Route path="/student" element={authed && user!.role === 'student' ? <StudentDashboard /> : <Navigate to="/login" replace />} />
                    <Route path="/exam/:examId/consent" element={authed && user!.role === 'student' ? <ConsentPage /> : <Navigate to="/login" replace />} />
                    <Route path="/exam/:attemptId/take/:examId" element={authed && user!.role === 'student' ? <ExamPage /> : <Navigate to="/login" replace />} />
                    <Route path="/results/:attemptId" element={authed ? <ResultsPage /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor" element={authed && user!.role === 'instructor' ? <InstructorDashboard /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/exams/:examId/gradebook" element={authed && user!.role === 'instructor' ? <GradebookPage /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/exams/:examId/attempts/:attemptId" element={authed && user!.role === 'instructor' ? <AttemptDetailPage /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/exams/:examId/live" element={authed && user!.role === 'instructor' ? <LiveDashboard /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/exams/:examId/analytics" element={authed && user!.role === 'instructor' ? <AnalyticsPage /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/exams/:examId/similarity" element={authed && user!.role === 'instructor' ? <SimilarityPage /> : <Navigate to="/login" replace />} />
                    <Route path="/instructor/violations" element={authed && user!.role === 'instructor' ? <ViolationsPage /> : <Navigate to="/login" replace />} />
                    <Route path="/admin" element={authed && user!.role === 'admin' ? <AdminDashboard /> : <Navigate to="/login" replace />} />
                    <Route path="*" element={<Navigate to={home} replace />} />
                </Routes>
            </div>
        </BrowserRouter>
    );
}
