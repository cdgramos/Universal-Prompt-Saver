# Agent Guidelines for Universal Prompt Saver

Welcome! This document provides context, architectural details, and guidelines for AI agents and human developers working on the Universal Prompt Saver Chrome extension.

## 1. Project Overview

**Universal Prompt Saver** is a Manifest V3 Chrome extension that allows users to save frequently used text prompts and insert them into any editable field via the context menu.

**Key Features:**
*   **Storage:** Saves prompts with a title, body, and folder category using `chrome.storage.local`.
*   **Context Menu:** Dynamically updates a nested right-click menu (Folder -> Prompt) based on saved data.
*   **Smart Pasting:** Inserts text into inputs, textareas, and `contentEditable` elements.
*   **Rich Text & Markdown:** Handles HTML insertion but detects "Markdown-aware" sites (like Jira, ChatGPT, Gemini) to prioritize plain text/Markdown to avoid formatting issues.
*   **Token Expansion:** Supports dynamic tokens like `{{date}}`, `{{time}}`, `{{iso}}`.
*   **Quick Prompt Picker:** A global searchable overlay (`Ctrl+Shift+P`) to find and paste prompts.
*   **Shortcuts:** `Ctrl+Shift+1` through `9` to instantly paste the top 9 prompts.

## 2. Architecture & Key Files

| File | Purpose |
| :--- | :--- |
| `manifest.json` | Manifest V3 definition. Permissions: `contextMenus`, `storage`, `scripting`, `activeTab`. Defines `commands` and `content_scripts`. |
| `background.js` | **Service Worker.** Handles context menu, shortcuts (`chrome.commands`), and the core pasting logic (via `scripting.executeScript`). |
| `popup.js` / `.html` | **UI Action.** Manages CRUD operations for prompts, folders, and import/export. Uses `chrome.storage.local`. |
| `content.js` | **Content Script.** Injected into all pages. Handles the "Quick Prompt Picker" overlay UI and keyboard interactions. |

## 3. Core Logic Explanation

### 3.1. Data Model
Prompts are stored in `chrome.storage.local` under the key `prompts` as an array of objects:
```json
[
  {
    "title": "My Prompt",
    "prompt": "Hello world {{date}}",
    "folder": "Work"
  }
]
```

### 3.2. Context Menu (background.js)
*   Menus are rebuilt whenever the extension installs, starts up, or receives an `updatePrompts` message.
*   The `ROOT_MENU_ID` is `ups-root`. Submenus are created for each unique folder.

### 3.3. The Pasting Strategy (background.js)
The extension uses a robust fallback mechanism to ensure text is inserted correctly across different websites:

1.  **ClipboardEvent:** Tries to dispatch a synthetic `paste` event.
    *   For "Markdown-aware" sites (see regex in `background.js`), it sends `text/plain` to prevent unwanted HTML parsing.
    *   For others, it sends both `text/html` (with formatting preserved) and `text/plain`.
2.  **`document.execCommand`:** If the event is unhandled, falls back to `insertText` (for markdown-aware) or `insertHTML`.
3.  **Range API:** As a last resort for `contentEditable` elements, it manually inserts a text node at the cursor position.
4.  **Value Property:** For standard `<input>` and `<textarea>` elements, it manipulates the `.value` property directly.

**Markdown-Aware Sites:**
The code explicitly checks `location.hostname` against a regex (e.g., `jira`, `chatgpt`, `gemini`) to adjust pasting behavior. This is crucial to prevent these apps from misinterpreting HTML clipboard data.

### 3.4. Quick Prompt Picker
*   **Prompt Picker:** Triggered by typing `//p ` (slash slash p space) in any editable field.
    *   `content.js` listens for `input` events and detects the `//p ` sequence.
    *   It removes the trigger text and renders a Shadow DOM overlay with a search input and list.
    *   When a prompt is selected, `content.js` closes the overlay, restores focus to the previously active element, expands tokens, and pastes the text directly.

## 4. Development Guidelines

### 4.1. Manifest V3 Constraints
*   **No background pages:** `background.js` is a service worker. It terminates when idle. Do not rely on persistent global variables in `background.js` for state. Always fetch from `storage` or rebuild state (like menus) on startup.
*   **CSP:** Inline scripts are not allowed in HTML files. All logic must be in external JS files (e.g., `popup.js`).

### 4.2. Testing
*   **Current State:** Testing is primarily manual.
*   **Recommended Future State:** Implement unit tests using `jest` and `jest-chrome` to mock the Chrome API.
    *   *Note:* Previous project history mentions Jest usage. If re-implementing, ensure `popup.js` and `background.js` are testable (e.g., by exporting logic conditionally).

### 4.3. Code Style
*   Use `const`/`let` over `var`.
*   Ensure async Chrome APIs (like `storage.get`) are handled correctly (callbacks or promises).
*   Keep `popup.js` logic separated from `background.js` logic where possible.

## 5. Common Tasks

*   **Adding a new Token:** Update the `expandTokens` function in `background.js`.
*   **Adding a Markdown-aware site:** Update the regex check inside the injected function in `background.js`.
*   **Changing Storage:** If migrating schema, ensure backward compatibility or a migration script, as `unlimitedStorage` allows users to store large amounts of data.
