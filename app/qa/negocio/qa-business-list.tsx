'use client'

import { useRouter } from 'next/navigation'

interface Business {
  id: number
  name: string
  locale: string
  currency: string
}

export default function QaBusinessList({
  businesses,
  currentId,
}: {
  businesses: Business[]
  currentId: number | null
}) {
  const router = useRouter()

  function select(id: number) {
    document.cookie = `qa_business_id=${id};path=/;SameSite=Lax;Secure`
    router.push('/')
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {businesses.map(b => (
        <li key={b.id} style={{ marginBottom: 8 }}>
          <button
            onClick={() => select(b.id)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '12px 16px',
              border: b.id === currentId ? '2px solid #2563eb' : '1px solid #ddd',
              borderRadius: 8,
              background: b.id === currentId ? '#eff6ff' : '#fff',
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            <strong>{b.name}</strong>
            <span style={{ color: '#888', marginLeft: 12, fontSize: 13 }}>
              {b.locale} · {b.currency}
            </span>
            {b.id === currentId && (
              <span style={{ float: 'right', color: '#2563eb', fontSize: 13 }}>actual</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
