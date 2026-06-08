import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import ProjectPhasesBoard from '../../components/ProjectPhasesBoard'
import IssuesTable from '../../components/IssuesTable'
import ComplianceTable from '../../components/ComplianceTable'
import UnitCompletionChart from '../../components/UnitCompletionChart'
import LoadingScreen from '../../components/LoadingScreen'
import useMinLoading from '../../hooks/useMinLoading'

export default function AdminDashboard() {
  const { profile, loading } = useProfile()
  const showLoading = useMinLoading(loading)
  if (showLoading) return <LoadingScreen />

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="h-full [&>section]:mb-0 [&>section]:h-full"><ProjectPhasesBoard /></div>
          <div className="h-full [&>section]:mb-0 [&>section]:h-full"><UnitCompletionChart /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <div className="[&>section]:mb-0"><IssuesTable /></div>
          <div className="[&>section]:mb-0"><ComplianceTable /></div>
        </div>
      </div>
    </DashboardLayout>
  )
}
