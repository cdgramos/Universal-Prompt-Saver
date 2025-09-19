/* background.js - folder-aware context menus + auto-date tokens */

// Token expansion (auto-date/time + simple user info hooks if needed later)
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

  const replacements = {
    '{{date}}': `${yyyy}-${mm}-${dd}`,
    '{{time}}': `${hh}:${min}`,
    '{{seconds}}': `${ss}`,
    '{{datetime}}': `${yyyy}-${mm}-${dd} ${hh}:${min}`,
    '{{iso}}': now.toISOString(),
    '{{weekday}}': weekdays[now.getDay()],
  };

  return text.replace(/\{\{(date|time|seconds|datetime|iso|weekday)\}\}/g, (m) => replacements[m] || m);
}

// ---- Context Menu Builder ----
const ROOT_MENU_ID = 'ups-root';

function createContextMenus(prompts) {
  chrome.contextMenus.removeAll(() => {
    // Create a single root item
    chrome.contextMenus.create({
      id: ROOT_MENU_ID,
      title: 'Universal Prompt Saver',
      contexts: ['editable']
    });

    // Group by folder (default to 'Ungrouped')
    const groups = {};
    prompts.forEach((p, idx) => {
      const folder = (p.folder && p.folder.trim()) ? p.folder.trim() : 'Ungrouped';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push({...p, __index: idx});
    });

    // For each folder, create submenu and items
    Object.keys(groups).sort((a,b)=>a.localeCompare(b)).forEach(folder => {
      const folderId = `ups-folder-${folder}`;
      chrome.contextMenus.create({
        id: folderId,
        parentId: ROOT_MENU_ID,
        title: folder,
        contexts: ['editable']
      });

      groups[folder].forEach(item => {
        chrome.contextMenus.create({
          id: `ups-prompt-${item.__index}`,
          parentId: folderId,
          title: item.title || '(untitled)',
          contexts: ['editable']
        });
      });
    });
  });
}

// Initialize menus on install / startup
function initMenus() {
  chrome.storage.sync.get({ prompts: [] }, (data) => {
    const normalized = Array.isArray(data.prompts) ? data.prompts : [];
    createContextMenus(normalized);
  });
}
chrome.runtime.onInstalled.addListener(initMenus);
chrome.runtime.onStartup.addListener(initMenus);

// Listen to messages from popup to update menus live
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'updatePrompts') {
    const prompts = Array.isArray(msg.prompts) ? msg.prompts : [];
    createContextMenus(prompts);
    sendResponse({ ok: true });
  }
});

// Context menu click -> inject text into active editable (input/textarea/contenteditable)
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!info.menuItemId || typeof info.menuItemId !== 'string') return;
  const m = info.menuItemId.match(/^ups-prompt-(\d+)$/);
  if (!m) return;
  const index = parseInt(m[1], 10);

  chrome.storage.sync.get({ prompts: [] }, (data) => {
    const list = Array.isArray(data.prompts) ? data.prompts : [];
    const chosen = list[index];
    if (!chosen) return;
    const expanded = expandTokens(chosen.prompt || '');

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (textToInsert) => {
        // Try focused element first
        const active = document.activeElement;

        const insertAtCursor = (el, txt) => {
          if (typeof el.selectionStart === 'number') {
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const before = el.value.slice(0, start);
            const after = el.value.slice(end);
            el.value = before + txt + after;
            const newPos = start + txt.length;
            el.selectionStart = el.selectionEnd = newPos;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
          return false;
        };

        const insertIntoContentEditable = (txt) => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return false;
          const range = sel.getRangeAt(0);

          // Escape HTML, then convert newlines to <br> so formatting is preserved
          const escape = (s) => s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

          const html = escape(String(txt)).replace(/\r\n|\r|\n/g, '<br>');

          // Prefer execCommand (works well in many rich editors, including ChatGPT)
          const ok = document.execCommand && document.execCommand('insertHTML', false, html);
          if (ok) return true;

          // Fallback: Range API
          const tpl = document.createElement('template');
          tpl.innerHTML = html;
          const frag = tpl.content.cloneNode(true);
          range.deleteContents();
          range.insertNode(frag);
          return true;
        };

        const isEditable = (el) =>
          el && (el.tagName === 'TEXTAREA' ||
                 (el.tagName === 'INPUT' && /^(text|search|email|tel|url|password|number)$/i.test(el.type)) ||
                 el.isContentEditable);

        if (isEditable(active)) {
          if (active.isContentEditable) {
            if (!insertIntoContentEditable(textToInsert)) alert('Could not insert into contenteditable element.');
          } else {
            if (!insertAtCursor(active, textToInsert)) alert('Could not insert into input/textarea.');
          }
        } else {
          // Try to find any focused contenteditable as fallback
          const anyEditable = document.querySelector('textarea:focus, input:focus, [contenteditable="true"]:focus, [contenteditable="plaintext-only"]:focus');
          if (anyEditable) {
            if (anyEditable.isContentEditable) {
              if (!insertIntoContentEditable(textToInsert)) alert('Could not insert into contenteditable element.');
            } else {
              if (!insertAtCursor(anyEditable, textToInsert)) alert('Could not insert into input/textarea.');
            }
          } else {
            alert('No active input or editable field to insert the prompt.');
          }
        }
      },
      args: [expanded]
    });
  });
});
