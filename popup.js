const promptList = document.getElementById('promptList');
const savePrompt = document.getElementById('savePrompt');
const newPrompt = document.getElementById('newPrompt');
const newTitle = document.getElementById('newTitle');
const exportPrompts = document.getElementById('exportPrompts');
const importPrompts = document.getElementById('importPrompts');
const importFile = document.getElementById('importFile');

function renderPrompts(prompts) {
  promptList.innerHTML = '';
  prompts.forEach((promptObj, index) => {
    const li = document.createElement('li');
    li.textContent = promptObj.title;

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.className = 'edit';
    editBtn.addEventListener('click', () => {
      newTitle.value = promptObj.title;
      newPrompt.value = promptObj.prompt;
      savePrompt.dataset.editingIndex = index;  // store index being edited
      savePrompt.textContent = 'Update Prompt';
    });

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.textContent = '❌';
    delBtn.className = 'delete';
    delBtn.addEventListener('click', () => {
      // Add confirmation dialog here
      if (confirm(`Are you sure you want to delete the prompt "${promptObj.title}"? This action cannot be undone.`)) {
        prompts.splice(index, 1);
        chrome.storage.sync.set({ prompts }, () => {
          chrome.runtime.sendMessage({ type: 'updatePrompts', prompts });
          renderPrompts(prompts);
        });
      }
    });

    li.appendChild(editBtn);
    li.appendChild(delBtn);
    promptList.appendChild(li);
  });
}

savePrompt.addEventListener('click', () => {
  const title = newTitle.value.trim();
  const text = newPrompt.value;
  if (!title || !text) return;

  chrome.storage.sync.get(['prompts'], result => {
    const prompts = result.prompts || [];
    const editingIndex = savePrompt.dataset.editingIndex;

    if (editingIndex !== undefined) {
      // Update existing prompt
      prompts[editingIndex] = { title, prompt: text };
      delete savePrompt.dataset.editingIndex;
      savePrompt.textContent = 'Save Prompt';
    } else {
      // Add new prompt
      prompts.push({ title, prompt: text });
    }

    chrome.storage.sync.set({ prompts }, () => {
      chrome.runtime.sendMessage({ type: 'updatePrompts', prompts });
      renderPrompts(prompts);
      newTitle.value = '';
      newPrompt.value = '';
    });
  });
});

exportPrompts.addEventListener('click', () => {
  chrome.storage.sync.get(['prompts'], result => {
    const dataStr = JSON.stringify(result.prompts || [], null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompts.json';
    a.click();
    URL.revokeObjectURL(url);
  });
});

importPrompts.addEventListener('click', () => {
  const file = importFile.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const importedPrompts = JSON.parse(reader.result);
      if (Array.isArray(importedPrompts)) {
        chrome.storage.sync.set({ prompts: importedPrompts }, () => {
          chrome.runtime.sendMessage({ type: 'updatePrompts', prompts: importedPrompts });
          renderPrompts(importedPrompts);
        });
      }
    } catch (e) {
      alert('Invalid JSON file.');
    }
  };
  reader.readAsText(file);
});

chrome.storage.sync.get(['prompts'], result => {
  renderPrompts(result.prompts || []);
});

document.addEventListener('DOMContentLoaded', () => {
  const versionElement = document.getElementById('appVersion');
  const manifestData = chrome.runtime.getManifest();
  versionElement.textContent = `v${manifestData.version}`;
});