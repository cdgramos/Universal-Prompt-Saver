const htmlContent = `
    <div id="groupedList"></div>
    <select id="folderSuggestions"></select>
    <input id="newTitle" />
    <input id="newFolder" />
    <textarea id="newPrompt"></textarea>
    <button id="savePrompt"></button>
    <button id="exportPrompts"></button>
    <button id="importPrompts"></button>
    <input type="file" id="importFile" />
    <span id="appVersion"></span>
`;

describe('popup.js unit tests', () => {
    // These functions are pure and don't depend on DOM being present at require time
    // provided we extract them safely.
    // However, since popup.js runs top-level code that accesses DOM, we need to mock DOM even for unit tests of pure functions
    // OR we need to load them after setting up a dummy DOM.

    let popupModule;

    beforeEach(() => {
        document.body.innerHTML = htmlContent;
        jest.resetModules();

        // Mock chrome.runtime.getManifest for the DOMContentLoaded listener
        chrome.runtime.getManifest.mockReturnValue({ version: '1.0' });

        popupModule = require('./popup');
    });

    describe('normalizeFolder', () => {
        it('should return "Ungrouped" for empty folder', () => {
            expect(popupModule.normalizeFolder('')).toBe('Ungrouped');
            expect(popupModule.normalizeFolder(null)).toBe('Ungrouped');
            expect(popupModule.normalizeFolder('   ')).toBe('Ungrouped');
        });

        it('should return "Ungrouped" if folder name is "ungrouped" (case insensitive)', () => {
            expect(popupModule.normalizeFolder('ungrouped')).toBe('Ungrouped');
            expect(popupModule.normalizeFolder('Ungrouped')).toBe('Ungrouped');
        });

        it('should return trimmed folder name', () => {
            expect(popupModule.normalizeFolder('  Work  ')).toBe('Work');
        });
    });

    describe('normalizePrompt', () => {
        it('should trim title and normalize folder', () => {
            const input = {
                title: '  My Title  ',
                prompt: 'My content',
                folder: '  Work  '
            };
            const expected = {
                title: 'My Title',
                prompt: 'My content',
                folder: 'Work'
            };
            expect(popupModule.normalizePrompt(input)).toEqual(expected);
        });
    });

    describe('groupByFolder', () => {
        it('should group prompts by folder', () => {
            const prompts = [
                { title: 'A', folder: 'Work' },
                { title: 'B', folder: 'Personal' },
                { title: 'C', folder: 'Work' }
            ].map(popupModule.normalizePrompt);

            const groups = popupModule.groupByFolder(prompts);

            expect(Object.keys(groups)).toHaveLength(2);
            expect(groups['Work']).toHaveLength(2);
            expect(groups['Personal']).toHaveLength(1);
        });
    });
});

describe('popup.js DOM integration', () => {
    beforeEach(() => {
        document.body.innerHTML = htmlContent;
        jest.resetModules();
        chrome.runtime.getManifest.mockReturnValue({ version: '1.0' });
        chrome.storage.local.get.mockClear();
        chrome.storage.local.set.mockClear();

        // Mock window.alert and confirm
        window.alert = jest.fn();
        window.confirm = jest.fn();
    });

    it('should load prompts on start', () => {
        const prompts = [{ title: 'P1', prompt: 'Content', folder: 'Work' }];
        chrome.storage.local.get.mockImplementation((defaults, cb) => cb({ prompts }));

        require('./popup'); // triggers loadPrompts()

        expect(chrome.storage.local.get).toHaveBeenCalled();
        const list = document.getElementById('groupedList');
        // Rendered async? No, synchronous inside callback.
        expect(list.innerHTML).toContain('P1');
        expect(list.innerHTML).toContain('Work');
    });

    it('should save a new prompt', () => {
        require('./popup');

        // Mock get to return empty initially
        chrome.storage.local.get.mockImplementation((defaults, cb) => cb({ prompts: [] }));

        // Fill form
        document.getElementById('newTitle').value = 'New Prompt';
        document.getElementById('newFolder').value = 'Docs';
        document.getElementById('newPrompt').value = 'Hello World';

        // Click save
        document.getElementById('savePrompt').click();

        // Verify storage set
        expect(chrome.storage.local.set).toHaveBeenCalledWith({
            prompts: [
                { title: 'New Prompt', prompt: 'Hello World', folder: 'Docs' }
            ]
        }, expect.any(Function));
    });

    it('should validate title before saving', () => {
        require('./popup');
        chrome.storage.local.get.mockImplementation((defaults, cb) => cb({ prompts: [] }));

        // Title empty
        document.getElementById('newTitle').value = '';
        document.getElementById('savePrompt').click();

        expect(window.alert).toHaveBeenCalledWith('Please enter a title.');
        expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('should populate folder suggestions', () => {
        const prompts = [{ title: 'P1', folder: 'Work' }];
        chrome.storage.local.get.mockImplementation((defaults, cb) => cb({ prompts }));

        const popup = require('./popup');
        // We can manually trigger refresh if needed, but loadPrompts calls it.

        const select = document.getElementById('folderSuggestions');
        expect(select.children.length).toBeGreaterThan(0);
        // Should contain 'Work' and 'Ungrouped'
        const options = Array.from(select.options).map(o => o.value);
        expect(options).toContain('Work');
        expect(options).toContain('Ungrouped');
    });
});
