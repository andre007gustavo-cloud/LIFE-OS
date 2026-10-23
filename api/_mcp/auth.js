// api/_mcp/auth.js — confere a chave compartilhada (LIFEOS_MCP_SECRET) do conector
// MCP e do endpoint do Atalho. Compara em tempo constante para não vazar por timing.
import crypto from 'node:crypto';

export function segredoConfere(given) {
  const expected = process.env.LIFEOS_MCP_SECRET || '';
  const candidate = String(given || '');
  if (!expected || candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}
