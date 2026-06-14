import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Contests from './pages/Contests'
import ContestDetail from './pages/ContestDetail'
import Questions from './pages/Questions'
import MockTests from './pages/MockTests'
import MockTestDetail from './pages/MockTestDetail'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('token') ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Contests /></PrivateRoute>} />
        <Route path="/contests/:id" element={<PrivateRoute><ContestDetail /></PrivateRoute>} />
        <Route path="/questions" element={<PrivateRoute><Questions /></PrivateRoute>} />
        <Route path="/mocks" element={<PrivateRoute><MockTests /></PrivateRoute>} />
        <Route path="/mocks/:id" element={<PrivateRoute><MockTestDetail /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
