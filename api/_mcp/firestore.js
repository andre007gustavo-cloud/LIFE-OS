// api/_mcp/firestore.js — acesso ao Firestore via REST, sem dependências (nada de
// firebase-admin/package.json): autentica com a conta de serviço assinando um JWT
// com node:crypto. A conta de serviço ignora as regras do Firestore, por isso só o
// servidor a conhece (env FIREBASE_SERVICE_ACCOUNT).
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/datastore';
const API = 'https://firestore.googleapis.com/v1';
const TOKEN_MARGIN_MS = 60_000;
const MAX_ATTEMPTS = 3;
const HTTP_NOT_FOUND = 404;
const HTTP_ABORTED = 409; // transação perdeu a corrida (contenção): refazer

let _token = null; // { value, expiresAtMs } — reaproveitado entre invocações quentes

export function isConfigured() {
  return !!(process.env.FIREBASE_SERVICE_ACCOUNT && process.env.LIFEOS_UID);
}

function _serviceAccount() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  // Colar a chave na Vercel às vezes mantém "\n" literal dentro da private_key
  sa.private_key = String(sa.private_key || '').replace(/\\n/g, '\n');
  return sa;
}

function _signJwt(sa) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = { iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 };
  const unsigned = [header, claims]
    .map(part => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.');
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  return `${unsigned}.${signature}`;
}

async function _accessToken(sa) {
  if (_token && _token.expiresAtMs - TOKEN_MARGIN_MS > Date.now()) return _token.value;
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: _signJwt(sa)
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error('Falha ao autenticar a conta de serviço: ' + (data.error_description || data.error));
  _token = { value: data.access_token, expiresAtMs: Date.now() + data.expires_in * 1000 };
  return _token.value;
}

/** Chamada autenticada à API REST. Lança Error com status/mensagem do Firestore. */
async function _call(method, url, body) {
  const sa = _serviceAccount();
  const resp = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await _accessToken(sa)}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(`Firestore ${resp.status}: ${(data.error && data.error.message) || resp.statusText}`);
    err.status = resp.status;
    throw err;
  }
  return data;
}

function _documentsRoot() {
  return `projects/${_serviceAccount().project_id}/databases/(default)/documents`;
}

/** Nome completo de um doc a partir do caminho relativo ao usuário ('' = o próprio users/{uid}). */
export function userDocName(subpath = '') {
  const base = `${_documentsRoot()}/users/${process.env.LIFEOS_UID}`;
  return subpath ? `${base}/${subpath}` : base;
}

// ===== Conversão Firestore Value <-> JSON =====

export function decodeValue(v) {
  if (!v || 'nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  return null;
}

export function decodeFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = decodeValue(value);
  return out;
}

/** Inteiro vira integerValue (como o SDK web grava os centavos); undefined é omitido. */
export function encodeValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(encodeValue) } };
  const fields = {};
  for (const [key, value] of Object.entries(x)) {
    if (value !== undefined) fields[key] = encodeValue(value);
  }
  return { mapValue: { fields } };
}

// ===== Leitura / transação =====

/** Lê um doc: { fields } no formato Firestore, ou null se não existe. */
export async function readDoc(name, transaction) {
  const tx = transaction ? `?transaction=${encodeURIComponent(transaction)}` : '';
  try {
    const doc = await _call('GET', `${API}/${name}${tx}`);
    return { fields: doc.fields || {} };
  } catch (err) {
    if (err.status === HTTP_NOT_FOUND) return null;
    throw err;
  }
}

/**
 * Transação do Firestore (sem corrida com o app aberto em outro aparelho).
 * work(read) recebe read(name) → doc dentro da transação e devolve
 * { writes: [Write REST], result } ou { erro } para abortar sem gravar.
 * Refaz tudo (até MAX_ATTEMPTS) se outra escrita ganhar a corrida.
 */
export async function runTransaction(work) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await _tryTransaction(work);
    } catch (err) {
      if (err.status !== HTTP_ABORTED || attempt >= MAX_ATTEMPTS) throw err;
    }
  }
}

async function _tryTransaction(work) {
  const base = `${API}/${_documentsRoot()}`;
  const { transaction } = await _call('POST', `${base}:beginTransaction`, {});
  const out = await work(name => readDoc(name, transaction));
  if (out.erro || !out.writes || !out.writes.length) {
    await _call('POST', `${base}:rollback`, { transaction });
    return out.erro ? out : out.result;
  }
  await _call('POST', `${base}:commit`, { transaction, writes: out.writes });
  return out.result;
}

/**
 * Write que altera SÓ os campos de updateMask (campo no mask e ausente em
 * fields = apagado), carimbando lastWriter + updatedAt: o listener do app ignora
 * escrita sem lastWriter (cliente antigo) e só aplica updatedAt mais novo.
 */
export function updateFieldsWrite(name, fields, maskPaths, writerId) {
  const allFields = { ...fields, lastWriter: { stringValue: writerId } };
  return {
    update: { name, fields: allFields },
    updateMask: { fieldPaths: [...new Set([...maskPaths, 'lastWriter'])].map(_quotePath) },
    updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: true }
  };
}

/** Write que substitui o doc inteiro (cria se não existir). */
export function setDocWrite(name, fields) {
  return { update: { name, fields } };
}

/** Nome de campo fora de [A-Za-z_][A-Za-z_0-9]* precisa de crases no field path. */
function _quotePath(key) {
  return /^[A-Za-z_][A-Za-z_0-9]*$/.test(key) ? key : '`' + key.replace(/[`\\]/g, '\\$&') + '`';
}
