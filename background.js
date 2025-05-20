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
            
            el.focus();

            if (el.isContentEditable) {

              const pasteEvent = new ClipboardEvent("paste", {
                clipboardData: new DataTransfer(),
                bubbles: true,
                cancelable: true,
              });


              const html = promptText
                  .split(/\n{2,}/) // Split into paragraphs (2+ newlines)
                  .map(para => {
                    // Trim the paragraph to avoid leading/trailing whitespace issues
                    const trimmed = para.trim();
                
                    // Check if it's a Markdown heading
                    if (/^### /.test(trimmed)) {
                      return trimmed.replace(/^### (.*)$/gm, '<h3>$1</h3>');
                    } else if (/^## /.test(trimmed)) {
                      return trimmed.replace(/^## (.*)$/gm, '<h2>$1</h2>');
                    } else if (/^# /.test(trimmed)) {
                      return trimmed.replace(/^# (.*)$/gm, '<h1>$1</h1>');
                    } else {
                      // Otherwise, treat it as a normal paragraph
                      return `<p>${trimmed
                        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                        .replace(/\*(.*?)\*/g, '<i>$1</i>')
                        .replace(/\n/g, '<br>')}</p>`;
                    }
                  })
                  .join('');  

              pasteEvent.clipboardData.setData("text/html", html);
              pasteEvent.clipboardData.setData("text/plain", promptText);

              el.dispatchEvent(pasteEvent);


            } else {
 
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