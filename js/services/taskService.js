/**
 * ===================== TASK SERVICE =====================
 * Domain logic for tasks. Knows nothing about the DOM.
 * UI layer calls these methods, then re-renders.
 */

const TaskService = (() => {

  function getAll() {
    return AppState.getDB().tasks;
  }

  function getById(id) {
    return AppState.getDB().tasks.find(t => t.id === id);
  }

  function create(taskData) {
    const task = buildTask(taskData);
    AppState.getDB().tasks.push(task);
    AppState.persist();
    return task;
  }

  function update(id, patch) {
    const tasks = AppState.getDB().tasks;
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    const wasDone = tasks[idx].status === 'concluida';
    tasks[idx] = { ...tasks[idx], ...patch };
    // Concluir pelo modal (status no formulário) também agenda a recorrência
    if (!wasDone && tasks[idx].status === 'concluida' && tasks[idx].recurrence) {
      tasks.push(buildNextRecurrence(tasks[idx]));
    }
    AppState.persist();
    return tasks[idx];
  }

  function updateField(id, field, value) {
    const t = getById(id);
    if (!t) return;
    const wasDone = t.status === 'concluida';
    t[field] = value;
    if (field === 'status' && !wasDone && value === 'concluida' && t.recurrence) {
      AppState.getDB().tasks.push(buildNextRecurrence(t));
    }
    AppState.persist();
  }

  function remove(id) {
    AppState.getDB().tasks = AppState.getDB().tasks.filter(t => t.id !== id);
    AppState.persist();
  }

  /** Toggle status; if completing a recurring task, schedule the next instance */
  function toggle(id) {
    const t = getById(id);
    if (!t) return;
    t.status = (t.status === 'concluida') ? 'afazer' : 'concluida';
    if (t.status === 'concluida' && t.recurrence) {
      AppState.getDB().tasks.push(buildNextRecurrence(t));
    }
    AppState.persist();
  }

  /** Cycle priority through 4 levels */
  function cyclePriority(id) {
    const t = getById(id);
    if (!t) return;
    const cycle = Constants.PRI_CYCLE;
    t.priority = cycle[(cycle.indexOf(t.priority) + 1) % cycle.length];
    AppState.persist();
  }

  function duplicate(id) {
    const orig = getById(id);
    if (!orig) return null;
    const copy = {
      ...orig,
      id: Utils.uid(),
      name: 'Cópia — ' + orig.name,
      status: 'afazer',
      subtasks: []
    };
    AppState.getDB().tasks.push(copy);
    AppState.persist();
    return copy;
  }

  // ===== Subtasks =====

  function addSubtask(taskId) {
    const t = getById(taskId);
    if (!t) return;
    t.subtasks = [...(t.subtasks || []), {
      id: Utils.uid(),
      name: 'Nova subtarefa',
      done: false
    }];
    AppState.persist();
  }

  function toggleSubtask(taskId, idx) {
    const t = getById(taskId);
    if (!t || !t.subtasks?.[idx]) return;
    t.subtasks[idx].done = !t.subtasks[idx].done;
    AppState.persist();
  }

  function renameSubtask(taskId, idx, name) {
    const t = getById(taskId);
    if (!t || !t.subtasks?.[idx]) return;
    t.subtasks[idx].name = name;
    AppState.persist();
  }

  function removeSubtask(taskId, idx) {
    const t = getById(taskId);
    if (!t || !t.subtasks) return;
    t.subtasks.splice(idx, 1);
    AppState.persist();
  }

  // ===== Tags =====

  function addTag(taskId, tag) {
    const t = getById(taskId);
    if (!t) return;
    t.tags = [...(t.tags || []), tag];
    AppState.persist();
  }

  function removeTag(taskId, idx) {
    const t = getById(taskId);
    if (!t || !t.tags) return;
    t.tags.splice(idx, 1);
    AppState.persist();
  }

  // ===== Filtering / querying =====

  /** Returns pending (non-completed) tasks */
  function pending() {
    return getAll().filter(t => t.status !== 'concluida');
  }

  /** Returns completed tasks */
  function completed() {
    return getAll().filter(t => t.status === 'concluida');
  }

  function forDay(isoDate) {
    return getAll().filter(t => Utils.taskCoversDay(t, isoDate));
  }

  function forProject(projectId) {
    return getAll().filter(t => t.project === projectId);
  }

  // ===== Internal builders =====

  function buildTask(data) {
    return {
      id: data.id || Utils.uid(),
      name: data.name || '',
      area: data.area || '',
      project: data.project || '',
      priority: data.priority || 'nenhuma',
      status: data.status || 'afazer',
      date: data.date || '',
      dateend: data.dateend || '',
      start: data.start || '',
      end: data.end || '',
      duration: data.duration || '',
      recurrence: data.recurrence || '',
      estimate: data.estimate || '',
      tags: data.tags || [],
      notes: data.notes || '',
      subtasks: data.subtasks || []
    };
  }

  function buildNextRecurrence(task) {
    const next = { ...task, id: Utils.uid(), status: 'afazer' };
    if (task.recurrence === 'daily') {
      next.date = Utils.addDays(task.date, 1);
    } else if (task.recurrence === 'weekly') {
      next.date = Utils.addDays(task.date, 7);
    } else if (task.recurrence === 'monthly') {
      const d = Utils.parseISO(task.date);
      d.setMonth(d.getMonth() + 1);
      next.date = Utils.toISO(d);
    }
    // Tarefa multi-dia: desloca a data fim mantendo a mesma duração
    if (task.dateend && task.date) {
      const spanDays = Utils.daysBetween(task.date, task.dateend) - 1;
      next.dateend = spanDays > 0 ? Utils.addDays(next.date, spanDays) : '';
    }
    return next;
  }

  return {
    getAll, getById, create, update, updateField, remove, toggle,
    cyclePriority, duplicate,
    addSubtask, toggleSubtask, renameSubtask, removeSubtask,
    addTag, removeTag,
    pending, completed, forDay, forProject
  };
})();
