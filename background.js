/* background.js — folders + original rich-paste behavior + auto-date tokens + LLM integration */

const ROOT_MENU_ID = 'ups-root';
const DEFAULT_FOLDER = 'Ungrouped';

// ---------- token expansion ----------
function expandTokens(text, selectionText = '') {
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
    '{{selection}}': selectionText,
  };
  return text.replace(/\{\{(date|time|seconds|datetime|iso|weekday|selection)\}\}/g, m => map[m] || m);
}

// ---------- LLM Logic ----------

async function callOpenAI(apiKey, model, system, user, temperature, maxTokens) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });

  const body = {
    model: model || 'gpt-3.5-turbo',
    messages: messages,
    temperature: typeof temperature === 'number' ? temperature : 0.7,
  };
  if (maxTokens) body.max_tokens = maxTokens;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`OpenAI Error: ${data.error?.message || res.statusText}`);
  }
  return data.choices[0].message.content;
}

async function callGemini(apiKey, model, system, user, temperature, maxTokens) {
  // Gemini API structure is slightly different.
  // Note: System instructions are supported in newer models but as a separate field or just prepended.
  // We will use the 'generateContent' method.
  // Model format usually 'gemini-1.5-flash' or similar.

  const m = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

  const contents = [];
  if (system) {
    // Current best practice for system prompt in simple generateContent is to prepend or use system_instruction if supported by specific endpoint.
    // For broad compatibility in v1beta, we can rely on system_instruction if the model supports it, or user-simulated system.
    // Let's try the official 'system_instruction' field which is available in v1beta.
  }

  const body = {
    contents: [{ parts: [{ text: user }] }],
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.7,
    }
  };

  if (maxTokens) body.generationConfig.maxOutputTokens = maxTokens;
  if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gemini Error: ${data.error?.message || res.statusText}`);
  }

  // Extract text
  if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
      return data.candidates[0].content.parts.map(p => p.text).join('');
  }
  return '';
}

async function runLLM(promptObj, selectionText) {
  // 1. Get Settings
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) throw new Error('No settings found. Please configure API keys.');

  const llmConfig = promptObj.llm || {};
  let provider = llmConfig.provider || settings.defaultProvider || 'openai';
  let model = llmConfig.model || (provider === 'openai' ? settings.defaultOpenAIModel : settings.defaultGeminiModel);
  const system = llmConfig.system || '';
  const temperature = llmConfig.temperature;
  const maxTokens = llmConfig.maxOutputTokens;

  // 2. Expand tokens in user message (prompt content)
  // We handle {{clipboard}} separately if needed, but expandTokens handles sync tokens.
  // Async clipboard expansion happens before calling this or we do it here if we are in background.
  // Since this is background, navigator.clipboard might not be directly accessible or requires focused document.
  // However, we can't easily read clipboard here without offscreen document or permission.
  // For now, we assume clipboard token was handled before or we do a best effort if passed in?
  // Actually, standard paste prompt logic injects script to read clipboard.
  // For LLM, we might need to do the same or rely on the caller to provide clipboard content?
  // To keep it simple: we will just expand sync tokens here. If user used {{clipboard}}, it might remain as text if not handled.
  // But wait, the requirement says "LLM Prompt execution must work from... context menu... quick picker".
  // Quick Picker (content.js) can read clipboard. Context menu (background) cannot easily.
  // Let's rely on `expandTokens` which we have here. It doesn't handle clipboard.

  // If we were passed an already expanded user message (from content script), use it.
  // Otherwise, expand locally (handles sync tokens and selection, but not clipboard if not pre-expanded).
  // Note: promptObj might have 'expandedUserMessage' attached if coming from content script.
  let userMessage = promptObj.expandedUserMessage || expandTokens(promptObj.prompt || '', selectionText);

  // 3. Call Provider
  if (provider === 'openai') {
    const key = settings.openaiApiKey;
    if (!key) throw new Error('OpenAI API Key is missing.');
    return callOpenAI(key, model, system, userMessage, temperature, maxTokens);
  } else if (provider === 'gemini') {
    const key = settings.geminiApiKey;
    if (!key) throw new Error('Gemini API Key is missing.');
    return callGemini(key, model, system, userMessage, temperature, maxTokens);
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
}

// ---------- paste logic injection ----------
function injectPasteScript(tabId, promptText) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    args: [promptText],
    func: async (promptText) => {
      // Logic for clipboard expansion if present (only works if document focused)
      if (promptText.includes('{{clipboard}}')) {
        try {
          const clipText = await navigator.clipboard.readText();
          promptText = promptText.replace(/\{\{clipboard\}\}/g, () => clipText);
        } catch (e) {
          promptText = promptText.replace(/\{\{clipboard\}\}/g, '');
        }
      }

      const el = document.activeElement;
      if (!el || !(el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) {
        alert('No active input or editable field to insert the prompt.');
        return;
      }

      el.focus();

      if (el.isContentEditable) {
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

          // If the site wants raw text, only send text/plain to avoid confusion.
          // Otherwise, send both.
          if (!wantsMarkdownParsing) {
             pasteEvent.clipboardData.setData("text/html", generatedHtml);
          }
          pasteEvent.clipboardData.setData("text/plain", String(promptText));

          // If preventDefault() was called by the site, dispatchEvent returns false.
          if (!el.dispatchEvent(pasteEvent)) {
            handled = true;
          }
        } catch (err) {
          // Ignore error, proceed to fallback
        }

        if (handled) return;

        // Fallback logic
        if (document.execCommand) {
          if (wantsMarkdownParsing) {
            // Plain text → let the site parse markdown
            document.execCommand('insertText', false, String(promptText));
          } else {
            // HTML with <br> to preserve line breaks elsewhere
            document.execCommand('insertHTML', false, generatedHtml);
          }
        } else {
          // Very last resort: Range API
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
        const isLLM = item.type === 'llm';
        const titlePrefix = isLLM ? '✨ ' : '';
        chrome.contextMenus.create({
          id: `ups-prompt-${item.__index}`,
          parentId: folderId,
          title: titlePrefix + (item.title || '(untitled)'),
          contexts: ['editable'],
        });
      });
    });
  });
}

// init / live update
function initMenus() {
  chrome.storage.local.get({ prompts: [] }, ({ prompts }) => {
    // Migration check: ensure all prompts have a type
    let changed = false;
    const migrated = prompts.map(p => {
      if (!p.type) {
        p.type = 'paste';
        changed = true;
      }
      return p;
    });
    if (changed) {
      chrome.storage.local.set({ prompts: migrated });
    }
    createContextMenus(migrated);
  });
}

chrome.runtime.onInstalled.addListener(initMenus);
chrome.runtime.onStartup.addListener(initMenus);
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'updatePrompts') {
    createContextMenus(Array.isArray(msg.prompts) ? msg.prompts : []);
    sendResponse?.({ ok: true });
  } else if (msg && msg.type === 'executeLLMPrompt') {
    // Handle message from Content Script (Quick Picker)
    // msg: { type: 'executeLLMPrompt', prompt: Object, selectionText: String, expandedPrompt: String (optional) }

    // If content script already expanded tokens (including clipboard), attach it
    if (msg.expandedPrompt) {
        msg.prompt.expandedUserMessage = msg.expandedPrompt;
    }

    runLLM(msg.prompt, msg.selectionText)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
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

    if (item.type === 'llm') {
      (async () => {
         try {
             let promptText = item.prompt || '';

             // Handle clipboard expansion via injection if needed
             if (promptText.includes('{{clipboard}}')) {
                 const clipboardResults = await chrome.scripting.executeScript({
                     target: { tabId: tab.id },
                     func: async () => {
                         try {
                             return await navigator.clipboard.readText();
                         } catch (e) {
                             return '';
                         }
                     }
                 });
                 const clipText = (clipboardResults && clipboardResults[0] && clipboardResults[0].result) || '';
                 promptText = promptText.replace(/\{\{clipboard\}\}/g, clipText);

                 // Pass pre-expanded text to runLLM
                 item.expandedUserMessage = expandTokens(promptText, info.selectionText || '');
             }

             const result = await runLLM(item, info.selectionText || '');
             injectPasteScript(tab.id, result);
         } catch (e) {
             console.error(e);
             chrome.scripting.executeScript({
                 target: { tabId: tab.id },
                 func: (msg) => alert('LLM Error: ' + msg),
                 args: [e.message]
             });
         }
      })();

    } else {
      // Standard paste
      const expanded = expandTokens(String(item.prompt || ''), info.selectionText || '');
      injectPasteScript(tab.id, expanded);
    }
  });
});
