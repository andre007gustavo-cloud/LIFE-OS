// api/_mcp/auth.js — confere a chave compartilhada (LIFEOS_MCP_SECRET) do conector
// MCP e do endpoint do Atalho. Compara em tempo constante para não vazar por timing.
import crypto from 'node:crypto';

export function segredoConfere(given) {
  const expected = Buffer.from(process.env.LIFEOS_MCP_SECRET || '');
  const candidate = Buffer.from(String(given || ''));
  // Tamanho em bytes: timingSafeEqual lança se os Buffers diferem, e texto não-ASCII engana .length
  if (!expected.length || candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}
