// Declaración mínima de tipos para node-soap (no tiene @types en npm)
declare module 'node-soap' {
  export interface Client {
    [method: string]: (...args: unknown[]) => unknown
  }
  export function createClientAsync(url: string, options?: Record<string, unknown>): Promise<Client>
}
