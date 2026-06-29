import { prisma } from '@cr-agentic/database';

export interface AuditEntry {
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      ip: entry.ip,
      metadata: entry.metadata as object | undefined,
    },
  });
}

export function redactSensitive(metadata: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...metadata };
  for (const key of Object.keys(redacted)) {
    if (/password|cookie|token|secret|authorization/i.test(key)) {
      redacted[key] = '[REDACTED]';
    }
  }
  return redacted;
}
