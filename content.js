/* content.js - Prompt Picker Overlay */

let overlayHost = null;
let shadowRoot = null;
let lastActiveElement = null;
let prompts = [];
let filteredPrompts = [];
let selectedIndex = 0;

function createOverlay() {
  if (overlayHost) return; // already created

  overlayHost = document.createElement('div');
  overlayHost.id = 'ups-prompt-picker-host';
  overlayHost.style.position = 'fixed';
  overlayHost.style.top = '0';
  overlayHost.style.left = '0';
  overlayHost.style.width = '100%';
  overlayHost.style.height = '100%';
  overlayHost.style.zIndex = '2147483647'; // Max z-index
  overlayHost.style.pointerEvents = 'none'; // Pass clicks through container, but backdrop catches them

  shadowRoot = overlayHost.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .overlay-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 10vh;
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .picker-container {
      background: white;
      width: 600px;
      max-width: 90%;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #ddd;
    }
    .picker-input {
      width: 100%;
      padding: 16px;
      font-size: 18px;
      border: none;
      border-bottom: 1px solid #eee;
      outline: none;
      box-sizing: border-box;
      background: #fff;
      color: #333;
    }
    .picker-list {
      max-height: 400px;
      overflow-y: auto;
      margin: 0;
      padding: 0;
      list-style: none;
      background: #fff;
    }
    .picker-item {
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1px solid #f9f9f9;
      display: flex;
      flex-direction: column;
    }
    .picker-item.selected {
      background: #f0f4ff;
      border-left: 4px solid #0056b3;
    }
    .item-title {
      font-weight: 600;
      font-size: 16px;
      color: #333;
    }
    .item-preview {
      font-size: 13px;
      color: #666;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 4px;
    }
    .item-folder {
      font-size: 11px;
      color: #999;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  `;

  shadowRoot.appendChild(style);

  const backdrop = document.createElement('div');
  backdrop.className = 'overlay-backdrop';

  // Close on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeOverlay();
  });

  const container = document.createElement('div');
  container.className = 'picker-container';

  const input = document.createElement('input');
  input.className = 'picker-input';
  input.placeholder = 'Search prompts...';
  input.addEventListener('input', (e) => filterPrompts(e.target.value));
  input.addEventListener('keydown', handleKeydown);

  const list = document.createElement('ul');
  list.className = 'picker-list';

  container.appendChild(input);
  container.appendChild(list);
  backdrop.appendChild(container);
  shadowRoot.appendChild(backdrop);

  // Expose elements for updating
  overlayHost.input = input;
  overlayHost.list = list;
}

function showOverlay() {
  lastActiveElement = document.activeElement;
  createOverlay();
  document.body.appendChild(overlayHost);

  overlayHost.input.value = '';

  chrome.storage.local.get({ prompts: [] }, (data) => {
    prompts = Array.isArray(data.prompts) ? data.prompts : [];
    filterPrompts('');
    overlayHost.input.focus();
  });
}

function closeOverlay() {
  if (overlayHost && overlayHost.parentNode) {
    overlayHost.parentNode.removeChild(overlayHost);
  }
  if (lastActiveElement) {
    lastActiveElement.focus();
  }
}

function filterPrompts(query) {
  const q = query.toLowerCase();
  filteredPrompts = prompts.filter(p => {
    const title = (p.title || '').toLowerCase();
    const body = (p.prompt || '').toLowerCase();
    const folder = (p.folder || '').toLowerCase();
    return title.includes(q) || body.includes(q) || folder.includes(q);
  });
  selectedIndex = 0;
  renderList();
}

function renderList() {
  const list = overlayHost.list;
  list.innerHTML = '';
  filteredPrompts.forEach((p, index) => {
    const li = document.createElement('li');
    li.className = `picker-item ${index === selectedIndex ? 'selected' : ''}`;
    li.addEventListener('click', () => selectPrompt(index));
    li.addEventListener('mouseenter', () => {
        selectedIndex = index;
        updateSelection();
    });

    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = p.title || '(untitled)';

    const folder = document.createElement('div');
    folder.className = 'item-folder';
    folder.textContent = p.folder || 'Ungrouped';

    const preview = document.createElement('div');
    preview.className = 'item-preview';
    preview.textContent = p.prompt || '';

    li.appendChild(title);
    li.appendChild(folder);
    li.appendChild(preview);
    list.appendChild(li);
  });

  const selected = list.children[selectedIndex];
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

function updateSelection() {
    const list = overlayHost.list;
    Array.from(list.children).forEach((li, idx) => {
        if (idx === selectedIndex) li.classList.add('selected');
        else li.classList.remove('selected');
    });
}

function handleKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filteredPrompts.length - 1);
    updateSelection();
    const list = overlayHost.list;
    const selected = list.children[selectedIndex];
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection();
    const list = overlayHost.list;
    const selected = list.children[selectedIndex];
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    selectPrompt(selectedIndex);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeOverlay();
  }
}

function selectPrompt(index) {
  const p = filteredPrompts[index];
  if (p) {
    closeOverlay(); // Focus restores here
    // Wait a tick to ensure focus is restored
    setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'pastePrompt', text: p.prompt });
    }, 50);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'togglePromptPicker') {
    if (document.getElementById('ups-prompt-picker-host')) {
      closeOverlay();
    } else {
      showOverlay();
    }
  }
});
