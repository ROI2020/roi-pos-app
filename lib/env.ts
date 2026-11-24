/**
 * lib/env.ts — APP_ENV detection.
 *
 * Works in server, edge (middleware) and client contexts.
 * No dependencies — keep it that way.
 *
 * Values: 'development' | 'qa' | 'production'
 * Unknown or empty → 'development' (fail-safe: guards stay ON).
 */

const VALID = new Set(['development', 'qa', 'production'] as const)

type AppEnv = 'development' | 'qa' | 'production'

const raw = (typeof process !== 'undefined' ? process.env.APP_ENV : undefined) ?? ''
export const APP_ENV: AppEnv = VALID.has(raw as AppEnv) ? (raw as AppEnv) : 'development'

export const isProd = APP_ENV === 'production'
export const isQa   = APP_ENV === 'qa'
export const isDev  = APP_ENV === 'development'
