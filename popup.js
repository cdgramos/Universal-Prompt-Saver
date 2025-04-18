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

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.className = 'delete';
    delBtn.addEventListener('click', () => {
      prompts.splice(index, 1);
      chrome.storage.sync.set({ prompts }, () => {
        chrome.runtime.sendMessage({ type: 'updatePrompts', prompts });
        renderPrompts(prompts);
      });
    });

    li.appendChild(delBtn);
    promptList.appendChild(li);
  });
}

savePrompt.addEventListener('click', () => {
  const title = newTitle.value.trim();
  const text = newPrompt.value.trim();
  if (!title || !text) return;

  chrome.storage.sync.get(['prompts'], result => {
    const prompts = result.prompts || [];
    prompts.push({ title, prompt: text });
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