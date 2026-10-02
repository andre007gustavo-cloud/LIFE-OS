// api/mcp.js — Vercel Serverless Function: conector MCP do Life OS para o Claude.
// Transporte "Streamable HTTP" sem estado: cada POST traz uma mensagem JSON-RPC
// (ou um lote) e a resposta volta como JSON puro, sem SSE nem sessão.
//
// Env vars (Vercel → Settings → Environment Variables):
//   LIFEOS_MCP_SECRET        chave longa e aleatória; vai na URL do conector (?key=...)
//   FIREBASE_SERVICE_ACCOUNT JSON da conta de serviço do projeto Firebase
//   LIFEOS_UID               uid do usuário no Firebase Auth (dono dos dados)
import crypto from 'node:crypto';
import { TOOLS } from './_mcp/tools.js';
import { isConfigured } from './_mcp/firestore.js';

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'life-os', title: 'Life OS', version: '1.0.0' };
const INSTRUCTIONS = 'Conector das finanças do Life OS do André. Valores sempre em reais '
  + '(o servidor converte para centavos). Datas em YYYY-MM-DD no horário de Brasília. '
  + 'Antes de lançar, chame get_finance_setup para usar os nomes reais de contas, '
  + 'categorias e cartões; compras no crédito vão em add_card_purchase. Depois de lançar, '
  + 'confirme ao usuário o que foi gravado (valor, conta/cartão, categoria, data).';

const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INVALID_REQUEST = -32600;

/** Compara em tempo constante para não vazar a chave por timing. */
function isAuthorized(req) {
  const expected = process.env.LIFEOS_MCP_SECRET || '';
  const given = String((req.query && req.query.key) || '');
  if (!expected || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function initializeResult(params) {
  const requested = params && params.protocolVersion;
  return {
    protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS
  };
}

function listToolsResult() {
  return { tools: TOOLS.map(({ run, ...definition }) => definition) };
}

/** Erros de negócio ({ erro }) e falhas viram isError para o modelo poder corrigir. */
async function callToolResult(params) {
  const tool = TOOLS.find(t => t.name === (params && params.name));
  if (!tool) return toolText({ erro: `Ferramenta "${params && params.name}" não existe.` }, true);
  if (!isConfigured()) return toolText({ erro: 'Servidor sem FIREBASE_SERVICE_ACCOUNT/LIFEOS_UID configurados na Vercel.' }, true);
  try {
    const result = await tool.run((params && params.arguments) || {});
    return toolText(result, !!(result && result.erro));
  } catch (err) {
    console.error('[mcp] falha na ferramenta', tool.name, err);
    return toolText({ erro: 'Falha ao executar: ' + String((err && err.message) || err) }, true);
  }
}

function toolText(payload, isError) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError };
}

const METHODS = {
  initialize: initializeResult,
  ping: () => ({}),
  'tools/list': listToolsResult,
  'tools/call': callToolResult
};

/** Uma mensagem JSON-RPC → resposta, ou null para notificações (sem id). */
async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return { jsonrpc: '2.0', id: (msg && msg.id) ?? null, error: { code: JSONRPC_INVALID_REQUEST, message: 'Invalid Request' } };
  }
  if (msg.id === undefined) return null;
  const method = METHODS[msg.method];
  if (!method) {
    return { jsonrpc: '2.0', id: msg.id, error: { code: JSONRPC_METHOD_NOT_FOUND, message: `Method not found: ${msg.method}` } };
  }
  return { jsonrpc: '2.0', id: msg.id, result: await method(msg.params) };
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const isBatch = Array.isArray(req.body);
  const messages = isBatch ? req.body : [req.body];
  const responses = (await Promise.all(messages.map(handleMessage))).filter(Boolean);
  if (!responses.length) return res.status(202).end();
  return res.status(200).json(isBatch ? responses : responses[0]);
}
