export const ORCHESTRATION_DASHBOARD_MAX_STRING = 256

export type ResolveGateRequest = { gateId: string; decision: string }

export function validateResolveGateRequest(value: unknown): ResolveGateRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('La solicitud para resolver el gate no es válida.')
  }
  const request = value as { gateId?: unknown; decision?: unknown }
  for (const [name, field] of [
    ['gateId', request.gateId],
    ['decision', request.decision]
  ] as const) {
    if (
      typeof field !== 'string' ||
      field.trim().length === 0 ||
      field.length > ORCHESTRATION_DASHBOARD_MAX_STRING
    ) {
      throw new Error(`${name} debe ser un texto no vacío y acotado.`)
    }
  }
  return { gateId: request.gateId as string, decision: request.decision as string }
}
