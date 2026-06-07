import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Events from './pages/Events'
import Recommendations from './pages/Recommendations'
import Chat from './pages/Chat'
import Calendar from './pages/Calendar'
import BottomNav from './components/BottomNav'

function AppLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto relative">
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <AppLayout>
              <Dashboard />
            </AppLayout>
          }
        />
        <Route
          path="/events"
          element={
            <AppLayout>
              <Events />
            </AppLayout>
          }
        />
        <Route
          path="/recommendations"
          element={
            <AppLayout>
              <Recommendations />
            </AppLayout>
          }
        />
        <Route
          path="/chat"
          element={
            <AppLayout>
              <Chat />
            </AppLayout>
          }
        />
        <Route
          path="/calendar"
          element={
            <AppLayout>
              <Calendar />
            </AppLayout>
          }
        />
        <Route
          path="/profile"
          element={
            <AppLayout>
              <Profile />
            </AppLayout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
