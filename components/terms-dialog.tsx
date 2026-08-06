"use client"

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"

interface Props {
  /** Nombre del comercio para personalizar el texto. Si se omite, usa "el comercio". */
  businessName?: string | null
  /** El elemento que abre el dialog al hacer click. */
  trigger: React.ReactNode
}

export function TermsDialog({ businessName, trigger }: Props) {
  const negocio = businessName?.trim() || 'el comercio'
  const Negocio = negocio.charAt(0).toUpperCase() + negocio.slice(1)

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-xl p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="text-base font-bold">
            Términos y Condiciones del Programa de Promociones
          </DialogTitle>
          <p className="text-xs text-gray-400 mt-0.5">{Negocio}</p>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[68vh] px-6 py-4">
          <div className="space-y-5 text-sm text-gray-700 leading-relaxed pb-4">

            {/* 1 */}
            <section>
              <h3 className="font-bold text-gray-900 mb-1.5">1. Participación y Requisitos</h3>
              <ul className="list-disc pl-4 space-y-1 text-gray-600">
                <li>La participación está disponible para personas físicas mayores de 18 años.</li>
                <li>Es requisito indispensable registrar un número de teléfono celular válido y verificarlo mediante WhatsApp.</li>
                <li>Se permite <strong>una (1) participación por número de teléfono por mes calendario</strong>, sin excepción.</li>
                <li>El beneficio es personal e intransferible: no puede cederse, venderse ni canjearse por dinero en efectivo.</li>
                <li>La participación implica la aceptación total de estos términos.</li>
              </ul>
            </section>

            {/* 2 */}
            <section>
              <h3 className="font-bold text-gray-900 mb-1.5">2. Mecánica de la Promoción</h3>
              <ul className="list-disc pl-4 space-y-1 text-gray-600">
                <li>El tipo y valor del descuento se determinan aleatoriamente mediante la ruleta digital.</li>
                <li>{Negocio} no garantiza un resultado específico en cada giro.</li>
                <li>El código de descuento generado tiene una <strong>validez de 30 días</strong> desde su emisión y es de <strong>un solo uso</strong>.</li>
                <li>No es acumulable con otras promociones, códigos ni descuentos, salvo indicación expresa del comercio en el momento de la compra.</li>
                <li>El código deberá presentarse al cajero al momento de abonar; vencido el plazo, quedará automáticamente inválido.</li>
              </ul>
            </section>

            {/* 3 */}
            <section>
              <h3 className="font-bold text-gray-900 mb-1.5">3. Disponibilidad de Stock y Canje</h3>
              <ul className="list-disc pl-4 space-y-1 text-gray-600">
                <li>El descuento aplica a los productos o categorías indicados en el cupón, <strong>sujeto a disponibilidad de stock</strong> al momento del canje.</li>
                <li>
                  En caso de <strong>falta de stock</strong> del artículo promocionado, {negocio} podrá, a su criterio:
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li>Ofrecer un producto de características similares o de valor equivalente.</li>
                    <li>Extender la validez del código por un período adicional razonable.</li>
                  </ul>
                </li>
                <li>{Negocio} se reserva el derecho de modificar los productos alcanzados por la promoción sin previo aviso, cuando circunstancias de fuerza mayor, cambios de temporada o discontinuación de productos así lo requieran.</li>
                <li>No se aplicará el descuento a productos ya rebajados, salvo que se indique expresamente lo contrario.</li>
              </ul>
            </section>

            {/* 4 */}
            <section>
              <h3 className="font-bold text-gray-900 mb-1.5">4. Invalidación del Cupón</h3>
              <p className="text-gray-600 mb-1.5">
                El cupón quedará <strong>automáticamente invalidado</strong>, sin derecho a reclamo, en los siguientes casos:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-gray-600">
                <li>Detección de uso fraudulento, manipulación o intento de alterar el funcionamiento del sistema.</li>
                <li>Registro de múltiples cuentas con datos similares, relacionados o pertenecientes a la misma persona física.</li>
                <li>Uso de medios automatizados (bots, scripts, herramientas de terceros) para participar o interactuar con el sistema.</li>
                <li>Alteración o falsificación del código de descuento.</li>
                <li>Cualquier conducta que {negocio} considere contraria al espíritu del programa o lesiva para el comercio o terceros.</li>
                <li>Vencimiento del plazo de validez indicado en el cupón.</li>
              </ul>
              <p className="text-gray-500 text-xs mt-2">
                La determinación de irregularidades queda a criterio exclusivo de {negocio}, cuya decisión será inapelable en el marco de esta promoción.
              </p>
            </section>

            {/* 5 */}
            <section>
              <h3 className="font-bold text-gray-900 mb-1.5">5. Privacidad y Tratamiento de Datos</h3>
              <ul className="list-disc pl-4 space-y-1 text-gray-600">
                <li>Los datos personales (nombre y número de teléfono) se recaban y almacenan exclusivamente con los siguientes fines:
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li>Verificar la identidad del participante y prevenir el uso múltiple.</li>
                    <li>Gestionar la participación en el programa y el canje de cupones.</li>
                    <li>Enviar comunicaciones sobre novedades y futuras promociones (solo cuando el participante otorgó su consentimiento expreso).</li>
                  </ul>
                </li>
                <li>Los datos <strong>no serán cedidos ni vendidos a terceros</strong> con fines comerciales.</li>
                <li>El participante puede solicitar en cualquier momento la rectificación o eliminación de sus datos dirigiéndose al comercio directamente.</li>
                <li>El tratamiento de datos se realiza en cumplimiento de la Ley N.° 25.326 de Protección de Datos Personales (Argentina).</li>
              </ul>
            </section>

            {/* 6 */}
            <section>
              <h3 className="font-bold text-gray-900 mb-1.5">6. Limitación de Responsabilidad</h3>
              <ul className="list-disc pl-4 space-y-1 text-gray-600">
                <li>{Negocio} no garantiza la disponibilidad ininterrumpida del sistema de ruleta ni de los canales de verificación (WhatsApp u otros).</li>
                <li>No se asume responsabilidad por fallas técnicas ajenas al comercio: cortes de internet, interrupciones de servicio de WhatsApp, fallas en dispositivos del participante u otros problemas de conectividad.</li>
                <li>La pérdida del código de descuento (por ejemplo, por eliminar el mensaje o cambiar de dispositivo) no dará lugar a la reposición del mismo, salvo criterio discrecional del comercio.</li>
                <li>{Negocio} no se responsabiliza por daños directos, indirectos o consecuentes derivados de la participación o no participación en el programa.</li>
              </ul>
            </section>

            {/* 7 */}
            <section>
              <h3 className="font-bold text-gray-900 mb-1.5">7. Modificación y Cancelación del Programa</h3>
              <ul className="list-disc pl-4 space-y-1 text-gray-600">
                <li>{Negocio} se reserva el derecho de modificar, suspender o cancelar el programa de promociones en cualquier momento y sin obligación de previo aviso.</li>
                <li>Los cambios en estas condiciones serán efectivos desde el momento en que se comuniquen o publiquen, y aplicarán a todas las participaciones posteriores.</li>
                <li>Los cupones ya emitidos y vigentes mantendrán su validez ante una eventual cancelación del programa, durante el plazo consignado en los mismos.</li>
              </ul>
            </section>

            {/* 8 */}
            <section>
              <h3 className="font-bold text-gray-900 mb-1.5">8. Jurisdicción y Ley Aplicable</h3>
              <p className="text-gray-600">
                Ante cualquier controversia derivada de la interpretación o aplicación de estos términos, las partes se someten a la jurisdicción de los tribunales ordinarios de la República Argentina, renunciando a cualquier otro fuero que pudiere corresponderles.
              </p>
            </section>

            <p className="text-xs text-gray-400 pt-2 border-t">
              Al tildar la casilla "Acepta las políticas y términos" en el formulario de registro, el participante declara haber leído, comprendido y aceptado íntegramente las condiciones aquí establecidas.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
