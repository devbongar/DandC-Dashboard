import DashboardLayout from '../../components/DashboardLayout'
import UnitCompletionChart from '../../components/UnitCompletionChart'
import useProfile from '../../hooks/useProfile'
import LoadingScreen from '../../components/LoadingScreen'
import useMinLoading from '../../hooks/useMinLoading'

export default function UnitCompletionPage() {
  const { profile, loading } = useProfile()
  const showLoading = useMinLoading(loading)
  if (showLoading) return <LoadingScreen />

  return (
    <DashboardLayout profile={profile} title="Unit Completion">
      <UnitCompletionChart expanded />
    </DashboardLayout>
  )
}
