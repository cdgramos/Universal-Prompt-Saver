/* background.js — folders + original rich-paste behavior + auto-date tokens */

const ROOT_MENU_ID = 'ups-root';
const DEFAULT_FOLDER = 'Ungrouped';

// ---------- token expansion ----------
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

// ---------- menus (folders -> prompts) ----------
function createContextMenus(prompts) {
  chrome.contextMenus.removeAll(() => {
    // Root
    chrome.contextMenus.create({
      id: ROOT_MENU_ID,
      title: 'Universal Prompt Saver',
      contexts: ['editable'],
    });

    // Group by folder
    const groups = {};
    (prompts || []).forEach((p, idx) => {
      const folder = (p.folder && p.folder.trim()) ? p.folder.trim() : DEFAULT_FOLDER;
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push({ ...p, __index: idx });
    });

    // Create submenus + items
    Object.keys(groups).sort((a,b)=>a.localeCompare(b)).forEach(folder => {
      const folderId = `ups-folder-${folder}`;
      chrome.contextMenus.create({
        id: folderId,
        parentId: ROOT_MENU_ID,
        title: folder,
        contexts: ['editable'],
      });

      groups[folder].forEach(item => {
        chrome.contextMenus.create({
          id: `ups-prompt-${item.__index}`,
          parentId: folderId,
          title: item.title || '(untitled)',
          contexts: ['editable'],
        });
      });
    });
  });
}

// init / live update
function initMenus() {
  chrome.storage.local.get({ prompts: [] }, ({ prompts }) => createContextMenus(prompts));
}
chrome.runtime.onInstalled.addListener(initMenus);
chrome.runtime.onStartup.addListener(initMenus);
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'updatePrompts') {
    createContextMenus(Array.isArray(msg.prompts) ? msg.prompts : []);
    sendResponse?.({ ok: true });
  }
});

// ---------- click handler ----------
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const m = typeof info.menuItemId === 'string' && info.menuItemId.match(/^ups-prompt-(\d+)$/);
  if (!m) return;

  const index = parseInt(m[1], 10);
  chrome.storage.local.get({ prompts: [] }, ({ prompts }) => {
    const item = (Array.isArray(prompts) ? prompts : [])[index];
    if (!item) return;

    const expanded = expandTokens(String(item.prompt || ''));

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [expanded],
      func: (promptText) => {
        const el = document.activeElement;
        if (!el || !(el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) {
          alert('No active input or editable field to insert the prompt.');
          return;
        }

        el.focus();

        if (el.isContentEditable) {
          // ------- single-shot paste: either paste event OR one fallback, never both -------
          try {
            const pasteEvent = new ClipboardEvent("paste", {
              clipboardData: new DataTransfer(),
              bubbles: true,
              cancelable: true,
            });

            const html = String(promptText)
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

            pasteEvent.clipboardData.setData("text/html", html);
            pasteEvent.clipboardData.setData("text/plain", String(promptText));

            // Dispatch and STOP — let the site/editor handle it. No fallback here.
            el.dispatchEvent(pasteEvent);
            return;
          } catch (err) {
            // Fallback ONLY if constructing/dispatching the ClipboardEvent failed
            const wantsMarkdownParsing = /atlassian\.net|jira/i.test(location.hostname);
            if (document.execCommand) {
              if (wantsMarkdownParsing) {
                // Plain text → Jira turns #/**/* into headings/bold/lists
                document.execCommand('insertText', false, String(promptText));
              } else {
                // HTML with <br> to preserve line breaks elsewhere
                const html = String(promptText)
                  .split(/\n{2,}/)
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
                document.execCommand('insertHTML', false, html);
              }
            } else {
              // Very last resort: Range API (still do it exactly once)
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
            return;
          }
        } else {
          // Inputs / textareas: standard text insertion (preserves \n)
          const start = el.selectionStart ?? el.value.length;
          const end   = el.selectionEnd   ?? el.value.length;
          const before = el.value.slice(0, start);
          const after  = el.value.slice(end);
          el.value = before + promptText + after;
          const pos = start + promptText.length;
          el.selectionStart = el.selectionEnd = pos;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
  });
});
