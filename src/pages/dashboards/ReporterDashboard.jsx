import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import ProjectPhasesBoard from '../../components/ProjectPhasesBoard'
import IssuesTable from '../../components/IssuesTable'
import ComplianceTable from '../../components/ComplianceTable'
import UnitCompletionChart from '../../components/UnitCompletionChart'
import LoadingScreen from '../../components/LoadingScreen'
import useMinLoading from '../../hooks/useMinLoading'

export default function ReporterDashboard() {
  const { profile, loading } = useProfile()
  const showLoading = useMinLoading(loading)
  if (showLoading) return <LoadingScreen />

  return (
    <DashboardLayout profile={profile}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="flex flex-col gap-3 h-full">
          <div className="[&>section]:mb-0"><ProjectPhasesBoard /></div>
          <div className="flex-1 [&>section]:mb-0 [&>section]:h-full"><IssuesTable /></div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="[&>section]:mb-0"><UnitCompletionChart /></div>
          <div className="[&>section]:mb-0"><ComplianceTable /></div>
        </div>
      </div>
    </DashboardLayout>
  )
}
