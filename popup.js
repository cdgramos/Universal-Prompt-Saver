/* popup.js - folder-aware UI + import/export + auto-date tokens + Settings + LLM fields */

// --- UI Elements ---
// Settings
const toggleSettingsBtn = document.getElementById('toggleSettings');
const settingsSection = document.getElementById('settingsSection');
const mainSection = document.getElementById('mainSection');
const closeSettingsBtn = document.getElementById('closeSettings');
const saveSettingsBtn = document.getElementById('saveSettings');
const openaiKeyInput = document.getElementById('openaiKey');
const clearOpenAIBtn = document.getElementById('clearOpenAI');
const geminiKeyInput = document.getElementById('geminiKey');
const clearGeminiBtn = document.getElementById('clearGemini');
const defaultProviderSelect = document.getElementById('defaultProvider');
const defaultOpenAIModelInput = document.getElementById('defaultOpenAIModel');
const defaultGeminiModelInput = document.getElementById('defaultGeminiModel');

// Prompt Editor
const groupedList = document.getElementById('groupedList');
const savePromptBtn = document.getElementById('savePrompt');
const cancelEditBtn = document.getElementById('cancelEdit');
const newTitle = document.getElementById('newTitle');
const newFolder = document.getElementById('newFolder');
const folderSuggestions = document.getElementById('folderSuggestions');
const promptTypeRadios = document.getElementsByName('promptType');
const pasteFields = document.getElementById('pasteFields');
const newPrompt = document.getElementById('newPrompt');
const llmFields = document.getElementById('llmFields');
const llmProvider = document.getElementById('llmProvider');
const llmModel = document.getElementById('llmModel');
const llmSystem = document.getElementById('llmSystem');
const llmUser = document.getElementById('llmUser');
const llmTemp = document.getElementById('llmTemp');
const llmMaxTokens = document.getElementById('llmMaxTokens');

const exportPrompts = document.getElementById('exportPrompts');
const importPrompts = document.getElementById('importPrompts');
const importFile = document.getElementById('importFile');

const DEFAULT_FOLDER = 'Ungrouped';
let editingIndex = null; // null means "creating", number means "editing existing"
let cachedSettings = {}; // In-memory cache of settings to handle key masking

// --- Helper Functions ---

const normalizeFolder = (f) => {
  const v = (f || '').trim();
  if (!v) return DEFAULT_FOLDER;
  if (v.toLowerCase() === 'ungrouped') return DEFAULT_FOLDER;
  return v;
};

// Normalize prompt object to ensure all fields are present
function normalizePrompt(p) {
  return {
    title: (p.title || '').trim(),
    folder: normalizeFolder(p.folder),
    type: p.type || 'paste', // 'paste' or 'llm'
    prompt: p.prompt || '', // For paste: text. For LLM: null or ignored (we use llm user msg but map to this field for storage simplicity? No, let's keep clean schema).
    // Actually, plan said: content: string (template).
    // Let's reuse 'prompt' field for the "content" (User message or Paste text).
    // And store LLM config in 'llm' object.
    llm: p.llm || {
        provider: 'openai',
        model: '',
        system: '',
        temperature: 0.7,
        maxOutputTokens: null
    }
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
      // Icon based on type
      const icon = p.type === 'llm' ? '✨ ' : '';
      title.textContent = icon + (p.title || '(untitled)');
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

function savePromptsList(list) {
  const normalized = list.map(normalizePrompt);
  chrome.storage.local.set({ prompts: normalized }, () => {
    renderPrompts(normalized);
    chrome.runtime.sendMessage({ type: 'updatePrompts', prompts: normalized });
  });
}


// --- Settings Logic ---

function loadSettings() {
    chrome.storage.local.get({ settings: {} }, (data) => {
        const s = data.settings;
        cachedSettings = s;

        // Show masked keys if present
        openaiKeyInput.value = s.openaiApiKey ? '********' : '';
        geminiKeyInput.value = s.geminiApiKey ? '********' : '';

        defaultProviderSelect.value = s.defaultProvider || 'openai';
        defaultOpenAIModelInput.value = s.defaultOpenAIModel || 'gpt-3.5-turbo';
        defaultGeminiModelInput.value = s.defaultGeminiModel || 'gemini-1.5-flash';
    });
}

function saveSettings() {
    // Only update keys if they are not the masked string
    const newOpenAI = openaiKeyInput.value;
    const newGemini = geminiKeyInput.value;

    const s = { ...cachedSettings };

    if (newOpenAI && newOpenAI !== '********') {
        s.openaiApiKey = newOpenAI;
    }
    // If empty and was not masked, it remains empty (cleared)?
    // Wait, if user clears input, we should clear it.
    if (newOpenAI === '') delete s.openaiApiKey;

    if (newGemini && newGemini !== '********') {
        s.geminiApiKey = newGemini;
    }
    if (newGemini === '') delete s.geminiApiKey;

    s.defaultProvider = defaultProviderSelect.value;
    s.defaultOpenAIModel = defaultOpenAIModelInput.value;
    s.defaultGeminiModel = defaultGeminiModelInput.value;

    chrome.storage.local.set({ settings: s }, () => {
        cachedSettings = s;
        alert('Settings saved.');
        toggleSettings(false);
    });
}

function toggleSettings(show) {
    if (show) {
        settingsSection.classList.remove('hidden');
        mainSection.classList.add('hidden');
        loadSettings();
    } else {
        settingsSection.classList.add('hidden');
        mainSection.classList.remove('hidden');
    }
}

// --- Prompt Form Logic ---

function getPromptType() {
    return Array.from(promptTypeRadios).find(r => r.checked).value;
}

function setPromptType(type) {
    Array.from(promptTypeRadios).forEach(r => r.checked = (r.value === type));
    updateFormVisibility();
}

function updateFormVisibility() {
    const type = getPromptType();
    if (type === 'paste') {
        pasteFields.classList.remove('hidden');
        llmFields.classList.add('hidden');
    } else {
        pasteFields.classList.add('hidden');
        llmFields.classList.remove('hidden');
    }
}

function handleSaveClick(e) {
  e.preventDefault();
  const title = newTitle.value.trim();
  const folder = normalizeFolder(newFolder.value);
  const type = getPromptType();

  if (!title) {
    alert('Please enter a title.');
    return;
  }

  const newObj = {
      title,
      folder,
      type,
      llm: {}
  };

  if (type === 'paste') {
      newObj.prompt = newPrompt.value;
  } else {
      // LLM
      newObj.prompt = llmUser.value; // Reuse prompt field for user message template
      newObj.llm = {
          provider: llmProvider.value,
          model: llmModel.value,
          system: llmSystem.value,
          temperature: parseFloat(llmTemp.value) || 0.7,
          maxOutputTokens: parseInt(llmMaxTokens.value) || null
      };
  }

  chrome.storage.local.get({ prompts: [] }, (data) => {
    const list = Array.isArray(data.prompts) ? data.prompts : [];

    if (editingIndex === null) {
      list.push(newObj);
    } else {
      list[editingIndex] = newObj;
    }
    savePromptsList(list);
    resetForm();
  });
}

function resetForm() {
  editingIndex = null;
  newTitle.value = '';
  newFolder.value = '';
  setPromptType('paste');
  newPrompt.value = '';

  // Reset LLM fields
  llmProvider.value = cachedSettings.defaultProvider || 'openai';
  llmModel.value = ''; // Will default to global setting on run if empty, but here let's leave blank or load default?
                       // Better leave blank to indicate "use global default" or populate?
                       // Let's populate with specific default if we want to "freeze" it, or blank.
                       // Let's leave blank so user knows it's optional override.
  llmSystem.value = '';
  llmUser.value = '';
  llmTemp.value = '';
  llmMaxTokens.value = '';

  savePromptBtn.textContent = 'Save Prompt';
  cancelEditBtn.classList.add('hidden');
}

function startEdit(p) {
  const norm = normalizePrompt(p);

  // Find index by identity (title+folder+prompt match is tricky if modified, better finding by object ref or index)
  // Since we reload list often, object ref is lost. We need a stable ID or just search.
  // The current logic uses property matching.
  chrome.storage.local.get({ prompts: [] }, (data) => {
    const list = Array.isArray(data.prompts) ? data.prompts : [];
    const idx = list.findIndex(x =>
      (x.title || '') === (p.title || '') &&
      (x.prompt || '') === (p.prompt || '') &&
      normalizeFolder(x.folder) === normalizeFolder(p.folder)
    );
    if (idx < 0) return;

    editingIndex = idx;
    newTitle.value = norm.title;
    newFolder.value = norm.folder;
    setPromptType(norm.type);

    if (norm.type === 'paste') {
        newPrompt.value = norm.prompt;
    } else {
        llmUser.value = norm.prompt;
        llmProvider.value = norm.llm.provider || 'openai';
        llmModel.value = norm.llm.model || '';
        llmSystem.value = norm.llm.system || '';
        llmTemp.value = norm.llm.temperature || '';
        llmMaxTokens.value = norm.llm.maxOutputTokens || '';
    }

    savePromptBtn.textContent = 'Update Prompt';
    cancelEditBtn.classList.remove('hidden');
    refreshFolderSuggestions(list.map(normalizePrompt));

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function deletePrompt(p) {
  if (!confirm(`Delete "${p.title}"?`)) return;
  chrome.storage.local.get({ prompts: [] }, (data) => {
    let list = Array.isArray(data.prompts) ? data.prompts : [];
    // Matching logic
    const idx = list.findIndex(x =>
      (x.title || '') === (p.title || '') &&
      (x.prompt || '') === (p.prompt || '') &&
      normalizeFolder(x.folder) === normalizeFolder(p.folder)
    );
    if (idx >= 0) {
      list.splice(idx, 1);
      savePromptsList(list);
    }
    if (editingIndex === idx) resetForm();
  });
}

// --- Event Listeners ---

// Settings
toggleSettingsBtn.addEventListener('click', () => toggleSettings(true));
closeSettingsBtn.addEventListener('click', () => toggleSettings(false));
saveSettingsBtn.addEventListener('click', saveSettings);
clearOpenAIBtn.addEventListener('click', () => { openaiKeyInput.value = ''; });
clearGeminiBtn.addEventListener('click', () => { geminiKeyInput.value = ''; });

// Prompt Form
Array.from(promptTypeRadios).forEach(r => r.addEventListener('change', updateFormVisibility));
savePromptBtn.addEventListener('click', handleSaveClick);
cancelEditBtn.addEventListener('click', resetForm);

// Export/Import
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
      savePromptsList(list);
      importFile.value = '';
      resetForm();
    } catch (e) {
      alert('Invalid JSON file.');
    }
  };
  reader.readAsText(file);
});

// Init
document.addEventListener('DOMContentLoaded', () => {
  const versionElement = document.getElementById('appVersion');
  const manifestData = chrome.runtime.getManifest();
  versionElement.textContent = `v${manifestData.version}`;
  loadSettings();
  loadPrompts();
});
