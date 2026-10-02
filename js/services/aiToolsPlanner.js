/**
 * ===================== AI TOOLS — PLANNER =====================
 * Ferramentas do assistente para tarefas, agenda, projetos, notas, áreas,
 * hábitos, inbox e revisão semanal. Registra-se no catálogo do AiTools.
 * Knows nothing about the DOM.
 */

(() => {

  const {
    resolveArea, resolveProjeto, resolveHabito,
    nomeArea, tarefaResumo, tarefasNoIntervalo
  } = AiTools.helpers;

  const PRIORIDADES = ['nenhuma', 'baixa', 'media', 'alta'];
  const STATUS_TAREFA = ['afazer', 'emprogresso', 'concluida', 'descartada'];
  const RECORRENCIAS = ['', 'daily', 'weekly', 'monthly'];
  const STATUS_PROJETO = ['ativo', 'pausado', 'concluido'];
  const STATUS_HABITO = { feito: 'done', minimo: 'minimal' };
  const FREQUENCIAS = { diaria: 'daily', dias_uteis: 'weekdays', personalizada: 'custom' };

  const idSchema = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] };

  // ===== Helpers =====

  // Tags que o editor de notas produz: só elas indicam que o conteúdo já é HTML
  // (um "<adesiva>" no meio do texto não é).
  const TAG_HTML = /<\/?(p|br|div|span|b|i|u|s|strong|em|ul|ol|li|h[1-6]|img|a|blockquote|pre|code)\b[^>]*>/i;

  /** Nota do editor é HTML: texto puro do modelo vira HTML com quebras de linha. */
  function _textoParaHtml(texto) {
    const s = String(texto || '');
    if (TAG_HTML.test(s)) return s;
    return Utils.escapeHtml(s).replace(/\n/g, '<br>');
  }

  /** Converte o patch em pt-BR do modelo para os campos da tarefa (ou { erro }). */
  const _CAMPOS_TAREFA = {
    nome: 'name', data: 'date', dataFim: 'dateend', inicio: 'start', fim: 'end',
    prioridade: 'priority', status: 'status', notas: 'notes', recorrencia: 'recurrence',
    tags: 'tags', estimativa: 'estimate'
  };

  function _patchTarefa(p) {
    if (p.prioridade !== undefined && !PRIORIDADES.includes(p.prioridade)) return { erro: `prioridade deve ser: ${PRIORIDADES.join(', ')}.` };
    if (p.status !== undefined && !STATUS_TAREFA.includes(p.status)) return { erro: `status deve ser: ${STATUS_TAREFA.join(', ')}.` };
    if (p.recorrencia !== undefined && !RECORRENCIAS.includes(p.recorrencia)) return { erro: 'recorrencia deve ser: "", daily, weekly ou monthly.' };
    const out = {};
    for (const [k, v] of Object.entries(p)) {
      if (k === 'areaId') { const r = resolveArea(v); if (r.erro) return r; out.area = r.area.id; }
      else if (k === 'projetoId') { const r = v ? resolveProjeto(v) : { proj: { id: '' } }; if (r.erro) return r; out.project = r.proj.id; }
      else if (_CAMPOS_TAREFA[k]) out[_CAMPOS_TAREFA[k]] = v;
      else return { erro: `Campo "${k}" não existe. Use: ${Object.keys(_CAMPOS_TAREFA).join(', ')}, areaId, projetoId.` };
    }
    return { out };
  }

  function _tarefaDetalhe(t) {
    return {
      ...tarefaResumo(t),
      dataFim: t.dateend || null,
      area: nomeArea(t.area) || null,
      recorrencia: t.recurrence || null,
      estimativa: t.estimate || null,
      tags: t.tags || [],
      notas: t.notes || '',
      habitoVinculado: t.habitId ? (HabitService.getById(t.habitId) || {}).name || null : null,
      subtarefas: (t.subtasks || []).map(s => ({ id: s.id, nome: s.name, feita: !!s.done }))
    };
  }

  function _tarefasPorFiltro(filtro, projetoId, areaId) {
    const hoje = Utils.today();
    if (filtro === 'hoje') return TaskService.forDay(hoje).filter(Utils.isTaskOpen);
    if (filtro === 'semana') return tarefasNoIntervalo(hoje, Utils.addDays(hoje, 6));
    if (filtro === 'pendentes') return TaskService.pending();
    if (filtro === 'atrasadas') return ReviewService.overdueTasks();
    if (filtro === 'concluidas') return TaskService.completed();
    if (filtro === 'projeto') {
      const r = resolveProjeto(projetoId); if (r.erro) return r;
      return TaskService.forProject(r.proj.id).filter(Utils.isTaskOpen);
    }
    if (filtro === 'area') {
      const r = resolveArea(areaId); if (r.erro) return r;
      return TaskService.getAll().filter(t => t.area === r.area.id && Utils.isTaskOpen(t));
    }
    return { erro: 'filtro inválido.' };
  }

  function _habitoResumo(h, hoje) {
    const s = HabitService.stats(h.id);
    const log = HabitService.getLog(h.id, hoje);
    return {
      id: h.id, nome: h.name, icone: h.icon, versaoMinima: h.minVersion || null,
      frequencia: h.frequency, devidoHoje: HabitService.isDueOn(h, hoje),
      hoje: log ? log.status : null, streak: s.streak, escudos: s.shields
    };
  }

  /** Frequência pt-BR do modelo → { type, days } do app (ou { erro }). */
  function _frequencia(frequencia, dias) {
    if (frequencia === undefined) return {};
    const type = FREQUENCIAS[frequencia];
    if (!type) return { erro: 'frequencia deve ser: diaria, dias_uteis ou personalizada.' };
    const days = type === 'custom' ? (dias || []).map(Number).filter(d => d >= 0 && d <= 6) : [];
    if (type === 'custom' && !days.length) return { erro: 'Para frequência personalizada, informe dias (0=Dom … 6=Sáb).' };
    return { frequency: { type, days } };
  }

  function _subtarefaIdx(t, subtarefaId) {
    return (t.subtasks || []).findIndex(s => s.id === subtarefaId || Utils.normalizeText(s.name) === Utils.normalizeText(subtarefaId));
  }

  // ===== Tarefas =====

  const TAREFAS = {

    list_tasks: {
      write: false,
      schema: {
        name: 'list_tasks',
        description: 'Lista tarefas por filtro. Use projetoId com filtro="projeto" e areaId com filtro="area". "atrasadas" = em aberto com data passada.',
        input_schema: {
          type: 'object',
          properties: {
            filtro: { type: 'string', enum: ['hoje', 'semana', 'pendentes', 'atrasadas', 'concluidas', 'projeto', 'area'] },
            projetoId: { type: 'string', description: 'Id ou nome do projeto (filtro=projeto)' },
            areaId: { type: 'string', description: 'Id ou nome da área (filtro=area)' },
            busca: { type: 'string', description: 'Opcional: filtra pelo texto no nome' }
          },
          required: ['filtro']
        }
      },
      run({ filtro, projetoId, areaId, busca }) {
        const r = _tarefasPorFiltro(filtro, projetoId, areaId);
        if (r.erro) return r;
        const tarefas = busca ? r.filter(t => Utils.normalizeText(t.name).includes(Utils.normalizeText(busca))) : r;
        return { total: tarefas.length, tarefas: tarefas.map(tarefaResumo) };
      }
    },

    get_task: {
      write: false,
      schema: {
        name: 'get_task',
        description: 'Detalhes completos de uma tarefa: notas, tags, recorrência, hábito vinculado e subtarefas (com id).',
        input_schema: idSchema
      },
      run({ id }) {
        const t = TaskService.getById(id);
        return t ? _tarefaDetalhe(t) : { erro: 'Tarefa não encontrada.' };
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
        const tarefas = tarefasNoIntervalo(de, ate, true)
          .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
        return { total: tarefas.length, tarefas: tarefas.map(tarefaResumo) };
      }
    },

    create_task: {
      write: true,
      schema: {
        name: 'create_task',
        description: 'Cria uma tarefa.',
        input_schema: {
          type: 'object',
          properties: {
            nome: { type: 'string' },
            data: { type: 'string', description: 'ISO YYYY-MM-DD. Default: hoje. Envie "" para tarefa sem data.' },
            dataFim: { type: 'string', description: 'ISO YYYY-MM-DD, para tarefa de vários dias' },
            inicio: { type: 'string', description: 'Hora início HH:MM' },
            fim: { type: 'string', description: 'Hora fim HH:MM' },
            prioridade: { type: 'string', enum: PRIORIDADES },
            recorrencia: { type: 'string', enum: RECORRENCIAS, description: 'daily | weekly | monthly (ao concluir, cria a próxima)' },
            areaId: { type: 'string', description: 'Id ou nome da área' },
            projetoId: { type: 'string', description: 'Id ou nome do projeto' },
            tags: { type: 'array', items: { type: 'string' } },
            notas: { type: 'string' }
          },
          required: ['nome']
        }
      },
      run(input) {
        if (!input.nome) return { erro: 'Nome da tarefa é obrigatório.' };
        const { data, ...resto } = input;
        const r = _patchTarefa(resto);
        if (r.erro) return r;
        const t = TaskService.create({ ...r.out, date: data === undefined ? Utils.today() : data });
        return { ok: true, id: t.id, nome: t.name, data: t.date || null };
      }
    },

    update_task: {
      write: true,
      schema: {
        name: 'update_task',
        description: 'Edita uma tarefa existente. Em patch use: nome, data, dataFim, inicio, fim, prioridade, status (afazer|emprogresso|concluida|descartada), recorrencia, tags, estimativa, notas, areaId, projetoId. Para só concluir, prefira complete_task.',
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
        const r = _patchTarefa(patch || {});
        if (r.erro) return r;
        const t = TaskService.update(id, r.out);
        return { ok: true, tarefa: _tarefaDetalhe(t) };
      }
    },

    complete_task: {
      write: true,
      schema: {
        name: 'complete_task',
        description: 'Conclui uma tarefa (ou reabre, com reabrir=true). Igual ao app: tarefa recorrente gera a próxima e tarefa vinculada a hábito marca o hábito.',
        input_schema: {
          type: 'object',
          properties: { id: { type: 'string' }, reabrir: { type: 'boolean' } },
          required: ['id']
        }
      },
      run({ id, reabrir }) {
        const t = TaskService.getById(id);
        if (!t) return { erro: 'Tarefa não encontrada.' };
        const antes = TaskService.getAll().length;
        // update() troca o objeto da tarefa: usar o devolvido, não o 't' antigo
        const atualizada = TaskService.update(id, { status: reabrir ? 'afazer' : 'concluida' });
        const proxima = TaskService.getAll().length > antes ? TaskService.getAll().slice(-1)[0] : null;
        return { ok: true, id, nome: atualizada.name, status: atualizada.status, proximaOcorrencia: proxima ? proxima.date : null };
      }
    },

    manage_subtask: {
      write: true,
      schema: {
        name: 'manage_subtask',
        description: 'Gerencia subtarefas de uma tarefa. subtarefa = id ou nome (use get_task para ver).',
        input_schema: {
          type: 'object',
          properties: {
            tarefaId: { type: 'string' },
            acao: { type: 'string', enum: ['adicionar', 'marcar', 'desmarcar', 'renomear', 'remover'] },
            subtarefa: { type: 'string', description: 'Id ou nome da subtarefa (exceto em adicionar)' },
            nome: { type: 'string', description: 'Nome (adicionar/renomear)' }
          },
          required: ['tarefaId', 'acao']
        }
      },
      run({ tarefaId, acao, subtarefa, nome }) {
        const t = TaskService.getById(tarefaId);
        if (!t) return { erro: 'Tarefa não encontrada.' };
        if (acao === 'adicionar') {
          if (!nome) return { erro: 'Informe o nome da subtarefa.' };
          TaskService.addSubtask(tarefaId);
          TaskService.renameSubtask(tarefaId, t.subtasks.length - 1, nome);
          return { ok: true, subtarefas: _tarefaDetalhe(t).subtarefas };
        }
        const idx = _subtarefaIdx(t, subtarefa);
        if (idx < 0) return { erro: `Subtarefa "${subtarefa}" não encontrada.` };
        if (acao === 'renomear') TaskService.renameSubtask(tarefaId, idx, nome || '');
        else if (acao === 'remover') TaskService.removeSubtask(tarefaId, idx);
        else if (!!t.subtasks[idx].done !== (acao === 'marcar')) TaskService.toggleSubtask(tarefaId, idx);
        return { ok: true, subtarefas: _tarefaDetalhe(t).subtarefas };
      }
    },

    delete_task: {
      write: true,
      schema: {
        name: 'delete_task',
        description: 'Exclui uma tarefa de vez. Para só tirar das listas sem apagar, use update_task com status "descartada".',
        input_schema: idSchema
      },
      run({ id }) {
        const t = TaskService.getById(id);
        if (!t) return { erro: 'Tarefa não encontrada.' };
        TaskService.remove(id);
        return { ok: true, id, nome: t.name };
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
    }
  };

  // ===== Projetos e notas =====

  const PROJETOS = {

    list_projects: {
      write: false,
      schema: {
        name: 'list_projects',
        description: 'Lista os projetos com área, status e prazo. Por padrão só os ativos.',
        input_schema: {
          type: 'object',
          properties: { incluirInativos: { type: 'boolean', description: 'Inclui pausados e concluídos' } }
        }
      },
      run({ incluirInativos }) {
        const projetos = ProjectService.getAll()
          .filter(p => incluirInativos || p.status === 'ativo')
          .map(p => ({ id: p.id, nome: p.name, area: nomeArea(p.area), status: p.status, prazo: p.deadline || null }));
        return { total: projetos.length, projetos };
      }
    },

    get_project: {
      write: false,
      schema: {
        name: 'get_project',
        description: 'Detalhes de um projeto: descrição, prazo, notas (id e título) e tarefas em aberto.',
        input_schema: {
          type: 'object',
          properties: { projeto: { type: 'string', description: 'Id ou nome do projeto' } },
          required: ['projeto']
        }
      },
      run({ projeto }) {
        const r = resolveProjeto(projeto); if (r.erro) return r;
        const p = r.proj;
        return {
          id: p.id, nome: p.name, icone: p.icon, area: nomeArea(p.area), status: p.status,
          prazo: p.deadline || null, descricao: p.desc || '',
          notas: (p.notes || []).map(n => ({ id: n.id, titulo: n.title, atualizadaEm: n.updatedAt })),
          tarefasEmAberto: TaskService.forProject(p.id).filter(Utils.isTaskOpen).map(tarefaResumo)
        };
      }
    },

    get_note: {
      write: false,
      schema: {
        name: 'get_note',
        description: 'Conteúdo de uma nota de projeto (HTML do editor).',
        input_schema: {
          type: 'object',
          properties: { projeto: { type: 'string' }, notaId: { type: 'string' } },
          required: ['projeto', 'notaId']
        }
      },
      run({ projeto, notaId }) {
        const r = resolveProjeto(projeto); if (r.erro) return r;
        const n = ProjectService.getNote(r.proj.id, notaId);
        return n ? { id: n.id, titulo: n.title, conteudoHtml: n.content, atualizadaEm: n.updatedAt } : { erro: 'Nota não encontrada.' };
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
            prazo: { type: 'string', description: 'Deadline ISO YYYY-MM-DD' },
            icone: { type: 'string', description: 'Emoji (default 📁)' }
          },
          required: ['nome', 'areaId']
        }
      },
      run({ nome, areaId, descricao, prazo, icone }) {
        const r = resolveArea(areaId); if (r.erro) return r;
        // ProjectService.save não dá default a color: herda a cor da área (com
        // fallback) para não gravar undefined, que o Firestore rejeita.
        const p = ProjectService.save({
          name: nome, area: r.area.id, desc: descricao || '', deadline: prazo || '',
          color: r.area.color || Constants.COLORS[0], icon: icone || '📁'
        });
        return { ok: true, id: p.id, nome: p.name, area: r.area.name };
      }
    },

    update_project: {
      write: true,
      schema: {
        name: 'update_project',
        description: 'Edita um projeto. Envie só o que muda.',
        input_schema: {
          type: 'object',
          properties: {
            projeto: { type: 'string', description: 'Id ou nome do projeto' },
            nome: { type: 'string' },
            status: { type: 'string', enum: STATUS_PROJETO },
            descricao: { type: 'string' },
            prazo: { type: 'string', description: 'ISO YYYY-MM-DD ("" remove)' },
            areaId: { type: 'string', description: 'Id ou nome da nova área' },
            icone: { type: 'string' }
          },
          required: ['projeto']
        }
      },
      run({ projeto, nome, status, descricao, prazo, areaId, icone }) {
        const r = resolveProjeto(projeto); if (r.erro) return r;
        if (status !== undefined && !STATUS_PROJETO.includes(status)) return { erro: `status deve ser: ${STATUS_PROJETO.join(', ')}.` };
        let area = r.proj.area;
        if (areaId) { const ra = resolveArea(areaId); if (ra.erro) return ra; area = ra.area.id; }
        const p = ProjectService.save({
          ...r.proj, area,
          name: nome !== undefined ? nome : r.proj.name,
          status: status || r.proj.status,
          desc: descricao !== undefined ? descricao : r.proj.desc,
          deadline: prazo !== undefined ? prazo : r.proj.deadline,
          icon: icone || r.proj.icon
        }, true);
        return { ok: true, id: p.id, nome: p.name, status: p.status, area: nomeArea(p.area), prazo: p.deadline || null };
      }
    },

    delete_project: {
      write: true,
      schema: {
        name: 'delete_project',
        description: 'Exclui um projeto e TODAS as notas dele. As tarefas continuam, sem projeto. Confirme com o usuário antes.',
        input_schema: {
          type: 'object',
          properties: { projeto: { type: 'string', description: 'Id ou nome do projeto' } },
          required: ['projeto']
        }
      },
      run({ projeto }) {
        const r = resolveProjeto(projeto); if (r.erro) return r;
        const notas = (r.proj.notes || []).length;
        ProjectService.remove(r.proj.id);
        return { ok: true, excluido: r.proj.name, notasExcluidas: notas };
      }
    },

    create_note: {
      write: true,
      schema: {
        name: 'create_note',
        description: 'Cria uma nota dentro de um projeto. conteudo pode ser texto (quebras de linha viram parágrafos) ou HTML.',
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
        const n = ProjectService.addNote(r.proj.id, { title: titulo, content: _textoParaHtml(conteudo) });
        return { ok: true, id: n.id, projeto: r.proj.name, titulo: n.title };
      }
    },

    update_note: {
      write: true,
      schema: {
        name: 'update_note',
        description: 'Edita título e/ou conteúdo de uma nota. O conteúdo SUBSTITUI o atual: para acrescentar, leia com get_note e envie o HTML completo (preserve as tags <img> existentes).',
        input_schema: {
          type: 'object',
          properties: {
            projeto: { type: 'string' },
            notaId: { type: 'string' },
            titulo: { type: 'string' },
            conteudo: { type: 'string' }
          },
          required: ['projeto', 'notaId']
        }
      },
      run({ projeto, notaId, titulo, conteudo }) {
        const r = resolveProjeto(projeto); if (r.erro) return r;
        const n = ProjectService.getNote(r.proj.id, notaId);
        if (!n) return { erro: 'Nota não encontrada.' };
        ProjectService.updateNote(r.proj.id, notaId, {
          title: titulo !== undefined ? titulo : n.title,
          content: conteudo !== undefined ? _textoParaHtml(conteudo) : n.content
        });
        return { ok: true, id: notaId, titulo: n.title };
      }
    },

    delete_note: {
      write: true,
      schema: {
        name: 'delete_note',
        description: 'Exclui uma nota de projeto.',
        input_schema: {
          type: 'object',
          properties: { projeto: { type: 'string' }, notaId: { type: 'string' } },
          required: ['projeto', 'notaId']
        }
      },
      run({ projeto, notaId }) {
        const r = resolveProjeto(projeto); if (r.erro) return r;
        const n = ProjectService.getNote(r.proj.id, notaId);
        if (!n) return { erro: 'Nota não encontrada.' };
        ProjectService.removeNote(r.proj.id, notaId);
        return { ok: true, excluida: n.title };
      }
    }
  };

  // ===== Áreas =====

  const AREAS = {

    list_areas: {
      write: false,
      schema: {
        name: 'list_areas',
        description: 'Lista as áreas (categorias de vida) com id, nome e ícone.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        return { areas: AreaService.getAll().map(a => ({ id: a.id, nome: a.name, icone: a.icon, cor: a.color })) };
      }
    },

    manage_area: {
      write: true,
      schema: {
        name: 'manage_area',
        description: 'Cria, edita ou exclui uma área. Só exclui área sem projetos nem tarefas em aberto.',
        input_schema: {
          type: 'object',
          properties: {
            acao: { type: 'string', enum: ['criar', 'editar', 'excluir'] },
            area: { type: 'string', description: 'Id ou nome da área (editar/excluir)' },
            nome: { type: 'string' },
            icone: { type: 'string', description: 'Emoji' },
            cor: { type: 'string', description: `Hex, ex.: ${Constants.COLORS[0]}` }
          },
          required: ['acao']
        }
      },
      run({ acao, area, nome, icone, cor }) {
        if (acao === 'criar') {
          if (!nome) return { erro: 'Informe o nome da área.' };
          const a = AreaService.create({ name: nome, icon: icone || '📌', color: cor || Constants.COLORS[0] });
          return { ok: true, id: a.id, nome: a.name };
        }
        const r = resolveArea(area); if (r.erro) return r;
        if (acao === 'editar') {
          const patch = {};
          if (nome) patch.name = nome;
          if (icone) patch.icon = icone;
          if (cor) patch.color = cor;
          const a = AreaService.update(r.area.id, patch);
          return { ok: true, id: a.id, nome: a.name };
        }
        const emUso = ProjectService.getAll().some(p => p.area === r.area.id)
          || TaskService.pending().some(t => t.area === r.area.id);
        if (emUso) return { erro: `A área "${r.area.name}" tem projetos ou tarefas em aberto. Mova-os antes de excluir.` };
        AreaService.remove(r.area.id);
        return { ok: true, excluida: r.area.name };
      }
    }
  };

  // ===== Hábitos =====

  const HABITOS = {

    list_habits: {
      write: false,
      schema: {
        name: 'list_habits',
        description: 'Lista os hábitos com frequência, se é devido hoje, o registro de hoje (done/minimal/shielded), sequência (streak) e escudos.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        const hoje = Utils.today();
        return { data: hoje, habitos: HabitService.getAll().map(h => _habitoResumo(h, hoje)) };
      }
    },

    log_habit: {
      write: true,
      schema: {
        name: 'log_habit',
        description: 'Marca um hábito num dia: "feito", "minimo" (versão mínima) ou "desmarcar".',
        input_schema: {
          type: 'object',
          properties: {
            habito: { type: 'string', description: 'Id ou nome do hábito' },
            status: { type: 'string', enum: ['feito', 'minimo', 'desmarcar'] },
            data: { type: 'string', description: 'ISO YYYY-MM-DD. Default: hoje.' }
          },
          required: ['habito', 'status']
        }
      },
      run({ habito, status, data }) {
        const r = resolveHabito(habito); if (r.erro) return r;
        const dia = data || Utils.today();
        const log = HabitService.getLog(r.habit.id, dia);
        if (status === 'desmarcar') {
          if (log) HabitService.toggle(r.habit.id, dia, '');
        } else {
          if (!STATUS_HABITO[status]) return { erro: 'status deve ser: feito, minimo ou desmarcar.' };
          // toggle() com o MESMO status desmarca: só chama se for mudar
          if (!log || log.status !== STATUS_HABITO[status]) HabitService.toggle(r.habit.id, dia, STATUS_HABITO[status]);
        }
        return { ok: true, habito: r.habit.name, data: dia, streak: HabitService.stats(r.habit.id).streak };
      }
    },

    manage_habit: {
      write: true,
      schema: {
        name: 'manage_habit',
        description: 'Cria, edita ou arquiva um hábito (arquivar preserva o histórico).',
        input_schema: {
          type: 'object',
          properties: {
            acao: { type: 'string', enum: ['criar', 'editar', 'arquivar'] },
            habito: { type: 'string', description: 'Id ou nome (editar/arquivar)' },
            nome: { type: 'string' },
            icone: { type: 'string', description: 'Emoji' },
            frequencia: { type: 'string', enum: Object.keys(FREQUENCIAS) },
            dias: { type: 'array', items: { type: 'number' }, description: 'Para personalizada: 0=Dom … 6=Sáb' },
            versaoMinima: { type: 'string', description: 'Versão mínima do hábito (ex.: "1 flexão")' }
          },
          required: ['acao']
        }
      },
      run({ acao, habito, nome, icone, frequencia, dias, versaoMinima }) {
        const freq = _frequencia(frequencia, dias);
        if (freq.erro) return freq;
        if (acao === 'criar') {
          if (!nome) return { erro: 'Informe o nome do hábito.' };
          const h = HabitService.create({ name: nome, icon: icone, frequency: freq.frequency, minVersion: versaoMinima || '' });
          return { ok: true, id: h.id, nome: h.name };
        }
        const r = resolveHabito(habito); if (r.erro) return r;
        if (acao === 'arquivar') { HabitService.archive(r.habit.id); return { ok: true, arquivado: r.habit.name }; }
        const patch = { ...freq };
        if (nome) patch.name = nome;
        if (icone) patch.icon = icone;
        if (versaoMinima !== undefined) patch.minVersion = versaoMinima;
        const h = HabitService.update(r.habit.id, patch);
        return { ok: true, id: h.id, nome: h.name, frequencia: h.frequency };
      }
    },

    set_hard_day: {
      write: true,
      schema: {
        name: 'set_hard_day',
        description: 'Liga ou desliga o "modo dia difícil" num dia (mostra só o essencial).',
        input_schema: {
          type: 'object',
          properties: {
            ligado: { type: 'boolean' },
            data: { type: 'string', description: 'ISO YYYY-MM-DD. Default: hoje.' }
          },
          required: ['ligado']
        }
      },
      run({ ligado, data }) {
        const dia = data || Utils.today();
        if (HabitService.isHardDay(dia) !== !!ligado) HabitService.toggleHardDay(dia);
        return { ok: true, data: dia, modoDiaDificil: !!ligado };
      }
    }
  };

  // ===== Inbox e revisão semanal =====

  const INBOX_REVISAO = {

    list_inbox: {
      write: false,
      schema: {
        name: 'list_inbox',
        description: 'Lista os itens da caixa de entrada (capturas ainda não processadas). Para processar: crie a tarefa/nota e remova o item com manage_inbox.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        const itens = InboxService.getAll().map(i => ({ id: i.id, texto: i.text, capturadoEm: Utils.toISO(new Date(i.createdAt)) }));
        return { total: itens.length, itens };
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

    manage_inbox: {
      write: true,
      schema: {
        name: 'manage_inbox',
        description: 'Edita o texto de um item da inbox ou remove o item (ex.: depois de virar tarefa).',
        input_schema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            acao: { type: 'string', enum: ['editar', 'remover'] },
            texto: { type: 'string', description: 'Novo texto (editar)' }
          },
          required: ['id', 'acao']
        }
      },
      run({ id, acao, texto }) {
        const item = InboxService.getById(id);
        if (!item) return { erro: 'Item da inbox não encontrado.' };
        if (acao === 'remover') { InboxService.remove(id); return { ok: true, removido: item.text }; }
        if (!texto) return { erro: 'Informe o novo texto.' };
        InboxService.update(id, texto);
        return { ok: true, id, texto: item.text };
      }
    },

    get_weekly_review: {
      write: false,
      schema: {
        name: 'get_weekly_review',
        description: 'Dados da revisão semanal: metas desta semana e da próxima, números da semana, tarefas atrasadas, projetos parados e dias desde a última revisão.',
        input_schema: { type: 'object', properties: {} }
      },
      run() {
        const atual = ReviewService.currentWeekStart();
        const proxima = ReviewService.nextWeekStart();
        const goals = ws => (ReviewService.getWeeklyGoals(ws) || { goals: [] }).goals;
        const st = ReviewService.weekStats(atual);
        const dias = ReviewService.daysSinceLastReview();
        return {
          semanaAtual: { inicio: atual, metas: goals(atual) },
          proximaSemana: { inicio: proxima, metas: goals(proxima) },
          semana: { tarefasConcluidas: st.completedTasks, habitosPct: st.habitRate, saldo: Utils.formatBRL(st.saldo) },
          tarefasAtrasadas: ReviewService.overdueTasks().length,
          projetosParados: ReviewService.stalledProjects().map(p => p.name),
          diasDesdeUltimaRevisao: Number.isFinite(dias) ? dias : null
        };
      }
    },

    set_weekly_goals: {
      write: true,
      schema: {
        name: 'set_weekly_goals',
        description: `Define as metas ("as ${Constants.REVIEW.GOALS_MAX} grandes") da semana atual ou da próxima. Substitui as metas existentes da semana.`,
        input_schema: {
          type: 'object',
          properties: {
            semana: { type: 'string', enum: ['atual', 'proxima'] },
            metas: { type: 'array', items: { type: 'string' }, description: `Até ${Constants.REVIEW.GOALS_MAX}` }
          },
          required: ['semana', 'metas']
        }
      },
      run({ semana, metas }) {
        const ws = semana === 'proxima' ? ReviewService.nextWeekStart() : ReviewService.currentWeekStart();
        ReviewService.saveWeeklyGoals(ws, metas);
        return { ok: true, semanaInicio: ws, metas: ReviewService.getWeeklyGoals(ws).goals };
      }
    }
  };

  AiTools.register({ ...TAREFAS, ...PROJETOS, ...AREAS, ...HABITOS, ...INBOX_REVISAO });
})();
