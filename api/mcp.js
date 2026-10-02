// api/mcp.js — Vercel Serverless Function: conector MCP do Life OS para o Claude.
// Transporte "Streamable HTTP" sem estado: cada POST traz uma mensagem JSON-RPC
// (ou um lote) e a resposta volta como JSON puro, sem SSE nem sessão.
//
// As ferramentas SÃO as do assistente do app (js/services/aiTools*.js, rodando no
// servidor via _mcp/appRuntime.js): ferramenta nova lá aparece aqui sozinha. Só
// undo_last_change é daqui (usa os backups que só o servidor grava).
// Confirmação de escrita: o app do Claude pede permissão por ferramenta
// (readOnlyHint:false nas de escrita).
//
// Env vars (Vercel → Settings → Environment Variables):
//   LIFEOS_MCP_SECRET        chave longa e aleatória; vai na URL do conector (?key=...)
//   FIREBASE_SERVICE_ACCOUNT JSON da conta de serviço do projeto Firebase
//   LIFEOS_UID               uid do usuário no Firebase Auth (dono dos dados)
import crypto from 'node:crypto';
import { ferramentas } from './_mcp/appRuntime.js';
import { executarLeitura, executarEscrita, desfazerUltima } from './_mcp/store.js';
import { isConfigured } from './_mcp/firestore.js';

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'life-os', title: 'Life OS', version: '2.0.0' };
const INSTRUCTIONS = 'Conector do Life OS do André: tarefas, agenda, projetos e notas, áreas, '
  + 'hábitos, inbox, revisão semanal e finanças completas (contas, cartões e faturas, orçamentos, '
  + 'recorrências, metas, relatórios). Valores sempre em reais (o app converte para centavos). '
  + 'Datas em YYYY-MM-DD no horário de Brasília. Use as ferramentas de leitura antes de afirmar '
  + 'números ou ids e antes de editar; nomes de conta, categoria, cartão, área, projeto e hábito '
  + 'podem ir no lugar do id. Compra no crédito vai em add_card_purchase. Depois de alterar, '
  + 'confirme ao usuário o que foi gravado. Se algo saiu errado, undo_last_change desfaz a última '
  + 'alteração feita por aqui.';

const UNDO_TOOL = {
  name: 'undo_last_change',
  description: 'Desfaz a alteração mais recente feita por este conector (as 20 últimas ficam guardadas; chamar de novo desfaz a anterior). Recusa se o mesmo dado mudou depois no app.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { title: 'Desfazer última alteração', readOnlyHint: false, destructiveHint: true, openWorldHint: false }
};

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

function _paraMcp(f) {
  return {
    name: f.name,
    description: f.description,
    inputSchema: f.input_schema || { type: 'object', properties: {} },
    annotations: { readOnlyHint: !f.write, destructiveHint: /^delete_/.test(f.name), openWorldHint: false }
  };
}

function listToolsResult() {
  return { tools: [...ferramentas().map(_paraMcp), UNDO_TOOL] };
}

function _executor(name) {
  if (name === UNDO_TOOL.name) return () => desfazerUltima();
  const f = ferramentas().find(t => t.name === name);
  if (!f) return null;
  return args => (f.write ? executarEscrita(name, args) : executarLeitura(name, args));
}

/** Erros de negócio ({ erro }) e falhas viram isError para o modelo poder corrigir. */
async function callToolResult(params) {
  const name = params && params.name;
  const run = _executor(name);
  if (!run) return toolText({ erro: `Ferramenta "${name}" não existe.` }, true);
  if (!isConfigured()) return toolText({ erro: 'Servidor sem FIREBASE_SERVICE_ACCOUNT/LIFEOS_UID configurados na Vercel.' }, true);
  try {
    const result = await run((params && params.arguments) || {});
    return toolText(result, !!(result && result.erro));
  } catch (err) {
    console.error('[mcp] falha na ferramenta', name, err);
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
