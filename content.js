/* content.js - Prompt Picker Overlay */

let overlayHost = null;
let shadowRoot = null;
let lastActiveElement = null;
let prompts = [];
let filteredPrompts = [];
let selectedIndex = 0;

function expandTokens(text) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const map = {
    '{{date}}': `${yyyy}-${mm}-${dd}`,
    '{{time}}': `${hh}:${min}`,
    '{{seconds}}': `${ss}`,
    '{{datetime}}': `${yyyy}-${mm}-${dd} ${hh}:${min}`,
    '{{iso}}': now.toISOString(),
    '{{weekday}}': weekdays[now.getDay()],
  };
  return text.replace(/\{\{(date|time|seconds|datetime|iso|weekday)\}\}/g, m => map[m] || m);
}

function pastePromptToActiveElement(promptText) {
  let target = document.activeElement;

  // Try to restore focus if active element is body or not editable
  if (!target || !(target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
    if (lastActiveElement && (lastActiveElement.tagName === 'TEXTAREA' || lastActiveElement.tagName === 'INPUT' || lastActiveElement.isContentEditable)) {
        lastActiveElement.focus();
        target = document.activeElement;
    }
  }

  if (!target || !(target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
    alert('No active input or editable field to insert the prompt.');
    return;
  }

  if (target.isContentEditable) {
    // Identify sites that prefer raw markdown text
    const wantsMarkdownParsing = /atlassian\.net|jira|gemini|google|chatgpt|openai|claude/i.test(location.hostname);

    // Generate HTML for clipboard/fallback (except plain-text mode)
    const generatedHtml = String(promptText)
      .split(/\n{2,}/) // paragraphs (2+ newlines)
      .map(para => {
        const trimmed = para.trim();
        if (/^### /.test(trimmed)) return trimmed.replace(/^### (.*)$/gm, '<h3>$1</h3>');
        if (/^## /.test(trimmed)) return trimmed.replace(/^## (.*)$/gm, '<h2>$1</h2>');
        if (/^# /.test(trimmed))  return trimmed.replace(/^# (.*)$/gm,  '<h1>$1</h1>');
        return `<p>${trimmed
          .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
          .replace(/\*(.*?)\*/g, '<i>$1</i>')
          .replace(/\n/g, '<br>')}</p>`;
      })
      .join('');

    let handled = false;
    try {
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });

      if (!wantsMarkdownParsing) {
         pasteEvent.clipboardData.setData("text/html", generatedHtml);
      }
      pasteEvent.clipboardData.setData("text/plain", String(promptText));

      if (!target.dispatchEvent(pasteEvent)) {
        handled = true;
      }
    } catch (err) {
      // Ignore
    }

    if (handled) return;

    if (document.execCommand) {
      if (wantsMarkdownParsing) {
        document.execCommand('insertText', false, String(promptText));
      } else {
        document.execCommand('insertHTML', false, generatedHtml);
      }
    } else {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const tpl = document.createElement('template');
      const safe = (s) => s
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      const html = safe(String(promptText)).replace(/\r\n|\r|\n/g, '<br>');
      tpl.innerHTML = html;
      range.deleteContents();
      range.insertNode(tpl.content);
    }
  } else {
    const start = target.selectionStart ?? target.value.length;
    const end   = target.selectionEnd   ?? target.value.length;
    const before = target.value.slice(0, start);
    const after  = target.value.slice(end);
    target.value = before + promptText + after;
    const pos = start + promptText.length;
    target.selectionStart = target.selectionEnd = pos;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

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
    // Re-focus after a short delay to handle sites that steal focus back (e.g. Jira)
    setTimeout(() => {
        if (overlayHost && overlayHost.input) overlayHost.input.focus();
    }, 100);
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
    closeOverlay();
    setTimeout(() => {
        const text = expandTokens(p.prompt || '');
        pastePromptToActiveElement(text);
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

// Text Trigger Listener
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el) return;

  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
     const val = el.value;
     const end = el.selectionEnd;
     if (end < 4) return;

     const slice = val.slice(end - 4, end);
     if (slice === '||| ') {
        // Match found
        const newVal = val.slice(0, end - 4) + val.slice(end);
        el.value = newVal;
        el.selectionStart = el.selectionEnd = end - 4;
        showOverlay();
     }
  } else if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const node = range.endContainer;
      const offset = range.endOffset;

      if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent;
          if (offset >= 4) {
              const slice = text.slice(offset - 4, offset);
              if (slice === '||| ') {
                  // Remove text
                  const before = text.slice(0, offset - 4);
                  const after = text.slice(offset);
                  node.textContent = before + after;

                  // Restore cursor
                  const newRange = document.createRange();
                  newRange.setStart(node, offset - 4);
                  newRange.setEnd(node, offset - 4);
                  sel.removeAllRanges();
                  sel.addRange(newRange);

                  showOverlay();
              }
          }
      }
  }
}, true);
