import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import ProjectPhasesBoard from '../../components/ProjectPhasesBoard'
import IssuesTable from '../../components/IssuesTable'
import ComplianceTable from '../../components/ComplianceTable'
import UnitCompletionChart from '../../components/UnitCompletionChart'
import LoadingScreen from '../../components/LoadingScreen'
import useMinLoading from '../../hooks/useMinLoading'
import PdfDownloadButton from '../../components/PdfDownloadButton'

export default function AdminDashboard() {
  const { profile, loading } = useProfile()
  const showLoading = useMinLoading(loading)
  if (showLoading) return <LoadingScreen />

  return (
    <DashboardLayout profile={profile}>
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
      <PdfDownloadButton />
    </DashboardLayout>
  )
}
