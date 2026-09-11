import AdminLayout from '../../components/AdminLayout'
import ProjectPhasesBoard from '../../components/ProjectPhasesBoard'
import IssuesTable from '../../components/IssuesTable'
import ComplianceTable from '../../components/ComplianceTable'
import UnitCompletionChart from '../../components/UnitCompletionChart'

export default function AdminDashboard() {
  return (
    <AdminLayout title="Dashboard">
      <main className="p-4">
        <div id="dashboard-content" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="flex flex-col gap-3 h-full">
            <div className="[&>section]:mb-0"><ProjectPhasesBoard id="panel-phases" /></div>
            <div className="flex-1 [&>section]:mb-0 [&>section]:h-full"><IssuesTable id="panel-issues" /></div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="[&>section]:mb-0"><UnitCompletionChart id="panel-completion" /></div>
            <div className="[&>section]:mb-0"><ComplianceTable id="panel-compliance" /></div>
          </div>
        </div>
      </main>
    </AdminLayout>
  )
}
