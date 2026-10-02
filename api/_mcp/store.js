// api/_mcp/store.js — executa uma ferramenta do app (appRuntime) sobre o doc
// users/{uid} e grava o que ela mudou. Regras (NÃO afrouxar):
//  - ESCRITA roda dentro de uma transação sobre leitura FRESCA; se alguém gravar
//    no meio, a transação refaz tudo.
//  - Grava SÓ as chaves sincronizadas (SEED_DATA) que mudaram, com lastWriter +
//    updatedAt — sem os dois o app aberto ignoraria a mudança.
//  - Recusa esvaziar uma lista que tinha mais de um item, regravar chave com data
//    do servidor (Timestamp) e gravar centavos que não sejam inteiros.
//  - Antes de gravar, guarda o valor anterior das chaves num backup (anel de
//    BACKUP_SLOTS docs em users/{uid}/mcpBackups) para undo() desfazer.
//  - LEITURA nunca grava, mesmo que algum service tenha "persistido".
import crypto from 'node:crypto';
import { criarSessao, seedData } from './appRuntime.js';
import {
  readDoc, runTransaction, userDocName, decodeFields, decodeValue, encodeValue,
  updateFieldsWrite, setDocWrite
} from './firestore.js';

const WRITER_ID = 'mcp-claude';
const SYNC_FIELDS = ['lastWriter', 'updatedAt'];
// meta.lastActivity é carimbado a cada persist() e mede a ausência do André no
// app (tela de recomeço): ação do Claude não conta como uso, e gravá-lo travaria
// o undo no primeiro uso real do app depois.
const CHAVES_DO_APP = ['meta'];
const BACKUP_COLLECTION = 'mcpBackups';
const BACKUP_STATE_DOC = `${BACKUP_COLLECTION}/_estado`;
const BACKUP_SLOTS = 20;
// O doc do Firestore tem limite de 1 MiB; backup maior que isso não cabe.
const BACKUP_MAX_BYTES = 900_000;

// ===== Comparação estável =====

/** JSON com chaves ordenadas: a ordem dos campos de um mapa no Firestore não é garantida. */
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

const hashOf = v => crypto.createHash('sha256').update(stableJson(v)).digest('hex');

function _semCamposDeSync(fields) {
  const out = { ...fields };
  SYNC_FIELDS.forEach(k => delete out[k]);
  return out;
}

// ===== Guardas =====

function _temTimestamp(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if ('timestampValue' in raw) return true;
  return Object.values(raw).some(_temTimestamp);
}

/** Caminhos de campos *Centavos com valor não inteiro (ex.: 'transacoes.3.valorCentavos'). */
function _centavosQuebrados(v, caminho = '', out = new Set()) {
  if (Array.isArray(v)) v.forEach((x, i) => _centavosQuebrados(x, `${caminho}.${i}`, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (/Centavos$/.test(k) && typeof x === 'number' && !Number.isInteger(x)) out.add(`${caminho}.${k}`);
      else _centavosQuebrados(x, `${caminho}.${k}`, out);
    }
  }
  return out;
}

function _ehSoPadrao(chave, original, novo) {
  if (chave in original) return false;
  const seed = seedData()[chave];
  return stableJson(novo) === stableJson(Array.isArray(seed) ? [] : seed);
}

/** Lança se a mudança da chave for perigosa. */
function _conferirMudanca(chave, antesRaw, antes, depois) {
  if (Array.isArray(antes) && antes.length > 1 && Array.isArray(depois) && !depois.length) {
    throw new Error(`Recusado: a ação esvaziaria a lista "${chave}" inteira.`);
  }
  if (_temTimestamp(antesRaw)) throw new Error(`Recusado: "${chave}" tem data do servidor e não pode ser regravado daqui.`);
  const jaQuebrados = _centavosQuebrados(antes);
  const novos = [..._centavosQuebrados(depois)].filter(p => !jaQuebrados.has(p));
  if (novos.length) throw new Error(`Recusado: valor em centavos não inteiro em ${chave}${novos[0]}.`);
}

/** { chave: valorNovo } só das chaves sincronizadas que mudaram, já conferidas. */
export function chavesMudadas(rawAntes, depois) {
  const antes = decodeFields(rawAntes);
  const out = {};
  for (const chave of Object.keys(seedData())) {
    if (CHAVES_DO_APP.includes(chave) || !(chave in depois) || stableJson(antes[chave]) === stableJson(depois[chave])) continue;
    if (_ehSoPadrao(chave, antes, depois[chave])) continue;
    _conferirMudanca(chave, rawAntes[chave], antes[chave], depois[chave]);
    out[chave] = depois[chave];
  }
  return out;
}

// ===== Backup =====

function _backupFields({ nome, input, resumo, rawAntes, mudou }) {
  const chaves = Object.keys(mudou);
  const antes = {};
  chaves.filter(k => k in rawAntes).forEach(k => { antes[k] = rawAntes[k]; });
  const semDados = JSON.stringify(antes).length > BACKUP_MAX_BYTES;
  const depoisHash = Object.fromEntries(chaves.map(k => [k, hashOf(mudou[k])]));
  return {
    criadoEm: { stringValue: new Date().toISOString() },
    ferramenta: { stringValue: nome },
    argumentos: { stringValue: JSON.stringify(input || {}) },
    resumo: { stringValue: JSON.stringify(resumo).slice(0, 1500) },
    chaves: encodeValue(chaves),
    ausentes: encodeValue(chaves.filter(k => !(k in rawAntes))),
    antes: semDados ? { nullValue: null } : { mapValue: { fields: antes } },
    depoisHash: encodeValue(depoisHash),
    semDados: { booleanValue: semDados },
    desfeito: { booleanValue: false }
  };
}

function _proximoSlot(estado) {
  const contador = estado ? decodeValue(estado.fields.contador) || 0 : 0;
  return contador + 1;
}

function _slotName(contador) {
  return userDocName(`${BACKUP_COLLECTION}/${contador % BACKUP_SLOTS}`);
}

// ===== Execução =====

async function _lerDocPrincipal(read = readDoc) {
  const doc = await read(userDocName());
  if (!doc) throw new Error('Documento do Life OS não encontrado no Firestore (abra o app uma vez).');
  return doc.fields;
}

/** Ferramenta de LEITURA: só lê, roda e devolve o resultado. */
export async function executarLeitura(nome, input) {
  const raw = await _lerDocPrincipal();
  return criarSessao(decodeFields(_semCamposDeSync(raw))).executar(nome, input);
}

/** Ferramenta de ESCRITA: transação com leitura fresca + backup + gravação das chaves mudadas. */
export async function executarEscrita(nome, input) {
  return runTransaction(async read => {
    const raw = _semCamposDeSync(await _lerDocPrincipal(read));
    const estado = await read(userDocName(BACKUP_STATE_DOC));
    const sessao = criarSessao(decodeFields(raw));
    const resultado = sessao.executar(nome, input);
    const mudou = (resultado && resultado.erro) ? {} : chavesMudadas(raw, sessao.estado());
    if (!Object.keys(mudou).length) return { writes: [], result: resultado };
    const contador = _proximoSlot(estado);
    const encoded = Object.fromEntries(Object.entries(mudou).map(([k, v]) => [k, encodeValue(v)]));
    return {
      writes: [
        updateFieldsWrite(userDocName(), encoded, Object.keys(mudou), WRITER_ID),
        setDocWrite(_slotName(contador), _backupFields({ nome, input, resumo: resultado, rawAntes: raw, mudou })),
        setDocWrite(userDocName(BACKUP_STATE_DOC), { contador: encodeValue(contador) })
      ],
      result: resultado
    };
  });
}

// ===== Desfazer =====

/** Backup mais recente ainda não desfeito: { contador, fields } ou null. */
async function _ultimoBackup(read, estado) {
  const contador = estado ? decodeValue(estado.fields.contador) || 0 : 0;
  for (let c = contador; c > 0 && c > contador - BACKUP_SLOTS; c--) {
    const doc = await read(_slotName(c));
    if (doc && !decodeValue(doc.fields.desfeito)) return { contador: c, fields: doc.fields };
  }
  return null;
}

/** Chaves que mudaram DEPOIS da ação do Claude (desfazer apagaria isso). */
function _alteradasDepois(backup, rawAtual) {
  const hashes = decodeValue(backup.depoisHash) || {};
  return Object.keys(hashes).filter(k => hashOf(decodeValue(rawAtual[k])) !== hashes[k]);
}

function _restauracao(backup) {
  const chaves = decodeValue(backup.chaves) || [];
  const ausentes = new Set(decodeValue(backup.ausentes) || []);
  const antes = (backup.antes.mapValue && backup.antes.mapValue.fields) || {};
  const fields = {};
  chaves.filter(k => !ausentes.has(k)).forEach(k => { fields[k] = antes[k]; });
  return { fields, mask: chaves }; // chave no mask e fora de fields = apagada (não existia antes)
}

/** Desfaz a alteração mais recente feita pelo conector, se nada mudou depois dela. */
export async function desfazerUltima() {
  return runTransaction(async read => {
    const estado = await read(userDocName(BACKUP_STATE_DOC));
    const backup = await _ultimoBackup(read, estado);
    if (!backup) return { erro: 'Não há alteração do Claude para desfazer (guardo as últimas ' + BACKUP_SLOTS + ').' };
    const b = backup.fields;
    const acao = { ferramenta: decodeValue(b.ferramenta), argumentos: JSON.parse(decodeValue(b.argumentos) || '{}'), em: decodeValue(b.criadoEm) };
    if (decodeValue(b.semDados)) return { erro: 'Essa alteração era grande demais para ter backup; desfaça manualmente.', acao };
    const raw = await _lerDocPrincipal(read);
    const depois = _alteradasDepois(b, raw);
    if (depois.length) return { erro: `Não dá para desfazer com segurança: ${depois.join(', ')} mudou depois dessa ação (no app ou por outra ferramenta). Corrija manualmente.`, acao };
    const { fields, mask } = _restauracao(b);
    return {
      writes: [
        updateFieldsWrite(userDocName(), fields, mask, WRITER_ID),
        setDocWrite(_slotName(backup.contador), { ...b, desfeito: { booleanValue: true } })
      ],
      result: { ok: true, desfeito: acao }
    };
  });
}
