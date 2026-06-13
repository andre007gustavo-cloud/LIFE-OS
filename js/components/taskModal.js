/**
 * ===================== TASK MODAL =====================
 * Legacy full-form task modal (used by calendar/dashboard).
 * The TickTick layout uses quick-add + detail panel instead.
 */

const TaskModal = (() => {

  function open(taskId) {
    AppState.ui.editTaskId = taskId || null;
    const task = taskId ? TaskService.getById(taskId) : {};

    document.getElementById('task-modal-title').textContent =
      taskId ? 'Editar Tarefa' : 'Nova Tarefa';

    populateHabitSelect();
    fillFields(task);
    populateAreaSelect('t-area', task.area);

    setTimeout(() => {
      updateProjectSelect();
      if (task.project) document.getElementById('t-project').value = task.project;
    }, 50);

    updateTimeFieldsVisibility();
    wireTimeCalculation();

    Modal.open('task-modal');
  }

  /** Abre uma tarefa nova já vinculada ao hábito (nome, recorrência espelhada, habitId) */
  function openForHabit(habit) {
    open();
    document.getElementById('t-name').value = habit.name;
    document.getElementById('t-date').value = Utils.today();
    document.getElementById('t-recurrence').value = freqToRecurrence(habit.frequency);
    document.getElementById('t-habit').value = habit.id;
  }

  /** Frequência do hábito → recorrência de tarefa (a tarefa só tem diária/semanal/mensal) */
  function freqToRecurrence(freq) {
    if (!freq || freq.type === 'daily' || freq.type === 'weekdays') return 'daily';
    return 'weekly';
  }

  function save() {
    const name = document.getElementById('t-name').value.trim();
    if (!name) return alert('Nome é obrigatório');

    const dateend = document.getElementById('t-dateend').value;
    const datestart = document.getElementById('t-date').value;
    if (dateend && datestart && dateend < datestart) {
      return alert('Data fim não pode ser anterior à data início');
    }
    if (dateend && !datestart) {
      return alert('Defina uma data início antes de definir data fim');
    }

    const data = collectFormData();
    const editId = AppState.ui.editTaskId;

    if (editId) {
      const existing = TaskService.getById(editId);
      TaskService.update(editId, { ...data, subtasks: existing?.subtasks || [] });
    } else {
      TaskService.create(data);
    }

    Modal.close('task-modal');
    Navigation.renderAll();
  }

  function updateProjectSelect() {
    const area = AreaService.getById(document.getElementById('t-area').value);
    document.getElementById('t-project').innerHTML =
      '<option value="">Nenhum</option>' +
      (area ? area.projects : [])
        .map(p => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`)
        .join('');
  }

  // ===== Internal =====

  function populateHabitSelect() {
    document.getElementById('t-habit').innerHTML =
      '<option value="">Nenhum</option>' +
      HabitService.getAll()
        .map(h => `<option value="${h.id}">${Utils.escapeHtml(h.icon)} ${Utils.escapeHtml(h.name)}</option>`)
        .join('');
  }

  function fillFields(task) {
    document.getElementById('t-name').value = task.name || '';
    document.getElementById('t-habit').value = task.habitId || '';
    document.getElementById('t-priority').value = task.priority || 'media';
    document.getElementById('t-status').value = task.status || 'afazer';
    document.getElementById('t-date').value = task.date || '';
    document.getElementById('t-dateend').value = task.dateend || '';
    document.getElementById('t-start').value = task.start || '';
    document.getElementById('t-end').value = task.end || '';
    document.getElementById('t-duration').value = task.duration || '';
    document.getElementById('t-recurrence').value = task.recurrence || '';
    document.getElementById('t-estimate').value = task.estimate || '';
    document.getElementById('t-tags').value = (task.tags || []).join(', ');
    document.getElementById('t-notes').value = task.notes || '';
  }

  function collectFormData() {
    const dateend = document.getElementById('t-dateend').value;
    const isMulti = !!dateend;
    return {
      name: document.getElementById('t-name').value.trim(),
      area: document.getElementById('t-area').value,
      project: document.getElementById('t-project').value,
      priority: document.getElementById('t-priority').value,
      status: document.getElementById('t-status').value,
      date: document.getElementById('t-date').value,
      dateend,
      start: isMulti ? '' : document.getElementById('t-start').value,
      end: isMulti ? '' : document.getElementById('t-end').value,
      duration: isMulti ? '' : document.getElementById('t-duration').value,
      recurrence: document.getElementById('t-recurrence').value,
      estimate: document.getElementById('t-estimate').value,
      habitId: document.getElementById('t-habit').value || null,
      tags: document.getElementById('t-tags').value
        .split(',').map(x => x.trim()).filter(Boolean),
      notes: document.getElementById('t-notes').value
    };
  }

  function populateAreaSelect(selectId, selectedAreaId) {
    document.getElementById(selectId).innerHTML =
      '<option value="">Nenhuma</option>' +
      AreaService.getAll()
        .map(a => `<option value="${a.id}"${a.id === selectedAreaId ? ' selected' : ''}>${Utils.escapeHtml(a.icon)} ${Utils.escapeHtml(a.name)}</option>`)
        .join('');
  }

  function updateTimeFieldsVisibility() {
    const tf = document.getElementById('t-time-fields');
    if (tf) tf.style.display =
      document.getElementById('t-dateend').value ? 'none' : 'block';
  }

  function calcDuration() {
    const s = document.getElementById('t-start').value;
    const e = document.getElementById('t-end').value;
    if (s && e) {
      const sm = Utils.timeToMins(s);
      const em = Utils.timeToMins(e);
      const diff = em - sm;
      if (diff > 0) {
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        document.getElementById('t-duration').value =
          (hours ? hours + 'h ' : '') + (mins ? mins + 'min' : '');
        return;
      }
    }
    document.getElementById('t-duration').value = '';
  }

  function wireTimeCalculation() {
    document.getElementById('t-dateend').onchange = updateTimeFieldsVisibility;
    document.getElementById('t-start').onchange = calcDuration;
    document.getElementById('t-end').onchange = calcDuration;
  }

  return { open, openForHabit, save, updateProjectSelect, populateAreaSelect };
})();
