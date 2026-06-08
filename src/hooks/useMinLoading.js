import { useState, useEffect, useRef } from 'react'

export default function useMinLoading(isLoading, min = 1500) {
  const [show, setShow] = useState(isLoading)
  const startRef = useRef(Date.now())

  useEffect(() => {
    if (isLoading) {
      startRef.current = Date.now()
      setShow(true)
    } else {
      const elapsed = Date.now() - startRef.current
      const wait = Math.max(0, min - elapsed)
      const t = setTimeout(() => setShow(false), wait)
      return () => clearTimeout(t)
    }
  }, [isLoading, min])

  return show
}
