const { expandTokens, createContextMenus, initMenus } = require('./background');

describe('background.js', () => {
  describe('expandTokens', () => {
    it('should replace {{date}} with current date', () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const expectedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

      const result = expandTokens('Today is {{date}}');
      expect(result).toBe(`Today is ${expectedDate}`);
    });

    it('should replace {{time}} with current time', () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const expectedTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const result = expandTokens('Time is {{time}}');
      expect(result).toBe(`Time is ${expectedTime}`);
    });

    it('should replace {{iso}} with ISO string', () => {
       const text = expandTokens('ISO: {{iso}}');
       expect(text).toMatch(/ISO: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it('should return text unchanged if no tokens present', () => {
        const text = 'Just some text';
        expect(expandTokens(text)).toBe(text);
    });
  });

  describe('createContextMenus', () => {
    beforeEach(() => {
        chrome.contextMenus.create.mockClear();
        chrome.contextMenus.removeAll.mockClear();
    });

    it('should create root menu', () => {
        // Mock removeAll to immediately call callback
        chrome.contextMenus.removeAll.mockImplementation((cb) => cb && cb());

        createContextMenus([]);

        expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
            id: 'ups-root',
            title: 'Universal Prompt Saver',
            contexts: ['editable']
        }));
    });

    it('should create folders and prompts', () => {
         chrome.contextMenus.removeAll.mockImplementation((cb) => cb && cb());

         const prompts = [
             { title: 'P1', prompt: 'Content 1', folder: 'Work' },
             { title: 'P2', prompt: 'Content 2', folder: 'Personal' },
             { title: 'P3', prompt: 'Content 3', folder: 'Work' }
         ];

         createContextMenus(prompts);

         // Check if folders are created
         expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
             id: 'ups-folder-Work',
             parentId: 'ups-root',
             title: 'Work'
         }));
         expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
            id: 'ups-folder-Personal',
            parentId: 'ups-root',
            title: 'Personal'
        }));

        // Check if items are created
        // P1 in Work
        expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
            parentId: 'ups-folder-Work',
            title: 'P1'
        }));
         // P2 in Personal
         expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
            parentId: 'ups-folder-Personal',
            title: 'P2'
        }));
         // P3 in Work
         expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
            parentId: 'ups-folder-Work',
            title: 'P3'
        }));
    });

    it('should handle ungrouped prompts', () => {
        chrome.contextMenus.removeAll.mockImplementation((cb) => cb && cb());
        const prompts = [
            { title: 'P1', prompt: 'Content 1' } // No folder
        ];

        createContextMenus(prompts);

        expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
            id: 'ups-folder-Ungrouped',
            title: 'Ungrouped'
        }));
    });
  });

  describe('initMenus', () => {
      it('should fetch prompts from storage and create menus', () => {
          const prompts = [{ title: 'Test', prompt: 'p', folder: 'f' }];
          chrome.storage.local.get.mockImplementation((defaults, callback) => {
              callback({ prompts });
          });
          chrome.contextMenus.removeAll.mockImplementation((cb) => cb && cb());

          initMenus();

          expect(chrome.storage.local.get).toHaveBeenCalledWith({ prompts: [] }, expect.any(Function));
          expect(chrome.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({
              id: 'ups-root'
          }));
      });
  });
});
