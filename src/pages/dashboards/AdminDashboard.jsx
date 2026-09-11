import AdminLayout from '../../components/AdminLayout'
import ProjectPhasesBoard from '../../components/ProjectPhasesBoard'
import IssuesTable from '../../components/IssuesTable'
import ComplianceTable from '../../components/ComplianceTable'
import UnitCompletionChart from '../../components/UnitCompletionChart'

export default function AdminDashboard() {
  return (
    <AdminLayout title="Dashboard">
      <main className="p-4">
        <div id="dashboard-content" className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="h-full [&>section]:mb-0 [&>section]:h-full"><ProjectPhasesBoard id="panel-phases" /></div>
            <div className="h-full [&>section]:mb-0 [&>section]:h-full"><UnitCompletionChart id="panel-completion" /></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <div className="[&>section]:mb-0"><IssuesTable id="panel-issues" /></div>
            <div className="[&>section]:mb-0"><ComplianceTable id="panel-compliance" /></div>
          </div>
        </div>
      </main>
    </AdminLayout>
  )
}
