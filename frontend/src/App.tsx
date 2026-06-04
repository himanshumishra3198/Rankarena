import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import ContestRoom from './pages/ContestRoom'
import Result from './pages/Result'
import Profile from './pages/Profile'
import PublicProfile from './pages/PublicProfile'
import Leaderboard from './pages/Leaderboard'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('token') ? <>{children}</> : <Navigate to="/login" replace />
}

function HomePage() {
  return localStorage.getItem('token') ? <Dashboard /> : <LandingPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/contests/:id" element={<PrivateRoute><ContestRoom /></PrivateRoute>} />
        <Route path="/contests/:id/result" element={<PrivateRoute><Result /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/profile/:id" element={<PrivateRoute><PublicProfile /></PrivateRoute>} />
        <Route path="/leaderboard" element={<PrivateRoute><Leaderboard /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
