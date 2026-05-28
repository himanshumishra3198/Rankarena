import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ContestList from './pages/ContestList'
import ContestRoom from './pages/ContestRoom'
import Result from './pages/Result'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('token') ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<PrivateRoute><ContestList /></PrivateRoute>} />
        <Route path="/contests/:id" element={<PrivateRoute><ContestRoom /></PrivateRoute>} />
        <Route path="/contests/:id/result" element={<PrivateRoute><Result /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
