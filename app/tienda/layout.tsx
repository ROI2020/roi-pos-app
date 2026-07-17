import Script from 'next/script'
import pool from '@/lib/db'

export default async function TiendaLayout({ children }: { children: React.ReactNode }) {
  let ga4Id: string | null = null
  try {
    const { rows } = await pool.query(
      `SELECT value FROM settings WHERE key = 'catalog_ga4_measurement_id'`
    )
    ga4Id = rows[0]?.value ?? null
  } catch { /* sin tracking si falla la consulta */ }

  return (
    <>
      {ga4Id && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${ga4Id}');
          `}</Script>
        </>
      )}
      {children}
    </>
  )
}
