## Universal Prompt Saver - Chrome Extension

Chrome extension to save prompts and quickly insert them anywhere with a right-click. Ideal for ChatGPT users, customer support agents, developers, and content creators who frequently reuse text snippets.

## Functionalities

### Save and manage prompts  
Save frequently used prompts with custom titles and manage them through a user-friendly popup UI.


### Folders & Nested Menus
Organize prompts into folders in the popup UI. Right-click shows a nested menu: Folder → Prompt.


### Right-click to paste  
Easily insert saved prompts into any input field or editable area directly from the right-click context menu.


### Auto-updating context menu  
When prompts are added or deleted, the context menu updates in real time — no reloads needed.


### Import/Export support  
Backup or transfer your saved prompts using JSON files.


### Quick Prompt Picker
Press `Ctrl+Shift+Space` (or configure your own shortcut in `chrome://extensions/shortcuts`) to open the searchable prompt picker.


## License

This project is licensed under the MIT License.

## Installation

Manual install:

* Clone or download this repository
* Open Chrome and go to: `chrome://extensions/`
* Enable **Developer mode** (top right)
* Click **Load unpacked**
* Select the folder where the extension files are located

## Change Log
* 18-04-2025 - Release - Initial Public Release
* 09-05-2025 - 1.1: Added the hability to paste rich text - HTML
* 11-05-2025 - 1.2: Support for markdown
* 20-05-2025 - 1.3: Better support for markdown on Jira, text doesn't go into the clipboard anymore
* 22-05-2025 - 1.4: Added edit function, version number at the bottom, confirmation popup for delete actions, and preserved line breaks at the end of prompts
* 25-05-2025 - 1.5: Minor UI improvement
* 18-09-2025 - 1.6: Added Folders & Nested Menus
* 19-09-2025 - 1.7: Breakline bug fixed
* 20-09-2025 - 1.8: Jira/markdown paste bug fixed
* 25-09-2025 - 1.9: Moved from sync storage to local storage (sync has a size limit "kQuotaBytesPerItem", which limits the number and size of the prompts). Removed folder name capitalization from the popup.
* 04-12-2025 - 1.10: Fixed a bug that prevented the prompts from being pasted in Gemini
* 22-01-2026 - 1.11: Added "Quick Prompt Picker" (triggered by typing `||p `).
* 25-01-2026 - 1.12: Switched "Quick Prompt Picker" trigger to `Ctrl+Shift+Space` to reduce permissions.
