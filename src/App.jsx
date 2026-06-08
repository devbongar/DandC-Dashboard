import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Unauthorized from './pages/Unauthorized'
import Disabled from './pages/Disabled'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/dashboards/AdminDashboard'
import ApproverDashboard from './pages/dashboards/ApproverDashboard'
import UpdaterDashboard from './pages/dashboards/UpdaterDashboard'
import ViewerDashboard from './pages/dashboards/ViewerDashboard'
import RoleAssignment from './pages/admin/RoleAssignment'
import StandardPermits from './pages/admin/StandardPermits'
import ProjectsPage from './pages/ProjectsPage'
import ProfilePage from './pages/ProfilePage'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/signin"          element={<SignIn />} />
        <Route path="/signup"          element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/disabled"     element={<Disabled />} />

        {/* Smart redirect based on role */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Role dashboards */}
        <Route path="/admin/dashboard" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/approver/dashboard" element={<ProtectedRoute roles={['approver']}><ApproverDashboard /></ProtectedRoute>} />
        <Route path="/updater/dashboard" element={<ProtectedRoute roles={['updater']}><UpdaterDashboard /></ProtectedRoute>} />
        <Route path="/viewer/dashboard" element={<ProtectedRoute roles={['viewer']}><ViewerDashboard /></ProtectedRoute>} />

        {/* Shared pages (all authenticated roles) */}
        <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
        <Route path="/profile"  element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

        {/* Admin tools */}
        <Route path="/admin/roles"            element={<ProtectedRoute roles={['admin']}><RoleAssignment /></ProtectedRoute>} />
        <Route path="/admin/standard-permits" element={<ProtectedRoute roles={['admin']}><StandardPermits /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to="/signin" replace />} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
