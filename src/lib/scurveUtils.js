const formatPeriod = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00')
  const mon = d.toLocaleDateString('en-US', { month: 'short' })
  const yr  = String(d.getFullYear()).slice(2)
  return `${mon} '${yr}`
}

export function buildAllPeriods(baselineData, actuals, forecasts) {
  const set = new Set([
    ...baselineData.map(r => r.period_date),
    ...actuals.map(r => r.period_date),
    ...forecasts.map(r => r.period_date),
  ])
  return [...set].sort()
}

export function computeChartData(periods, baselineData, actuals, forecasts) {
  if (!periods.length) return []

  const baselineMap = Object.fromEntries(baselineData.map(r => [r.period_date, r]))
  const actualMap   = Object.fromEntries(actuals.map(r => [r.period_date, r]))
  const forecastMap = Object.fromEntries(forecasts.map(r => [r.period_date, r]))

  const lastBaselineIdx = periods.reduce((last, p, i) => (baselineMap[p]?.planned_pct ?? 0) > 0 ? i : last, -1)
  const lastActualIdx   = periods.reduce((last, p, i) => (actualMap[p]?.actual_pct ?? 0)    > 0 ? i : last, -1)
  const lastForecastIdx = periods.reduce((last, p, i) => {
    const hasA = (actualMap[p]?.actual_pct ?? 0) > 0
    const hasF = (forecastMap[p]?.forecast_pct ?? 0) > 0
    return (hasA || hasF) ? i : last
  }, -1)

  let cumBaseline = 0, cumActual = 0, cumForecast = 0

  return periods.map((p, i) => {
    const bPct = baselineMap[p]?.planned_pct ?? 0
    const aPct = actualMap[p]?.actual_pct    ?? 0
    const fPct = forecastMap[p]?.forecast_pct ?? 0

    if (bPct > 0) cumBaseline = Math.min(100, cumBaseline + bPct)
    if (aPct > 0) { cumActual = Math.min(100, cumActual + aPct); cumForecast = cumActual }
    else if (fPct > 0) cumForecast = Math.min(100, cumForecast + fPct)

    return {
      period:   formatPeriod(p),
      baseline: (bPct > 0 && i <= lastBaselineIdx)           ? cumBaseline  : null,
      actual:   (aPct > 0 && i <= lastActualIdx)             ? cumActual    : null,
      forecast: (i <= lastForecastIdx && (aPct > 0 || fPct > 0 || cumForecast > 0 && i <= lastForecastIdx))
                  ? cumForecast : null,
      _date:    p,
    }
  })
}
