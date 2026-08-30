/**
 * i18n/request.ts — Configuración de next-intl v4 (requerida)
 *
 * next-intl v4 busca este archivo para inicializar su contexto server-side.
 * El locale real y los mensajes los determina app/tienda/layout.tsx a partir
 * del dominio del request (multi-tenant: malema → es-AR, nularione → en-US).
 * Este archivo carga los mensajes correctos cuando next-intl los necesita
 * en el servidor (SSR de client components).
 *
 * requestLocale viene del header Accept-Language o de la configuración de
 * routing de next-intl. Sin routing plugin explícito, usamos 'es' como
 * fallback seguro.
 */

import { getRequestConfig } from 'next-intl/server'

export default getRequestConfig(async ({ requestLocale }) => {
  // Intentar usar el locale del request; si no está disponible, usar español.
  const locale = (await requestLocale) ?? 'es'

  let messages: Record<string, unknown> = {}
  try {
    messages = (
      await import(`../messages/${locale}.json`)
    ).default as Record<string, unknown>
  } catch {
    // Fallback a español si el locale pedido no tiene archivo de mensajes
    try {
      messages = (
        await import('../messages/es.json')
      ).default as Record<string, unknown>
    } catch {
      // Ultra-fallback: mensajes vacíos (los textos mostrarán su clave)
    }
  }

  return { locale, messages }
})
