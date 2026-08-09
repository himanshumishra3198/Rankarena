import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import ContestList from './pages/ContestList'
import ContestRoom from './pages/ContestRoom'
import Result from './pages/Result'
import MockTests from './pages/MockTests'
import MockRoom from './pages/MockRoom'
import MockResult from './pages/MockResult'
import Bookmarks from './pages/Bookmarks'
import Profile from './pages/Profile'
import PublicProfile from './pages/PublicProfile'
import Leaderboard from './pages/Leaderboard'
import Community from './pages/Community'
import ArticleView from './pages/ArticleView'
import ArticleEditor from './pages/ArticleEditor'
import AnalyticsTracker from './components/AnalyticsTracker'
import { ConfirmProvider } from './components/ConfirmDialog'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('token') ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <ConfirmProvider>
    <BrowserRouter>
      <AnalyticsTracker />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* One home page for everyone, Codeforces-style: the same feed and
            sidebar whether or not you're signed in. */}
        <Route path="/" element={<Home />} />
        <Route path="/contests" element={<PrivateRoute><ContestList /></PrivateRoute>} />
        <Route path="/contests/:id" element={<PrivateRoute><ContestRoom /></PrivateRoute>} />
        <Route path="/contests/:id/result" element={<PrivateRoute><Result /></PrivateRoute>} />
        <Route path="/mocks" element={<PrivateRoute><MockTests /></PrivateRoute>} />
        <Route path="/mocks/:id" element={<PrivateRoute><MockRoom /></PrivateRoute>} />
        <Route path="/mocks/:id/result" element={<PrivateRoute><MockResult /></PrivateRoute>} />
        <Route path="/bookmarks" element={<PrivateRoute><Bookmarks /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/profile/:id" element={<PrivateRoute><PublicProfile /></PrivateRoute>} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/community" element={<Community />} />
        {/* Static segment before the dynamic one so /community/new isn't read as an id. */}
        <Route path="/community/new" element={<PrivateRoute><ArticleEditor /></PrivateRoute>} />
        <Route path="/community/:id" element={<ArticleView />} />
        <Route path="/community/:id/edit" element={<PrivateRoute><ArticleEditor /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ConfirmProvider>
  )
}
