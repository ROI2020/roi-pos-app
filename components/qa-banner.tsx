import { isQa } from '@/lib/env'

export default function QaBanner({
  businessName,
  label,
  changeLabel,
}: {
  businessName: string
  label: string
  changeLabel: string
}) {
  if (!isQa) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#dc2626',
        color: '#fff',
        textAlign: 'center',
        padding: '6px 16px',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {label} &middot; {businessName} &middot;{' '}
      <a
        href="/qa/negocio"
        style={{ color: '#fef08a', textDecoration: 'underline' }}
      >
        {changeLabel}
      </a>
    </div>
  )
}
