function createContextMenus(prompts) {
  chrome.contextMenus.removeAll(() => {
    prompts.forEach((prompt, index) => {
      chrome.contextMenus.create({
        id: `prompt-${index}`,
        title: prompt.title,
        contexts: ["editable"]
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ prompts: [] }, (data) => {
    createContextMenus(data.prompts);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'updatePrompts') {
    createContextMenus(msg.prompts);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = info.menuItemId;
  chrome.storage.sync.get({ prompts: [] }, (data) => {
    const index = parseInt(id.split('-')[1]);
    const prompt = data.prompts[index];
    if (prompt) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [String(prompt.prompt)],
        func: (promptText) => {
          const el = document.activeElement;
          if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) {
            if (el.isContentEditable) {
              document.execCommand('insertText', false, promptText);
            } else {
              el.focus();
              const start = el.selectionStart;
              const end = el.selectionEnd;
              el.value = el.value.slice(0, start) + promptText + el.value.slice(end);
              el.selectionStart = el.selectionEnd = start + promptText.length;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } else {
            alert('No active input or editable field to insert the prompt.');
          }
        }
      });
    }
  });
});