import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Unauthorized from './pages/Unauthorized'
import Disabled from './pages/Disabled'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/dashboards/AdminDashboard'
import HODashboard       from './pages/dashboards/HODashboard'
import ReporterDashboard from './pages/dashboards/ReporterDashboard'
import ViewerDashboard from './pages/dashboards/ViewerDashboard'
import RoleAssignment from './pages/admin/RoleAssignment'
import UserManagement from './pages/admin/UserManagement'
import StandardPermits from './pages/admin/StandardPermits'
import WorkProgramTemplate from './pages/admin/WorkProgramTemplate'
import PermitsDashboard from './pages/admin/PermitsDashboard'
import Settings from './pages/admin/Settings'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
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
        <Route path="/ho/dashboard"       element={<ProtectedRoute roles={['head', 'reviewer']}><HODashboard /></ProtectedRoute>} />
        <Route path="/reporter/dashboard" element={<ProtectedRoute roles={['endorser', 'reporter']}><ReporterDashboard /></ProtectedRoute>} />
        <Route path="/viewer/dashboard" element={<ProtectedRoute roles={['viewer']}><ViewerDashboard /></ProtectedRoute>} />

        {/* Shared pages (all authenticated roles) */}
        <Route path="/projects"    element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
        <Route path="/projects/:slug" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
        <Route path="/profile"     element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

        {/* Admin tools */}
        <Route path="/admin/roles"                  element={<ProtectedRoute roles={['admin']}><RoleAssignment /></ProtectedRoute>} />
        <Route path="/admin/users"                  element={<ProtectedRoute roles={['admin']}><UserManagement /></ProtectedRoute>} />
        <Route path="/admin/standard-permits"       element={<ProtectedRoute roles={['admin']}><StandardPermits /></ProtectedRoute>} />
        <Route path="/admin/work-program-template"  element={<ProtectedRoute roles={['admin']}><WorkProgramTemplate /></ProtectedRoute>} />
        <Route path="/admin/permits"                element={<ProtectedRoute roles={['admin','head','reviewer','endorser','reporter','viewer']}><PermitsDashboard /></ProtectedRoute>} />
        <Route path="/admin/settings"               element={<ProtectedRoute roles={['admin']}><Settings /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to="/signin" replace />} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
