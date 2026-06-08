import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function PageBanner() {
  const [projectCount, setProjectCount] = useState(null)

  useEffect(() => {
    supabase.from('projects').select('*', { count: 'exact', head: true })
      .then(({ count }) => setProjectCount(count))
  }, [])

  return (
    <div className="mb-8">
      <div
        className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-5 inline-block"
        style={{ borderLeft: '3px solid #111111' }}
      >
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Projects</p>
        <p className="text-4xl font-bold text-black mt-2 leading-none tabular-nums">
          {projectCount === null ? <span className="text-gray-200">—</span> : projectCount}
        </p>
      </div>
    </div>
  )
}
