import AdminLayout from '../../components/AdminLayout'
import UserManagementPanel from '../../components/UserManagementPanel'

export default function UserManagement() {
  return (
    <AdminLayout title="User Management">
      <div className="p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          <UserManagementPanel />
        </div>
      </div>
    </AdminLayout>
  )
}
