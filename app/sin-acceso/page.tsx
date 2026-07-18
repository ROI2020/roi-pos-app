"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Página legacy — el login unificado está en /login
export default function SinAccesoPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/login') }, [router])
  return null
}
