/**
 * ===================== PROJECT SERVICE =====================
 * Top-level projects (separate from area.projects legacy).
 * Each project has: name, icon, color, area, status, deadline, desc,
 *                   notes[], files[], createdAt.
 *
 * On boot we migrate old area.projects → DB.projects for compatibility.
 */

const ProjectService = (() => {

  /** Ensure DB.projects exists and migrate legacy area.projects into it */
  function ensureMigrated() {
    const db = AppState.getDB();
    if (!db.projects) db.projects = [];
    db.areas.forEach(area => {
      (area.projects || []).forEach(p => {
        if (!db.projects.find(x => x.id === p.id)) {
          db.projects.push({
            id: p.id,
            name: p.name,
            icon: '📁',
            color: area.color,
            area: area.id,
            status: p.status || 'ativo',
            desc: p.desc || '',
            deadline: '',
            notes: [],
            files: [],
            createdAt: Utils.today()
          });
        }
      });
    });
    AppState.persist();
  }

  function getAll() {
    ensureMigrated();
    return AppState.getDB().projects;
  }

  function getById(id) {
    ensureMigrated();
    return AppState.getDB().projects.find(p => p.id === id);
  }

  function search(query) {
    if (!query) return getAll();
    const q = query.toLowerCase();
    return getAll().filter(p => p.name.toLowerCase().includes(q));
  }

  function save(projectData, isEdit = false) {
    ensureMigrated();
    const db = AppState.getDB();
    const existing = isEdit ? getById(projectData.id) : null;
    const project = buildProject(projectData, existing);

    if (isEdit) {
      const idx = db.projects.findIndex(x => x.id === project.id);
      if (idx !== -1) db.projects[idx] = project;
    } else {
      db.projects.push(project);
    }

    syncToAreaProjects(project);
    AppState.persist();
    return project;
  }

  function remove(id) {
    const db = AppState.getDB();
    db.projects = db.projects.filter(p => p.id !== id);
    db.areas.forEach(a => {
      if (a.projects) a.projects = a.projects.filter(p => p.id !== id);
    });
    AppState.persist();
  }

  function updateField(id, field, value) {
    const p = getById(id);
    if (!p) return;
    p[field] = value;
    AppState.persist();
  }

  // ===== Notes within a project =====

  function addNote(projectId, { title, content }) {
    const p = getById(projectId);
    if (!p) return null;
    if (!p.notes) p.notes = [];
    const note = {
      id: Utils.uid(),
      title: title || 'Sem título',
      content: content || '',
      createdAt: Utils.today(),
      updatedAt: Utils.today()
    };
    p.notes.push(note);
    AppState.persist();
    return note;
  }

  function updateNote(projectId, noteId, { title, content }) {
    const p = getById(projectId);
    if (!p) return;
    const note = (p.notes || []).find(n => n.id === noteId);
    if (!note) return;
    note.title = title || 'Sem título';
    note.content = content;
    note.updatedAt = Utils.today();
    AppState.persist();
  }

  function removeNote(projectId, noteId) {
    const p = getById(projectId);
    if (!p) return;
    p.notes = (p.notes || []).filter(n => n.id !== noteId);
    AppState.persist();
  }

  function getNote(projectId, noteId) {
    const p = getById(projectId);
    if (!p) return null;
    return (p.notes || []).find(n => n.id === noteId);
  }

  // ===== Files within a project =====

  function addFile(projectId, { name, size, type, dataUrl }) {
    const p = getById(projectId);
    if (!p) return null;
    if (!p.files) p.files = [];
    const file = {
      id: Utils.uid(),
      name,
      size,
      type,
      data: dataUrl,
      addedAt: Utils.today()
    };
    p.files.push(file);
    AppState.persist();
    return file;
  }

  function removeFile(projectId, fileId) {
    const p = getById(projectId);
    if (!p) return;
    p.files = (p.files || []).filter(f => f.id !== fileId);
    AppState.persist();
  }

  function getFile(projectId, fileId) {
    const p = getById(projectId);
    if (!p) return null;
    return (p.files || []).find(f => f.id === fileId);
  }

  // ===== Internal =====

  function buildProject(data, existing) {
    return {
      id: data.id || Utils.uid(),
      name: data.name,
      icon: data.icon || '📁',
      color: data.color,
      area: data.area,
      status: data.status || 'ativo',
      deadline: data.deadline || '',
      desc: data.desc || '',
      notes: existing?.notes || [],
      files: existing?.files || [],
      createdAt: existing?.createdAt || Utils.today()
    };
  }

  /** Keep area.projects in sync so the task selector still works */
  function syncToAreaProjects(project) {
    const area = AreaService.getById(project.area);
    if (!area) return;
    if (!area.projects) area.projects = [];
    const existing = area.projects.find(p => p.id === project.id);
    if (existing) {
      existing.name = project.name;
    } else {
      area.projects.push({
        id: project.id,
        name: project.name,
        status: project.status,
        desc: project.desc
      });
    }
  }

  return {
    ensureMigrated,
    getAll, getById, search, save, remove, updateField,
    addNote, updateNote, removeNote, getNote,
    addFile, removeFile, getFile
  };
})();
