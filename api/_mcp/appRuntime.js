// api/_mcp/appRuntime.js — roda os arquivos do app (IIFEs de navegador) dentro de
// um sandbox `vm` do Node, para o conector usar a MESMA fonte que o browser
// (services + catálogo do AiTools) em vez de uma cópia das regras.
//
// Os scripts rodam num único contexto: como no browser, um `const X` de nível de
// topo de um arquivo fica visível para os carregados depois. Só entram arquivos
// que não tocam DOM/window no carregamento. Vão no deploy pelo `includeFiles`
// do vercel.json. Mesmo desenho do api/_appRuntime.js do Gestão de Vendas.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// O app assume o fuso do André (Utils.today() é data LOCAL). A Vercel roda em
// UTC: sem isto, das 21h à meia-noite "hoje" seria amanhã.
process.env.TZ = 'America/Sao_Paulo';

const RAIZ = process.cwd();

/**
 * O app de verdade, na ordem do index.html, sem a camada de sync (storage.js e
 * firebase.js viram o dublê abaixo) e só com os services que o AiTools usa.
 * Service novo que uma ferramenta use = acrescentar aqui.
 */
const ARQUIVOS_APP = [
  'js/config/constants.js', 'js/core/utils.js', 'js/core/state.js',
  ...['taskService', 'areaService', 'inboxService', 'projectService', 'financeService',
    'cartaoService', 'habitService', 'reviewService', 'trelloService',
    'aiTools', 'aiToolsPlanner', 'aiToolsFinance'].map(s => `js/services/${s}.js`)
];

const _fontes = new Map();
function _fonte(rel) {
  if (!_fontes.has(rel)) _fontes.set(rel, fs.readFileSync(path.join(RAIZ, rel), 'utf8'));
  return _fontes.get(rel);
}

/** Dublês do navegador: localStorage em memória, sem DOM. */
function _globaisDoNavegador() {
  const mem = new Map();
  return {
    console, setTimeout, clearTimeout,
    crypto: { randomUUID: () => crypto.randomUUID() },
    localStorage: {
      getItem: k => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: k => mem.delete(k)
    },
    location: { hostname: 'servidor' } // funções de teste do app só rodam em localhost
  };
}

/**
 * Dublê do Storage: load() devolve o doc (JSON parseado DENTRO do vm para os
 * arrays serem do mesmo realm dos services) completado pelo seed, como o
 * _pickDbFields do storage.js; save() é no-op — quem grava na nuvem é o
 * chamador, numa transação, comparando antes/depois.
 */
const DUBLE_STORAGE = `const Storage = (() => {
  const dados = JSON.parse(__doc);
  const db = { ...dados };
  Object.keys(Constants.SEED_DATA).forEach(k => {
    if (db[k] == null) db[k] = JSON.parse(JSON.stringify(Constants.SEED_DATA[k]));
  });
  return { load: () => db, save: () => {} };
})();`;

/** Contexto com o app inteiro carregado sobre o doc do usuário (objeto puro). */
function _montarApp(doc) {
  const ctx = vm.createContext(_globaisDoNavegador());
  ctx.window = ctx;
  ctx.__doc = JSON.stringify(doc || {});
  vm.runInContext(_fonte(ARQUIVOS_APP[0]), ctx, { filename: ARQUIVOS_APP[0] });
  vm.runInContext(DUBLE_STORAGE, ctx, { filename: 'duble-storage' });
  for (const rel of ARQUIVOS_APP.slice(1)) vm.runInContext(_fonte(rel), ctx, { filename: rel });
  return ctx;
}

/**
 * Sessão do app sobre o doc já lido do Firestore.
 * executar(nome, input) → resultado (objeto); estado() → DB inteiro depois da ação.
 */
export function criarSessao(doc) {
  const ctx = _montarApp(doc);
  return {
    executar(nome, input) {
      ctx.__nome = nome;
      ctx.__input = JSON.stringify(input || {});
      return JSON.parse(vm.runInContext('JSON.stringify(AiTools.run(__nome, JSON.parse(__input)) ?? null)', ctx));
    },
    estado: () => JSON.parse(vm.runInContext('JSON.stringify(AppState.getDB())', ctx))
  };
}

let _catalogo = null;
let _seed = null;

/** Schemas das ferramentas do app, com a marca de escrita de cada uma. */
export function ferramentas() {
  if (!_catalogo) {
    const ctx = _montarApp({});
    _catalogo = JSON.parse(vm.runInContext(
      'JSON.stringify(AiTools.schemas().map(s => ({ ...s, write: AiTools.isWrite(s.name) })))', ctx));
  }
  return _catalogo;
}

/** Constants.SEED_DATA: as chaves que o app sincroniza (e os valores vazios delas). */
export function seedData() {
  if (!_seed) {
    const ctx = vm.createContext({});
    vm.runInContext(_fonte(ARQUIVOS_APP[0]), ctx);
    _seed = JSON.parse(vm.runInContext('JSON.stringify(Constants.SEED_DATA)', ctx));
  }
  return _seed;
}
