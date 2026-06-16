/**
 * ===================== AI TOOLS =====================
 * Catálogo de ferramentas (tools) que o modelo pode chamar, no formato da API
 * Anthropic (name / description / input_schema), cada uma mapeada aos services
 * existentes. Separa LEITURA (write:false — executa direto) de ESCRITA
 * (write:true — exige confirmação na UI antes de rodar).
 *
 * Convenções:
 *  - Dinheiro chega em REAIS (mais natural pro modelo); o executor converte
 *    para centavos inteiros (Math.round(reais * 100)).
 *  - categoria/conta/area/projeto podem vir como NOME ou id: resolvemos por
 *    match case-insensitive. Não encontrou → devolve { erro } pro modelo se
 *    corrigir, nunca lança exceção.
 *  - Todo executor devolve um objeto JSON serializável (resultado ou erro).
 *
 * Knows nothing about the DOM.
 */

const AiTools = (() => {

  const brl = c => Utils.formatBRL(c);
  const norm = s => Utils.normalizeText(s);

  // ===== Resolução por nome/id =====

  /** Acha numa lista por id exato ou por nome normalizado. null se não achar. */
  function _match(lista, valor, nomeKey = 'nome') {
    if (!valor) return null;
    const alvo = String(valor);
    return lista.find(x => x.id === alvo)
      || lista.find(x => norm(x[nomeKey]) === norm(alvo))
      || lista.find(x => norm(x[nomeKey]).includes(norm(alvo)))
      || null;
  }

  function resolveCategoria(valor, tipo) {
    const lista = FinanceService.listCategorias(tipo);
    const cat = _match(lista, valor);
    if (cat) return { cat };
    return { erro: `Categoria "${valor}" não encontrada. Disponíveis: ${lista.map(c => c.nome).join(', ') || 'nenhuma'}` };
  }

  function resolveConta(valor) {
    const lista = FinanceService.listContas().filter(c => c.tipo !== 'meta');
    if (!valor) return { conta: lista[0] || null };
    const conta = _match(lista, valor);
    if (conta) return { conta };
    return { erro: `Conta "${valor}" não encontrada. Disponíveis: ${lista.map(c => c.nome).join(', ') || 'nenhuma'}` };
  }

  function resolveArea(valor) {
    const area = _match(AreaService.getAll(), valor, 'name');
    if (area) return { area };
    return { erro: `Área "${valor}" não encontrada. Disponíveis: ${AreaService.getAll().map(a => a.name).join(', ') || 'nenhuma'}` };
  }

  function resolveProjeto(valor) {
    const proj = _match(ProjectService.getAll(), valor, 'name');
    if (proj) return { proj };
    return { erro: `Projeto "${valor}" não encontrado. Disponíveis: ${ProjectService.getAll().map(p => p.name).join(', ') || 'nenhum'}` };
  }

  // ===== Helpers de exibição =====

  function _nomeArea(id) { const a = AreaService.getById(id); return a ? a.name : ''; }
  function _nomeProjeto(id) { const p = ProjectService.getById(id); return p ? p.name : ''; }
  function _nomeCategoria(id) { const c = FinanceService.getCategoriaById(id); return c ? c.nome : ''; }
  function _nomeConta(id) { const c = FinanceService.getContaById(id); return c ? c.nome : ''; }

  function _tarefaResumo(t) {
    return {
      id: t.id,
      nome: t.name,
      data: t.date || null,
      horario: t.start ? (t.start + (t.end ? '–' + t.end : '')) : null,
      prioridade: t.priority,
      status: t.status,
      projeto: _nomeProjeto(t.project) || null
    };
  }

  /** Tarefas de uma janela [de, ate], em aberto, sem duplicar (multi-dia). */
  function _tarefasNoIntervalo(de, ate, comHorario = false) {
    const vistas = new Set();
    const out = [];
    for (let d = de; d <= ate; d = Utils.addDays(d, 1)) {
      TaskService.forDay(d).forEach(t => {
        if (vistas.has(t.id) || !Utils.isTaskOpen(t)) return;
        if (comHorario && !t.start) return;
        vistas.add(t.id);
        out.push(t);
      });
    }
    return out;
  }

  // ===== Catálogo =====

  const TOOLS = {

    // --------- LEITURA ---------

    get_overview: {
      write: false,
      schema: {
        name: 'get_overview',
        description: 'Resumo geral do dia: tarefas de hoje, saldo atual, resumo do mês, saldo projetado para o fim do mês, alertas financeiros e nº de projetos ativos.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        const hoje = Utils.today();
        const mes = FinanceService.currentMonthPrefix();
        const resumo = FinanceService.getResumoMes(mes);
        const tarefas = TaskService.forDay(hoje).filter(Utils.isTaskOpen);
        return {
          data: hoje,
          qtdTarefasHoje: tarefas.length,
          tarefasHoje: tarefas.map(_tarefaResumo),
          saldoAtual: brl(FinanceService.getSaldo()),
          mes: { entradas: brl(resumo.entradas), saidas: brl(resumo.saidas), saldo: brl(resumo.saldoMes) },
          saldoProjetadoFimMes: brl(FinanceService.getSaldoProjetadoFimMes()),
          alertas: FinanceService.getAlertas().map(a => a.titulo),
          projetosAtivos: ProjectService.getAll().filter(p => p.status === 'ativo').length
        };
      }
    },

    list_tasks: {
      write: false,
      schema: {
        name: 'list_tasks',
        description: 'Lista tarefas por filtro. Use projetoId com filtro="projeto" e areaId com filtro="area".',
        input_schema: {
          type: 'object',
          properties: {
            filtro: { type: 'string', enum: ['hoje', 'semana', 'pendentes', 'projeto', 'area'], description: 'Qual conjunto de tarefas' },
            projetoId: { type: 'string', description: 'Id ou nome do projeto (filtro=projeto)' },
            areaId: { type: 'string', description: 'Id ou nome da área (filtro=area)' }
          },
          required: ['filtro']
        }
      },
      run({ filtro, projetoId, areaId }) {
        const hoje = Utils.today();
        let tarefas = [];
        if (filtro === 'hoje') {
          tarefas = TaskService.forDay(hoje).filter(Utils.isTaskOpen);
        } else if (filtro === 'semana') {
          tarefas = _tarefasNoIntervalo(hoje, Utils.addDays(hoje, 6));
        } else if (filtro === 'pendentes') {
          tarefas = TaskService.pending();
        } else if (filtro === 'projeto') {
          const r = resolveProjeto(projetoId); if (r.erro) return r;
          tarefas = TaskService.forProject(r.proj.id).filter(Utils.isTaskOpen);
        } else if (filtro === 'area') {
          const r = resolveArea(areaId); if (r.erro) return r;
          tarefas = TaskService.getAll().filter(t => t.area === r.area.id && Utils.isTaskOpen(t));
        }
        return { total: tarefas.length, tarefas: tarefas.map(_tarefaResumo) };
      }
    },

    list_projects: {
      write: false,
      schema: {
        name: 'list_projects',
        description: 'Lista os projetos ativos com área e status.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        const projetos = ProjectService.getAll()
          .filter(p => p.status === 'ativo')
          .map(p => ({ id: p.id, nome: p.name, area: _nomeArea(p.area), status: p.status, prazo: p.deadline || null }));
        return { total: projetos.length, projetos };
      }
    },

    list_areas: {
      write: false,
      schema: {
        name: 'list_areas',
        description: 'Lista as áreas (categorias de vida) com id e nome.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        return { areas: AreaService.getAll().map(a => ({ id: a.id, nome: a.name })) };
      }
    },

    finance_overview: {
      write: false,
      schema: {
        name: 'finance_overview',
        description: 'Visão financeira do mês: resumo, saldo atual, saldo projetado, régua 50/30/20, alertas e orçamentos por categoria.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        const mes = FinanceService.currentMonthPrefix();
        const resumo = FinanceService.getResumoMes(mes);
        const r503020 = FinanceService.get503020(mes);
        const orcamentos = FinanceService.getOrcamentoMes(mes).map(o => ({
          categoria: _nomeCategoria(o.categoriaId),
          limite: brl(o.limiteCentavos),
          gasto: brl(o.gastoCentavos),
          restante: brl(o.restanteCentavos),
          percentual: o.percentual,
          estado: o.estado
        }));
        return {
          mes,
          resumoMes: { entradas: brl(resumo.entradas), saidas: brl(resumo.saidas), saldo: brl(resumo.saldoMes) },
          saldoAtual: brl(FinanceService.getSaldo()),
          saldoProjetadoFimMes: brl(FinanceService.getSaldoProjetadoFimMes()),
          regra503020: {
            renda: brl(r503020.rendaCentavos),
            necessidades: { gasto: brl(r503020.necessidades.gastoCentavos), pct: Math.round(r503020.necessidades.pct), alvoPct: r503020.necessidades.alvoPct },
            desejos: { gasto: brl(r503020.desejos.gastoCentavos), pct: Math.round(r503020.desejos.pct), alvoPct: r503020.desejos.alvoPct },
            poupanca: { valor: brl(r503020.poupanca.valorCentavos), pct: Math.round(r503020.poupanca.pct), alvoPct: r503020.poupanca.alvoPct }
          },
          alertas: FinanceService.getAlertas().map(a => ({ titulo: a.titulo, descricao: a.descricao })),
          orcamentos
        };
      }
    },

    list_transactions: {
      write: false,
      schema: {
        name: 'list_transactions',
        description: 'Lista lançamentos financeiros. Filtros opcionais: mes (YYYY-MM), categoriaId/contaId (id ou nome).',
        input_schema: {
          type: 'object',
          properties: {
            mes: { type: 'string', description: 'Prefixo YYYY-MM. Default: mês atual.' },
            categoriaId: { type: 'string', description: 'Id ou nome da categoria' },
            contaId: { type: 'string', description: 'Id ou nome da conta' }
          }
        }
      },
      run({ mes, categoriaId, contaId }) {
        const cat = categoriaId ? _match(FinanceService.listCategorias(), categoriaId) : null;
        const conta = contaId ? _match(FinanceService.listContas(), contaId) : null;
        const ts = FinanceService.listTransactions({
          mes: mes || FinanceService.currentMonthPrefix(),
          categoriaId: cat ? cat.id : undefined,
          contaId: conta ? conta.id : undefined
        }).slice(0, 50);
        return {
          total: ts.length,
          transacoes: ts.map(t => ({
            id: t.id, data: t.data, tipo: t.tipo, valor: brl(t.valorCentavos),
            descricao: t.descricao, categoria: _nomeCategoria(t.categoriaId) || null,
            conta: _nomeConta(t.contaId) || null
          }))
        };
      }
    },

    simulate_spend: {
      write: false,
      schema: {
        name: 'simulate_spend',
        description: 'Simula se o André pode fazer uma compra (sem salvar nada). Diz se pode gastar, se aperta o orçamento ou se deixa o saldo negativo.',
        input_schema: {
          type: 'object',
          properties: {
            valorReais: { type: 'number', description: 'Valor da compra em reais' },
            categoria: { type: 'string', description: 'Nome ou id da categoria de despesa (opcional)' },
            cartao: { type: 'string', description: 'Nome ou id do cartão (opcional). Se ausente, simula no caixa/conta.' },
            parcelas: { type: 'number', description: 'Nº de parcelas no cartão (default 1)' }
          },
          required: ['valorReais']
        }
      },
      run({ valorReais, categoria, cartao, parcelas }) {
        const valorCentavos = Math.round((Number(valorReais) || 0) * 100);
        if (valorCentavos <= 0) return { erro: 'Informe um valor em reais maior que zero.' };

        let categoriaId = '';
        if (categoria) {
          const r = resolveCategoria(categoria, 'despesa'); if (r.erro) return r;
          categoriaId = r.cat.id;
        }

        let cartaoId = '', contaId = '';
        if (cartao && typeof CartaoService !== 'undefined') {
          const cc = _match(CartaoService.listCartoes(), cartao);
          if (!cc) return { erro: `Cartão "${cartao}" não encontrado.` };
          cartaoId = cc.id;
        } else {
          const r = resolveConta(null);
          contaId = r.conta ? r.conta.id : '';
        }

        const sim = FinanceService.simularGasto({
          valorCentavos, categoriaId, contaId, cartaoId,
          parcelas: Math.max(1, parseInt(parcelas, 10) || 1)
        });
        return {
          valor: brl(valorCentavos),
          veredito: sim.veredito.mensagem,
          nivel: sim.veredito.nivel,
          saldoFimMesAntes: brl(sim.projecao.saldoFimMesAntesCentavos),
          saldoFimMesDepois: brl(sim.projecao.saldoFimMesDepoisCentavos),
          ficaNegativo: sim.projecao.ficaNegativoDepois,
          orcamento: sim.orcamento && sim.orcamento.temOrcamento ? {
            categoria: sim.orcamento.categoriaNome,
            percentualDepois: sim.orcamento.percentualDepois,
            restanteDepois: brl(sim.orcamento.restanteDepoisCentavos)
          } : null
        };
      }
    },

    list_habits: {
      write: false,
      schema: {
        name: 'list_habits',
        description: 'Lista os hábitos com a sequência (streak) atual e escudos.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        return {
          habitos: HabitService.getAll().map(h => {
            const s = HabitService.stats(h.id);
            return { id: h.id, nome: h.name, streak: s.streak, escudos: s.shields };
          })
        };
      }
    },

    get_calendar: {
      write: false,
      schema: {
        name: 'get_calendar',
        description: 'Lista as tarefas com horário marcado num período [de, ate] (datas ISO YYYY-MM-DD).',
        input_schema: {
          type: 'object',
          properties: {
            de: { type: 'string', description: 'Data inicial ISO (YYYY-MM-DD)' },
            ate: { type: 'string', description: 'Data final ISO (YYYY-MM-DD)' }
          },
          required: ['de', 'ate']
        }
      },
      run({ de, ate }) {
        const tarefas = _tarefasNoIntervalo(de, ate, true)
          .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
        return { total: tarefas.length, tarefas: tarefas.map(_tarefaResumo) };
      }
    },

    // --------- ESCRITA (exigem confirmação) ---------

    create_task: {
      write: true,
      schema: {
        name: 'create_task',
        description: 'Cria uma tarefa.',
        input_schema: {
          type: 'object',
          properties: {
            nome: { type: 'string' },
            data: { type: 'string', description: 'ISO YYYY-MM-DD. Default: hoje.' },
            inicio: { type: 'string', description: 'Hora início HH:MM' },
            fim: { type: 'string', description: 'Hora fim HH:MM' },
            prioridade: { type: 'string', enum: ['nenhuma', 'baixa', 'media', 'alta'] },
            areaId: { type: 'string', description: 'Id ou nome da área' },
            projetoId: { type: 'string', description: 'Id ou nome do projeto' },
            notas: { type: 'string' }
          },
          required: ['nome']
        }
      },
      run({ nome, data, inicio, fim, prioridade, areaId, projetoId, notas }) {
        if (!nome) return { erro: 'Nome da tarefa é obrigatório.' };
        let area = '', project = '';
        if (areaId) { const r = resolveArea(areaId); if (r.erro) return r; area = r.area.id; }
        if (projetoId) { const r = resolveProjeto(projetoId); if (r.erro) return r; project = r.proj.id; }
        const t = TaskService.create({
          name: nome, date: data || Utils.today(), start: inicio || '', end: fim || '',
          priority: prioridade || 'nenhuma', area, project, notes: notas || ''
        });
        return { ok: true, id: t.id, nome: t.name, data: t.date };
      }
    },

    plan_day: {
      write: true,
      schema: {
        name: 'plan_day',
        description: 'Planeja o dia criando uma tarefa por bloco. Blocos sem horário usam os blocos de trabalho do André quando aplicável.',
        input_schema: {
          type: 'object',
          properties: {
            data: { type: 'string', description: 'ISO YYYY-MM-DD. Default: hoje.' },
            blocos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nome: { type: 'string' },
                  inicio: { type: 'string', description: 'HH:MM' },
                  fim: { type: 'string', description: 'HH:MM' }
                },
                required: ['nome']
              }
            }
          },
          required: ['blocos']
        }
      },
      run({ data, blocos }) {
        const dia = data || Utils.today();
        const wb = TrelloService.WORK_BLOCKS[Utils.parseISO(dia).getDay()];
        const criadas = (blocos || []).map(b => {
          const inicio = b.inicio || (wb ? wb.start : '');
          const fim = b.fim || (wb ? wb.end : '');
          const t = TaskService.create({ name: b.nome, date: dia, start: inicio, end: fim });
          return { id: t.id, nome: t.name, inicio: inicio || null, fim: fim || null };
        });
        return { ok: true, data: dia, blocos: criadas };
      }
    },

    create_project: {
      write: true,
      schema: {
        name: 'create_project',
        description: 'Cria um projeto dentro de uma área.',
        input_schema: {
          type: 'object',
          properties: {
            nome: { type: 'string' },
            areaId: { type: 'string', description: 'Id ou nome da área' },
            descricao: { type: 'string' },
            prazo: { type: 'string', description: 'Deadline ISO YYYY-MM-DD' }
          },
          required: ['nome', 'areaId']
        }
      },
      run({ nome, areaId, descricao, prazo }) {
        const r = resolveArea(areaId); if (r.erro) return r;
        // ProjectService.save não dá default a color: herda a cor da área (com
        // fallback) para não gravar undefined, que o Firestore rejeita.
        const p = ProjectService.save({
          name: nome, area: r.area.id, desc: descricao || '', deadline: prazo || '',
          color: r.area.color || Constants.COLORS[0], icon: '📁'
        });
        return { ok: true, id: p.id, nome: p.name, area: r.area.name };
      }
    },

    create_note: {
      write: true,
      schema: {
        name: 'create_note',
        description: 'Cria uma nota dentro de um projeto.',
        input_schema: {
          type: 'object',
          properties: {
            projetoId: { type: 'string', description: 'Id ou nome do projeto' },
            titulo: { type: 'string' },
            conteudo: { type: 'string' }
          },
          required: ['projetoId', 'titulo', 'conteudo']
        }
      },
      run({ projetoId, titulo, conteudo }) {
        const r = resolveProjeto(projetoId); if (r.erro) return r;
        const n = ProjectService.addNote(r.proj.id, { title: titulo, content: conteudo });
        return { ok: true, id: n.id, projeto: r.proj.name, titulo: n.title };
      }
    },

    add_transaction: {
      write: true,
      schema: {
        name: 'add_transaction',
        description: 'Lança uma entrada ou saída financeira. Valor em reais.',
        input_schema: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: ['entrada', 'saida'] },
            valorReais: { type: 'number' },
            descricao: { type: 'string' },
            categoria: { type: 'string', description: 'Nome ou id da categoria' },
            conta: { type: 'string', description: 'Nome ou id da conta' },
            data: { type: 'string', description: 'ISO YYYY-MM-DD. Default: hoje.' }
          },
          required: ['tipo', 'valorReais', 'descricao']
        }
      },
      run({ tipo, valorReais, descricao, categoria, conta, data }) {
        const valorCentavos = Math.round((Number(valorReais) || 0) * 100);
        if (valorCentavos <= 0) return { erro: 'Informe um valor em reais maior que zero.' };
        let categoriaId = '';
        if (categoria) {
          const r = resolveCategoria(categoria, tipo === 'entrada' ? 'receita' : 'despesa');
          if (r.erro) return r; categoriaId = r.cat.id;
        }
        const rc = resolveConta(conta);
        if (rc.erro) return rc;
        if (!rc.conta) return { erro: 'Nenhuma conta cadastrada.' };
        const t = FinanceService.addTransaction({
          tipo, valorCentavos, descricao, categoriaId, contaId: rc.conta.id, data: data || Utils.today()
        });
        return { ok: true, id: t.id, tipo: t.tipo, valor: brl(t.valorCentavos), conta: rc.conta.nome };
      }
    },

    capture_inbox: {
      write: true,
      schema: {
        name: 'capture_inbox',
        description: 'Captura um texto na caixa de entrada (inbox) para processar depois.',
        input_schema: {
          type: 'object',
          properties: { texto: { type: 'string' } },
          required: ['texto']
        }
      },
      run({ texto }) {
        const item = InboxService.add(texto);
        if (!item) return { erro: 'Texto vazio.' };
        return { ok: true, id: item.id, texto: item.text };
      }
    },

    update_task: {
      write: true,
      schema: {
        name: 'update_task',
        description: 'Edita uma tarefa existente. Em patch use: nome, data, inicio, fim, prioridade, status, notas, areaId, projetoId.',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            patch: { type: 'object', description: 'Campos a alterar' }
          },
          required: ['id', 'patch']
        }
      },
      run({ id, patch }) {
        if (!TaskService.getById(id)) return { erro: 'Tarefa não encontrada.' };
        const p = patch || {};
        const map = { nome: 'name', data: 'date', inicio: 'start', fim: 'end', prioridade: 'priority', notas: 'notes' };
        const out = {};
        Object.keys(p).forEach(k => {
          if (k === 'areaId') { const r = resolveArea(p[k]); if (!r.erro) out.area = r.area.id; }
          else if (k === 'projetoId') { const r = resolveProjeto(p[k]); if (!r.erro) out.project = r.proj.id; }
          else out[map[k] || k] = p[k];
        });
        const t = TaskService.update(id, out);
        return { ok: true, id, nome: t.name };
      }
    },

    delete_task: {
      write: true,
      schema: {
        name: 'delete_task',
        description: 'Exclui uma tarefa.',
        input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
      },
      run({ id }) {
        const t = TaskService.getById(id);
        if (!t) return { erro: 'Tarefa não encontrada.' };
        TaskService.remove(id);
        return { ok: true, id, nome: t.name };
      }
    },

    update_transaction: {
      write: true,
      schema: {
        name: 'update_transaction',
        description: 'Edita um lançamento. Em patch use: valorReais, descricao, tipo, categoria, conta, data.',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            patch: { type: 'object' }
          },
          required: ['id', 'patch']
        }
      },
      run({ id, patch }) {
        const orig = FinanceService.getTransacaoById(id);
        if (!orig) return { erro: 'Lançamento não encontrado.' };
        const p = patch || {};
        const out = {};
        if (p.valorReais !== undefined) out.valorCentavos = Math.round((Number(p.valorReais) || 0) * 100);
        if (p.descricao !== undefined) out.descricao = p.descricao;
        if (p.tipo !== undefined) out.tipo = p.tipo;
        if (p.data !== undefined) out.data = p.data;
        if (p.categoria !== undefined) {
          const tipo = (p.tipo || orig.tipo) === 'entrada' ? 'receita' : 'despesa';
          const r = resolveCategoria(p.categoria, tipo); if (r.erro) return r; out.categoriaId = r.cat.id;
        }
        if (p.conta !== undefined) { const r = resolveConta(p.conta); if (r.erro) return r; out.contaId = r.conta.id; }
        const t = FinanceService.updateTransaction(id, out);
        return { ok: true, id, valor: brl(t.valorCentavos) };
      }
    },

    delete_transaction: {
      write: true,
      schema: {
        name: 'delete_transaction',
        description: 'Exclui um lançamento financeiro.',
        input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
      },
      run({ id }) {
        const t = FinanceService.getTransacaoById(id);
        if (!t) return { erro: 'Lançamento não encontrado.' };
        FinanceService.deleteTransaction(id);
        return { ok: true, id, valor: brl(t.valorCentavos) };
      }
    }

  };

  // ===== API pública =====

  function schemas() { return Object.values(TOOLS).map(t => t.schema); }
  function isWrite(name) { return !!(TOOLS[name] && TOOLS[name].write); }

  /** Executa a tool. Erros viram { erro } estruturado (nunca quebram o loop). */
  function run(name, input) {
    const tool = TOOLS[name];
    if (!tool) return { erro: `Ferramenta "${name}" não existe.` };
    try {
      return tool.run(input || {});
    } catch (err) {
      return { erro: 'Falha ao executar: ' + String(err && err.message || err) };
    }
  }

  return { schemas, isWrite, run };
})();
