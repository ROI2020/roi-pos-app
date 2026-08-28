import { headers } from 'next/headers'

export const metadata = {
  title: 'Política de devoluciones — MALEMA STORE',
  description: 'Conocé nuestra política de devoluciones y garantías.',
}

export default async function DevolucionesPage() {
  const h          = await headers()
  const storeBase  = h.get('x-store-base') ?? '/tienda'
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-violet-500 px-8 py-8 text-white">
            <h1 className="text-2xl font-bold">Política de devoluciones</h1>
            <p className="text-violet-200 text-sm mt-1">MALEMA STORE</p>
          </div>

          <div className="px-8 py-8 space-y-8 text-gray-700 text-sm leading-relaxed">

            {/* Resumen ejecutivo */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-amber-800 text-sm">
              <p className="font-semibold mb-1">Resumen de nuestra política</p>
              <p>Solo aceptamos devoluciones por artículos con defecto de fabricación comprobado. No realizamos cambios de talle, color ni por preferencia del cliente.</p>
            </div>

            {/* Devoluciones por defecto */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                Devoluciones aceptadas
              </h2>
              <p>
                Aceptamos la devolución de un artículo únicamente cuando presenta un <strong>defecto de fabricación</strong> comprobable, es decir, una falla que no sea producto del uso normal del producto ni de su manipulación incorrecta.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Costuras rotas en la prenda sin haber sido usada</li>
                <li>Estampado o bordado con defecto visible</li>
                <li>Artículo diferente al que fue adquirido (error de despacho)</li>
              </ul>
            </section>

            {/* Condiciones */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900">Condiciones para la devolución</h2>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>El artículo debe estar sin uso, con etiquetas originales y en su embalaje original</li>
                <li>La solicitud debe realizarse dentro de los <strong>7 días corridos</strong> desde la recepción del pedido</li>
                <li>Es necesario presentar comprobante de compra</li>
                <li>El artículo debe ser enviado a nuestra dirección con flete a cargo del cliente, salvo que el defecto sea confirmado, en cuyo caso reembolsamos el costo de envío</li>
              </ul>
            </section>

            {/* No se aceptan cambios */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold shrink-0">✕</span>
                Cambios — no aceptados
              </h2>
              <p>
                <strong>No realizamos cambios de talle, color ni modelo</strong> por preferencia o error del comprador. Te recomendamos consultar la tabla de talles antes de realizar tu compra y escribirnos por WhatsApp ante cualquier duda.
              </p>
            </section>

            {/* Proceso */}
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900">Cómo iniciar una devolución</h2>
              <ol className="list-decimal pl-5 space-y-2 text-gray-600">
                <li>Escribinos por WhatsApp con una foto del defecto y el número de pedido</li>
                <li>Nuestro equipo evalúa el caso dentro de las 48 horas hábiles</li>
                <li>Si el defecto es confirmado, coordinamos el envío de devolución</li>
                <li>Una vez recibido y verificado el artículo, procesamos el reembolso o reposición según disponibilidad de stock</li>
              </ol>
            </section>

            {/* Contacto */}
            <section className="bg-gray-50 border border-gray-100 rounded-xl px-5 py-4 space-y-1">
              <p className="font-semibold text-gray-800 text-sm">¿Tenés alguna consulta?</p>
              <p className="text-gray-500">Escribinos directamente por WhatsApp y te respondemos a la brevedad.</p>
              <a
                href="https://wa.me/541134542093"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-2 text-sm font-medium text-green-600 hover:text-green-700 transition-colors"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Contactar por WhatsApp
              </a>
            </section>

            {/* Pie */}
            <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
              Esta política aplica a compras realizadas a través del catálogo de WhatsApp, Instagram y la tienda online de MALEMA STORE. Última actualización: agosto 2026.
            </p>

          </div>
        </div>

        <div className="text-center mt-6">
          <a href={storeBase} className="text-sm text-gray-400 hover:text-violet-600 transition-colors">
            ← Volver a la tienda
          </a>
        </div>

      </div>
    </div>
  )
}
