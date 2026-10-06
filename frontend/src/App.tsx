import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import Dashboard from './pages/Dashboard'
import Landing from './pages/Landing'
import ContestList from './pages/ContestList'
import ContestRoom from './pages/ContestRoom'
import Result from './pages/Result'
import MockTests from './pages/MockTests'
import MockRoom from './pages/MockRoom'
import MockResult from './pages/MockResult'
import Practice from './pages/Practice'
import PracticeProblem from './pages/PracticeProblem'
import Bookmarks from './pages/Bookmarks'
import Profile from './pages/Profile'
import PublicProfile from './pages/PublicProfile'
import Leaderboard from './pages/Leaderboard'
import Community from './pages/Community'
import ArticleView from './pages/ArticleView'
import ArticleEditor from './pages/ArticleEditor'
import AnalyticsTracker from './components/AnalyticsTracker'
import { ConfirmProvider } from './components/ConfirmDialog'
import Unsubscribe from './pages/Unsubscribe'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('token') ? <>{children}</> : <Navigate to="/login" replace />
}

function HomeRoute() {
  return localStorage.getItem('token') ? <Dashboard /> : <Landing />
}

export default function App() {
  return (
    <ConfirmProvider>
    <BrowserRouter>
      <AnalyticsTracker />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        {/* Public and unauthenticated: Google's reviewer has to reach these. */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        {/* Visitors get the landing page; signed-in users get their feed.
            Someone who came back to sit a contest should not be sold the
            product they already use. */}
        <Route path="/" element={<HomeRoute />} />
        {/* Open to guests, like /mocks: GET /contests already answers
            without a token and withholds the caller's own results. */}
        <Route path="/contests" element={<ContestList />} />
        <Route path="/contests/:id" element={<PrivateRoute><ContestRoom /></PrivateRoute>} />
        <Route path="/contests/:id/result" element={<PrivateRoute><Result /></PrivateRoute>} />
        {/* Open to guests: the catalogue is what convinces somebody to sign
            up, and /mocks/public serves it without anyone's scores. The room
            and the result behind it still require an account. */}
        <Route path="/mocks" element={<MockTests />} />
        <Route path="/mocks/:id" element={<PrivateRoute><MockRoom /></PrivateRoute>} />
        <Route path="/mocks/:id/result" element={<PrivateRoute><MockResult /></PrivateRoute>} />
        <Route path="/practice" element={<PrivateRoute><Practice /></PrivateRoute>} />
        <Route path="/practice/:id" element={<PrivateRoute><PracticeProblem /></PrivateRoute>} />
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
