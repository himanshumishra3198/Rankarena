import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Contests from './pages/Contests'
import ContestDetail from './pages/ContestDetail'
import Questions from './pages/Questions'
import MockTests from './pages/MockTests'
import MockTestDetail from './pages/MockTestDetail'
import Reports from './pages/Reports'
import Community from './pages/Community'
import ArticleDetail from './pages/ArticleDetail'
import ArticleEditor from './pages/ArticleEditor'
import { ConfirmProvider } from './components/ConfirmDialog'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('token') ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <ConfirmProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Contests /></PrivateRoute>} />
        <Route path="/contests/:id" element={<PrivateRoute><ContestDetail /></PrivateRoute>} />
        <Route path="/questions" element={<PrivateRoute><Questions /></PrivateRoute>} />
        <Route path="/mocks" element={<PrivateRoute><MockTests /></PrivateRoute>} />
        <Route path="/mocks/:id" element={<PrivateRoute><MockTestDetail /></PrivateRoute>} />
        <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
        <Route path="/community" element={<PrivateRoute><Community /></PrivateRoute>} />
        {/* Static segment before the dynamic one so /community/new isn't read as an id. */}
        <Route path="/community/new" element={<PrivateRoute><ArticleEditor /></PrivateRoute>} />
        <Route path="/community/:id" element={<PrivateRoute><ArticleDetail /></PrivateRoute>} />
        <Route path="/community/:id/edit" element={<PrivateRoute><ArticleEditor /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ConfirmProvider>
  )
}
