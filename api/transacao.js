// api/transacao.js — Vercel Serverless Function chamada pelo Atalho do iPhone a cada
// pagamento no Apple Pay: registra a compra "a conferir" (ferramenta
// register_wallet_purchase do app, via a mesma escrita transacional do conector MCP).
// A conferência é feita depois pelo Jarvis, pelo conector; aqui só há POST.
//
// Autenticação: `Authorization: Bearer <LIFEOS_MCP_SECRET>` (mesma chave do conector).
// Env vars: LIFEOS_MCP_SECRET, FIREBASE_SERVICE_ACCOUNT, LIFEOS_UID.
import { segredoConfere } from './_mcp/auth.js';
import { executarEscrita } from './_mcp/store.js';
import { isConfigured } from './_mcp/firestore.js';

const TOOL = 'register_wallet_purchase';
const CAMPOS_PERMITIDOS = ['valor', 'estabelecimento', 'cartao', 'data'];
const MAX_BODY_CHARS = 2000;
const MAX_TEXT_CHARS = 200;
const MSG_GENERICA = 'Não consegui registrar agora. Tente de novo.';

function _bearer(req) {
  const m = /^Bearer (.+)$/.exec(String((req.headers && req.headers.authorization) || ''));
  return m ? m[1] : '';
}

/** Corpo já parseado (objeto) ou texto JSON; devolve o objeto ou null. */
function _corpo(req) {
  const body = req.body;
  if (typeof body === 'string') {
    if (body.length > MAX_BODY_CHARS) return null;
    try { return JSON.parse(body); } catch { return null; }
  }
  if (body && JSON.stringify(body).length > MAX_BODY_CHARS) return null;
  return body;
}

const _texto = v => typeof v === 'string' && v.trim() && v.length <= MAX_TEXT_CHARS;

/** Mensagem de erro de validação, ou null se o corpo é válido. */
function _validar(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'Corpo inválido: envie um JSON com valor, estabelecimento e cartao.';
  const desconhecido = Object.keys(b).find(k => !CAMPOS_PERMITIDOS.includes(k));
  if (desconhecido) return `Campo desconhecido: ${desconhecido.slice(0, 30)}.`;
  const valorOk = (typeof b.valor === 'number' && Number.isFinite(b.valor)) || _texto(b.valor);
  if (!valorOk) return 'Valor inválido.';
  if (!_texto(b.estabelecimento)) return 'Estabelecimento inválido.';
  if (!_texto(b.cartao)) return 'Cartão inválido.';
  if (b.data !== undefined && typeof b.data !== 'string') return 'Data inválida.';
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Método não permitido.' });
  }
  if (!segredoConfere(_bearer(req))) return res.status(401).json({ erro: 'Não autorizado.' });
  const corpo = _corpo(req);
  const invalido = _validar(corpo);
  if (invalido) return res.status(400).json({ erro: invalido });
  if (!isConfigured()) {
    console.error('[transacao] FIREBASE_SERVICE_ACCOUNT/LIFEOS_UID não configurados');
    return res.status(500).json({ erro: MSG_GENERICA });
  }
  try {
    const r = await executarEscrita(TOOL, corpo);
    if (r && r.erro) return res.status(400).json({ erro: r.erro });
    return res.status(200).json({ ok: true, mensagem: r.mensagem, duplicada: !!r.duplicada });
  } catch (err) {
    console.error('[transacao] falha ao registrar', err);
    return res.status(500).json({ erro: MSG_GENERICA });
  }
}
