/* popup.js - folder-aware UI + import/export + auto-date tokens (fixed edit flow, emoji buttons) */

const groupedList = document.getElementById('groupedList');
const savePromptBtn = document.getElementById('savePrompt');
const newPrompt = document.getElementById('newPrompt');
const newTitle = document.getElementById('newTitle');
const newFolder = document.getElementById('newFolder');
const exportPrompts = document.getElementById('exportPrompts');
const importPrompts = document.getElementById('importPrompts');
const importFile = document.getElementById('importFile');
const folderSuggestions = document.getElementById('folderSuggestions');

const DEFAULT_FOLDER = 'Ungrouped';

let editingIndex = null;   // null means "creating", number means "editing existing"

const normalizeFolder = (f) => {
  const v = (f || '').trim();
  if (!v) return DEFAULT_FOLDER;
  if (v.toLowerCase() === 'ungrouped') return DEFAULT_FOLDER;
  return v;
};

function normalizePrompt(p) {
  return {
    title: (p.title || '').trim(),
    prompt: (p.prompt || ''),
    folder: normalizeFolder(p.folder)
  };
}

function groupByFolder(prompts) {
  const groups = {};
  prompts.forEach(p => {
    const g = normalizeFolder(p.folder);
    if (!groups[g]) groups[g] = [];
    groups[g].push(p);
  });
  Object.keys(groups).forEach(k => groups[k].sort((a,b)=>a.title.localeCompare(b.title)));
  return groups;
}

function refreshFolderSuggestions(prompts) {
  const set = new Set(prompts.map(p => normalizeFolder(p.folder)));
  set.add(DEFAULT_FOLDER);
  folderSuggestions.innerHTML = '';
  Array.from(set).sort((a,b)=>a.localeCompare(b)).forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    folderSuggestions.appendChild(opt);
  });
}

function renderPrompts(prompts) {
  groupedList.innerHTML = '';
  const groups = groupByFolder(prompts);
  const sortedFolders = Object.keys(groups).sort((a,b)=>a.localeCompare(b));

  sortedFolders.forEach(folder => {
    const section = document.createElement('section');
    section.className = 'folder-section';
    const header = document.createElement('h2');
    header.className = 'folder-header';
    header.textContent = folder;
    section.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'prompt-list';
    groups[folder].forEach((p) => {
      const li = document.createElement('li');
      li.className = 'prompt-row';

      const title = document.createElement('span');
      title.className = 'prompt-title';
      title.textContent = p.title || '(untitled)';
      li.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'row-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'edit';
      editBtn.title = 'Edit prompt';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', () => startEdit(p));

      const delBtn = document.createElement('button');
      delBtn.className = 'delete';
      delBtn.title = 'Delete prompt';
      delBtn.textContent = '❌';
      delBtn.addEventListener('click', () => deletePrompt(p));

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      li.appendChild(actions);
      ul.appendChild(li);
    });

    section.appendChild(ul);
    groupedList.appendChild(section);
  });

  refreshFolderSuggestions(prompts);
}

function loadPrompts() {
  chrome.storage.local.get({ prompts: [] }, (data) => {
    const list = (Array.isArray(data.prompts) ? data.prompts : []).map(normalizePrompt);
    renderPrompts(list);
  });
}

function savePrompts(list) {
  const normalized = list.map(normalizePrompt);
  chrome.storage.local.set({ prompts: normalized }, () => {
    renderPrompts(normalized);
    chrome.runtime.sendMessage({ type: 'updatePrompts', prompts: normalized });
  });
}

function handleSaveClick(e) {
  e.preventDefault();
  const title = newTitle.value.trim();
  const folder = normalizeFolder(newFolder.value);
  const prompt = newPrompt.value;
  if (!title) {
    alert('Please enter a title.');
    return;
  }

  chrome.storage.local.get({ prompts: [] }, (data) => {
    const list = Array.isArray(data.prompts) ? data.prompts : [];

    if (editingIndex === null) {
      // Create new
      list.push({ title, prompt, folder });
    } else {
      // Update existing
      list[editingIndex] = { title, prompt, folder };
    }
    savePrompts(list);
    resetForm();
  });
}

function resetForm() {
  editingIndex = null;
  newTitle.value = '';
  newFolder.value = '';
  newPrompt.value = '';
  savePromptBtn.textContent = 'Save Prompt';
}

function startEdit(p) {
  chrome.storage.local.get({ prompts: [] }, (data) => {
    const list = Array.isArray(data.prompts) ? data.prompts : [];
    const idx = list.findIndex(x =>
      (x.title || '') === (p.title || '') &&
      (x.prompt || '') === (p.prompt || '') &&
      normalizeFolder(x.folder) === normalizeFolder(p.folder)
    );
    if (idx < 0) return;

    editingIndex = idx;
    newTitle.value = p.title || '';
    newFolder.value = normalizeFolder(p.folder);
    newPrompt.value = p.prompt || '';
    savePromptBtn.textContent = 'Update Prompt';
    refreshFolderSuggestions(list.map(normalizePrompt)); // ensure folders dropdown is fresh while editing
  });
}

function deletePrompt(p) {
  if (!confirm(`Delete "${p.title}"?`)) return;
  chrome.storage.local.get({ prompts: [] }, (data) => {
    let list = Array.isArray(data.prompts) ? data.prompts : [];
    const idx = list.findIndex(x =>
      (x.title || '') === (p.title || '') &&
      (x.prompt || '') === (p.prompt || '') &&
      normalizeFolder(x.folder) === normalizeFolder(p.folder)
    );
    if (idx >= 0) {
      list.splice(idx, 1);
      savePrompts(list);
    }
    if (editingIndex === idx) resetForm();
  });
}

savePromptBtn.addEventListener('click', handleSaveClick);

exportPrompts.addEventListener('click', () => {
  chrome.storage.local.get({ prompts: [] }, (data) => {
    const out = (Array.isArray(data.prompts) ? data.prompts : []).map(normalizePrompt);
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompts.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});

importPrompts.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      if (!Array.isArray(json)) throw new Error('Invalid JSON format.');
      const list = json.map(normalizePrompt);
      savePrompts(list);
      importFile.value = '';
      resetForm();
    } catch (e) {
      alert('Invalid JSON file.');
    }
  };
  reader.readAsText(file);
});

document.addEventListener('DOMContentLoaded', () => {
  const versionElement = document.getElementById('appVersion');
  const manifestData = chrome.runtime.getManifest();
  versionElement.textContent = `v${manifestData.version}`;
});

loadPrompts();
