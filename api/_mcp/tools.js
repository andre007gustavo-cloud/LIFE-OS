// api/_mcp/tools.js — ferramentas financeiras expostas ao Claude pelo conector MCP.
// Espelha as regras dos services do app (js/services/financeService.js e
// cartaoService.js), que rodam só no navegador: centavos inteiros, tipos
// 'entrada' | 'saida' | 'transferencia', compra no cartão = UMA transação com
// cartaoId + parcelas e valor TOTAL. Mudou lá, mudar aqui.
import crypto from 'node:crypto';
import { readUserDoc, transactUserDoc, encodeValue } from './firestore.js';

const TIME_ZONE = 'America/Sao_Paulo';
const SOURCE = 'claude'; // campo 'fonte' dos lançamentos criados por aqui
const LIST_LIMIT_DEFAULT = 30;
const LIST_LIMIT_MAX = 100;
const FINANCE_FIELDS = ['contas', 'categorias', 'cartoes', 'transacoes'];

// ===== Helpers =====

function todayISO() {
  // en-CA formata como YYYY-MM-DD; o servidor roda em UTC, o app em UTC-3
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
}

const brl = centavos => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function toCentavos(valorReais) {
  return Math.round((Number(valorReais) || 0) * 100);
}

function isValidISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '');
}

/** Acha por id exato, nome igual ou nome contido (sem acento/caixa). */
function findByName(list, value) {
  if (!value) return null;
  const target = norm(value);
  return list.find(x => x.id === value)
    || list.find(x => norm(x.nome) === target)
    || list.find(x => norm(x.nome).includes(target))
    || null;
}

function notFound(label, value, list) {
  return { erro: `${label} "${value}" não encontrado(a). Disponíveis: ${list.map(x => x.nome).join(', ') || 'nenhum(a)'}` };
}

const activeContas = db => (db.contas || []).filter(c => !c.arquivada);
const activeCartoes = db => (db.cartoes || []).filter(c => !c.arquivado);
const activeCategorias = (db, tipo) => (db.categorias || []).filter(c => !c.arquivada && (!tipo || c.tipo === tipo));

function resolveCategoria(db, value, tipoTransacao) {
  if (!value) return { id: '' };
  const lista = activeCategorias(db, tipoTransacao === 'entrada' ? 'receita' : 'despesa');
  const cat = findByName(lista, value);
  return cat ? { id: cat.id, nome: cat.nome } : notFound('Categoria', value, lista);
}

/** Sem valor: primeira conta que não é meta (mesmo default do assistente do app). */
function resolveConta(db, value, { incluirMetas = false } = {}) {
  const lista = activeContas(db).filter(c => incluirMetas || c.tipo !== 'meta');
  if (!value) return lista[0] ? { id: lista[0].id, nome: lista[0].nome } : { erro: 'Nenhuma conta cadastrada no Life OS.' };
  const conta = findByName(lista, value);
  return conta ? { id: conta.id, nome: conta.nome } : notFound('Conta', value, lista);
}

/** Mesma regra de FinanceService.getSaldo: compra no cartão não mexe em conta. */
function saldoConta(db, contaId) {
  const conta = (db.contas || []).find(c => c.id === contaId);
  let saldo = conta ? conta.saldoInicialCentavos || 0 : 0;
  for (const t of db.transacoes || []) {
    if (t.cartaoId && !t.pagamentoFatura) continue;
    if (t.tipo === 'entrada' && t.contaId === contaId) saldo += t.valorCentavos;
    else if (t.tipo === 'saida' && t.contaId === contaId) saldo -= t.valorCentavos;
    else if (t.tipo === 'transferencia') {
      if (t.contaId === contaId) saldo -= t.valorCentavos;
      if (t.contaDestinoId === contaId) saldo += t.valorCentavos;
    }
  }
  return saldo;
}

function newTransaction(fields) {
  const now = new Date().toISOString();
  return {
    ...fields,
    id: crypto.randomUUID(),
    descricao: String(fields.descricao || '').trim(),
    data: fields.data || todayISO(),
    fonte: SOURCE,
    criadoEm: now,
    atualizadoEm: now
  };
}

/** Valida valor/data comuns a todo lançamento. null se ok. */
function validateBasics({ valorReais, data }) {
  if (toCentavos(valorReais) <= 0) return { erro: 'Informe um valor em reais maior que zero.' };
  if (data && !isValidISODate(data)) return { erro: 'Data deve estar no formato YYYY-MM-DD.' };
  return null;
}

/** Acrescenta uma transação preservando as existentes exatamente como estão na nuvem. */
async function appendTransaction(build) {
  return transactUserDoc(FINANCE_FIELDS, ({ data, raw }) => {
    const built = build(data);
    if (built.erro) return built;
    const atuais = (raw.transacoes && raw.transacoes.arrayValue && raw.transacoes.arrayValue.values) || [];
    return {
      writes: { transacoes: { arrayValue: { values: [...atuais, encodeValue(built.transacao)] } } },
      result: { ok: true, id: built.transacao.id, ...built.resumo }
    };
  });
}

function nomeDe(list, id) {
  const item = (list || []).find(x => x.id === id);
  return item ? item.nome : null;
}

function transactionSummary(db, t) {
  return {
    id: t.id,
    data: t.data,
    tipo: t.tipo,
    valor: brl(t.valorCentavos || 0),
    descricao: t.descricao,
    categoria: nomeDe(db.categorias, t.categoriaId),
    conta: nomeDe(db.contas, t.contaId),
    contaDestino: nomeDe(db.contas, t.contaDestinoId),
    cartao: nomeDe(db.cartoes, t.cartaoId),
    parcelas: t.parcelas || null
  };
}

// ===== Executores =====

async function getFinanceSetup() {
  const { data: db } = await readUserDoc(FINANCE_FIELDS);
  return {
    hoje: todayISO(),
    contas: activeContas(db).map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldo: brl(saldoConta(db, c.id)) })),
    categoriasDespesa: activeCategorias(db, 'despesa').map(c => ({ id: c.id, nome: c.nome })),
    categoriasReceita: activeCategorias(db, 'receita').map(c => ({ id: c.id, nome: c.nome })),
    cartoes: activeCartoes(db).map(c => ({ id: c.id, nome: c.nome, diaFechamento: c.diaFechamento, diaVencimento: c.diaVencimento }))
  };
}

async function listTransactions({ mes, limite }) {
  const { data: db } = await readUserDoc(FINANCE_FIELDS);
  const prefix = mes || todayISO().slice(0, 7);
  const max = Math.min(LIST_LIMIT_MAX, Math.max(1, parseInt(limite, 10) || LIST_LIMIT_DEFAULT));
  const doMes = (db.transacoes || [])
    .filter(t => (t.data || '').startsWith(prefix))
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  return { mes: prefix, total: doMes.length, transacoes: doMes.slice(0, max).map(t => transactionSummary(db, t)) };
}

async function addTransaction({ tipo, valorReais, descricao, categoria, conta, data }) {
  if (tipo !== 'entrada' && tipo !== 'saida') return { erro: 'tipo deve ser "entrada" ou "saida".' };
  const invalid = validateBasics({ valorReais, data });
  if (invalid) return invalid;
  return appendTransaction(db => {
    const cat = resolveCategoria(db, categoria, tipo); if (cat.erro) return cat;
    const ct = resolveConta(db, conta); if (ct.erro) return ct;
    const transacao = newTransaction({
      tipo, valorCentavos: toCentavos(valorReais), descricao, categoriaId: cat.id,
      contaId: ct.id, contaDestinoId: '', data
    });
    return { transacao, resumo: { tipo, valor: brl(transacao.valorCentavos), conta: ct.nome, categoria: cat.nome || null, data: transacao.data } };
  });
}

async function addCardPurchase({ cartao, valorReais, parcelas, descricao, categoria, data }) {
  const invalid = validateBasics({ valorReais, data });
  if (invalid) return invalid;
  return appendTransaction(db => {
    const card = findByName(activeCartoes(db), cartao);
    if (!card) return notFound('Cartão', cartao, activeCartoes(db));
    const cat = resolveCategoria(db, categoria, 'saida'); if (cat.erro) return cat;
    const nParcelas = Math.max(1, parseInt(parcelas, 10) || 1);
    const transacao = newTransaction({
      tipo: 'saida', valorCentavos: toCentavos(valorReais), descricao, categoriaId: cat.id,
      cartaoId: card.id, contaId: '', parcelas: nParcelas, data
    });
    return { transacao, resumo: { cartao: card.nome, valorTotal: brl(transacao.valorCentavos), parcelas: nParcelas, categoria: cat.nome || null, data: transacao.data } };
  });
}

async function addTransfer({ de, para, valorReais, descricao, data }) {
  if (!de || !para) return { erro: 'Informe a conta de origem (de) e a de destino (para).' };
  const invalid = validateBasics({ valorReais, data });
  if (invalid) return invalid;
  return appendTransaction(db => {
    const origem = resolveConta(db, de, { incluirMetas: true }); if (origem.erro) return origem;
    const destino = resolveConta(db, para, { incluirMetas: true }); if (destino.erro) return destino;
    if (origem.id === destino.id) return { erro: 'Origem e destino precisam ser contas diferentes.' };
    const transacao = newTransaction({
      tipo: 'transferencia', valorCentavos: toCentavos(valorReais), descricao: descricao || 'Transferência',
      categoriaId: '', contaId: origem.id, contaDestinoId: destino.id, data
    });
    return { transacao, resumo: { de: origem.nome, para: destino.nome, valor: brl(transacao.valorCentavos), data: transacao.data } };
  });
}

async function deleteTransaction({ id }) {
  return transactUserDoc(FINANCE_FIELDS, ({ data: db, raw }) => {
    const alvo = (db.transacoes || []).find(t => t.id === id);
    if (!alvo) return { erro: `Lançamento "${id}" não encontrado.` };
    const atuais = raw.transacoes.arrayValue.values || [];
    const restantes = atuais.filter((_, i) => db.transacoes[i].id !== id);
    return {
      writes: { transacoes: { arrayValue: { values: restantes } } },
      result: { ok: true, excluido: transactionSummary(db, alvo) }
    };
  });
}

// ===== Catálogo (formato MCP: name / description / inputSchema / annotations) =====

const READ_ONLY = { readOnlyHint: true };
const ADDITIVE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };

const valorReais = { type: 'number', description: 'Valor em reais (ex.: 85.5 para R$ 85,50)' };
const dataISO = { type: 'string', description: 'Data YYYY-MM-DD. Default: hoje (horário de Brasília).' };

export const TOOLS = [
  {
    name: 'get_finance_setup',
    description: 'Lista contas (com saldo atual), categorias de despesa/receita e cartões de crédito do Life OS. Chame antes de lançar para escolher conta, categoria e cartão pelos nomes reais.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Contas, categorias e cartões', ...READ_ONLY },
    run: getFinanceSetup
  },
  {
    name: 'list_transactions',
    description: 'Lista os lançamentos de um mês (mais recentes primeiro), com id para editar/excluir.',
    inputSchema: {
      type: 'object',
      properties: {
        mes: { type: 'string', description: 'YYYY-MM. Default: mês atual.' },
        limite: { type: 'number', description: `Máximo de itens (default ${LIST_LIMIT_DEFAULT}, máx ${LIST_LIMIT_MAX}).` }
      }
    },
    annotations: { title: 'Listar lançamentos', ...READ_ONLY },
    run: listTransactions
  },
  {
    name: 'add_transaction',
    description: 'Lança uma entrada (receita) ou saída (despesa) numa conta do Life OS. Para compra no cartão de crédito use add_card_purchase.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['entrada', 'saida'] },
        valorReais,
        descricao: { type: 'string' },
        categoria: { type: 'string', description: 'Nome ou id da categoria (de receita se entrada, de despesa se saída)' },
        conta: { type: 'string', description: 'Nome ou id da conta. Default: primeira conta.' },
        data: dataISO
      },
      required: ['tipo', 'valorReais', 'descricao']
    },
    annotations: { title: 'Lançar entrada/saída', ...ADDITIVE },
    run: addTransaction
  },
  {
    name: 'add_card_purchase',
    description: 'Lança uma compra no cartão de crédito (à vista ou parcelada). valorReais é o valor TOTAL; o app divide nas faturas.',
    inputSchema: {
      type: 'object',
      properties: {
        cartao: { type: 'string', description: 'Nome ou id do cartão' },
        valorReais,
        parcelas: { type: 'number', description: 'Nº de parcelas (default 1)' },
        descricao: { type: 'string' },
        categoria: { type: 'string', description: 'Nome ou id da categoria de despesa' },
        data: dataISO
      },
      required: ['cartao', 'valorReais', 'descricao']
    },
    annotations: { title: 'Lançar compra no cartão', ...ADDITIVE },
    run: addCardPurchase
  },
  {
    name: 'add_transfer',
    description: 'Transfere dinheiro entre duas contas (inclusive aporte numa meta). Não conta como receita nem despesa.',
    inputSchema: {
      type: 'object',
      properties: {
        de: { type: 'string', description: 'Conta de origem (nome ou id)' },
        para: { type: 'string', description: 'Conta de destino (nome ou id)' },
        valorReais,
        descricao: { type: 'string' },
        data: dataISO
      },
      required: ['de', 'para', 'valorReais']
    },
    annotations: { title: 'Transferir entre contas', ...ADDITIVE },
    run: addTransfer
  },
  {
    name: 'delete_transaction',
    description: 'Exclui um lançamento pelo id (use list_transactions para achar o id). Útil para desfazer um lançamento errado.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { title: 'Excluir lançamento', readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    run: deleteTransaction
  }
];
