/* WordPress reader presentation follows my_bible_app's ReaderToolbar/Settings/VerseActions. */
(() => {
    'use strict';
    window.gkbrReaderShell = function (api) {
        const { root, t, node, button, toolbar, actions, title, text, layout, tools, size, getPlace, getChapter, getBooks, loadBooks, navigate, selectVerse, loadChapter, rerender, bookmark, commentary, openDictionaries, message } = api;
        const preferencesKey = 'gkbr:reader-preferences:v1';
        const defaults = { fontSize: 19, lineHeight: 1.55, font: 'serif', night: false, verseNumbers: true, separateVerses: true, chapterLabels: true, headings: true, footnotes: true, strongNumbers: false, paragraphs: true, addedWords: true, clean: false, continuous: true, tapPaging: false, swipeChapters: false, swipeBooks: false };
        let preferences = { ...defaults }, catalogContext = null;
        try {
            const saved = JSON.parse(localStorage.getItem(preferencesKey) || '{}');
            for (const [key, value] of Object.entries(defaults)) if (typeof saved[key] === typeof value) preferences[key] = saved[key];
            preferences.fontSize = Math.max(14, Math.min(36, Number(preferences.fontSize) || 19));
            preferences.lineHeight = Math.max(1.2, Math.min(2.2, Number(preferences.lineHeight) || 1.55));
            if (!['serif', 'sans', 'slavonic'].includes(preferences.font)) preferences.font = 'serif';
        } catch { /* Optional browser preferences. */ }
        root.classList.add('gkbr-app-reader');
        const header = node('header', '', { class: 'gkbr-header' }), footer = node('nav', '', { class: 'gkbr-bottom', 'aria-label': t.reader });
        const center = node('button', '', { type: 'button', class: 'gkbr-center', 'aria-label': t.choosePlace });
        center.title = t.choosePlace;
        const editionTitle = node('small'), bookTitle = node('strong'), positionTitle = node('span'); center.append(editionTitle, bookTitle, positionTitle);
        const actionMap = new Map([...actions.querySelectorAll('button'), ...tools.querySelectorAll('button')].map(item => [item.getAttribute('aria-label'), item]));
        const core = label => actionMap.get(label);
        const previous = core(t.previous), next = core(t.next);
        previous.title = t.previous; next.title = t.next;
        core(t.commentaries)?.remove(); core(t.bookmark)?.remove();
        function icon(target, path, caption = '') {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); shape.setAttribute('d', path); svg.append(shape);
            target.replaceChildren(svg); if (caption) target.append(node('span', caption));
        }
        icon(previous, 'M20 12H4m7-7-7 7 7 7'); icon(next, 'M4 12h16m-7-7 7 7-7 7');
        const home = button(t.library, () => openLibrary(), header); home.className = 'gkbr-icon'; home.textContent = '⌂';
        icon(home, 'M3 10L12 3L21 10V21H15V14H9V21H3Z');
        center.addEventListener('click', () => openNavigation());
        header.append(previous, center);
        const grid = button(t.choosePlace, () => openNavigation(), header); grid.className = 'gkbr-icon'; grid.textContent = '▦';
        icon(grid, 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18');
        const searchButton = button(t.search, () => openSearch(), header); searchButton.className = 'gkbr-icon';
        icon(searchButton, 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16m6 14 4 4');
        const dictionaries = button(t.dictionaries, () => openDictionaries?.(), header); dictionaries.className = 'gkbr-icon';
        icon(dictionaries, 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5');
        const appearance = button(t.settings, () => showSettings(), header); appearance.className = 'gkbr-icon'; appearance.textContent = 'Aa';
        const fullscreen = button(t.fullscreen, toggleFullscreen, header); fullscreen.className = 'gkbr-icon';
        icon(fullscreen, 'M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5');
        let fullscreenDialog = null;
        function toggleFullscreen() {
            if (fullscreenDialog) { fullscreenDialog.close(); return; }
            const placeholder = node('div', '', { class: 'gkbr-fullscreen-placeholder', 'aria-hidden': 'true' });
            placeholder.style.height = root.getBoundingClientRect().height + 'px';
            const previousOverflow = document.body.style.overflow, previousScroll = window.scrollY;
            const overlay = node('dialog', '', { class: 'gkbr-fullscreen', 'aria-label': t.reader });
            root.replaceWith(placeholder);
            overlay.append(root); document.body.append(overlay);
            try { overlay.showModal(); }
            catch { placeholder.replaceWith(root); overlay.remove(); return; }
            fullscreenDialog = overlay;
            document.body.style.overflow = 'hidden';
            fullscreen.setAttribute('aria-label', t.exitFullscreen);
            fullscreen.title = t.exitFullscreen;
            icon(fullscreen, 'M9 4v5H4m11-5v5h5m0 6h-5v5M4 15h5v5');
            fullscreen.focus();
            overlay.addEventListener('close', () => {
                placeholder.replaceWith(root); overlay.remove(); fullscreenDialog = null;
                document.body.style.overflow = previousOverflow;
                window.scrollTo(0, previousScroll);
                fullscreen.setAttribute('aria-label', t.fullscreen);
                fullscreen.title = t.fullscreen;
                icon(fullscreen, 'M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5');
                fullscreen.focus();
            }, { once: true });
        }
        fullscreen.title = t.fullscreen;
        api.signal.addEventListener('abort', () => fullscreenDialog?.close(), { once: true });
        root.dataset.bottom = api.showBottom ? 'yes' : 'no';
        if (!api.showBottom) {
            const moreInHeader = button(t.moreActions, () => verseMenu(), header); moreInHeader.className = 'gkbr-icon';
            icon(moreInHeader, 'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4');
        }
        header.append(next); root.prepend(header); tools.remove();
        const query = toolbar.querySelector('input[type="search"]')?.parentElement;
        const compare = [...toolbar.querySelectorAll('select')].find(item => item.getAttribute('aria-label') === t.compare)?.parentElement;
        const toolBody = tools.querySelector('.gkbr-actions');
        const rememberControl = toolBody.querySelector('input[type="checkbox"]')?.parentElement;
        const clearAction = core(t.clear);
        const sizeLabel = size.parentElement; sizeLabel.remove();
        size.addEventListener('input', () => { preferences.fontSize = Number(size.value); applyPreferences(true); }, { signal: api.signal });
        toolbar.remove(); actions.remove();
        for (const label of [t.bookmarks, t.share]) {
            const action = core(label); if (action) footer.append(action);
        }
        const notesButton = button(t.notes, () => personal.notes(), footer); notesButton.className = 'gkbr-notes-button';
        const more = button(t.moreActions, () => verseMenu(), footer);
        icon(core(t.bookmarks), 'M6 3h12v18l-6-4-6 4z', t.bookmarks);
        icon(notesButton, 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5', t.notes);
        icon(core(t.share), 'M8 11l8-5M8 13l8 5M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6', t.nativeShare);
        icon(more, 'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4', t.moreActions);
        footer.replaceChildren(core(t.bookmarks), notesButton, core(t.share), more); root.append(footer);
        core(t.share).addEventListener('click', event => {
            event.preventDefault(); event.stopImmediatePropagation(); const chapter = getChapter(), place = getPlace(); if (!chapter) return;
            const panel = dialog(t.nativeShare), url = new URL(location.href); url.hash = '';
            for (const key of ['translation', 'book', 'chapter', 'verse']) url.searchParams.set('gkbr_' + key, place[key]);
            const input = node('input', '', { readonly: 'readonly', class: 'gkbr-share', 'aria-label': t.share }); input.value = url.href; panel.body.append(input);
            const verse = chapter.verses.find(row => Number(row.number) === Number(place.verse));
            panel.body.append(node('p', chapter.book.name + ' ' + place.chapter + ':' + place.verse), node('p', verse?.plain_text || ''));
            button(t.copyLink, async () => { try { await navigator.clipboard.writeText(url.href); message(t.saved); panel.close(); } catch { input.focus(); input.select(); } }, panel.body);
            if (navigator.share) button(t.nativeShare, async () => { try { await navigator.share({ title: chapter.book.name, text: verse?.plain_text || '', url: url.href }); panel.close(); } catch (failure) { if (failure.name !== 'AbortError') message(t.error); } }, panel.body);
        }, { capture: true, signal: api.signal });
        title.classList.add('gkbr-chapter-heading');
        function dialog(label) {
            const element = node('dialog', '', { class: 'gkbr-dialog', 'aria-label': label });
            const head = node('header'), body = node('div', '', { class: 'gkbr-dialog-body' });
            head.append(node('strong', label)); const close = () => { element.close(); element.remove(); };
            const closer = button(t.close, close, head); closer.textContent = '×';
            element.append(head, body); root.append(element);
            element.addEventListener('click', event => { if (event.target === element) close(); });
            element.addEventListener('close', () => element.remove(), { once: true }); element.showModal();
            return { element, body, close };
        }
        const personal = window.gkbrPersonalStudy({ root, t, node, button, dialog, getPlace, getChapter, loadChapter, navigate, refresh: () => rerender(), message });
        function field(parent, label, input) {
            const wrapper = node('label', label); input.setAttribute('aria-label', label); wrapper.append(input); parent.append(wrapper); return input;
        }
        function applyPreferences(save = false) {
            root.style.setProperty('--gkbr-size', preferences.fontSize + 'px'); root.style.setProperty('--gkbr-line', preferences.lineHeight);
            root.dataset.font = preferences.font;
            for (const key of ['night', 'verseNumbers', 'separateVerses', 'chapterLabels', 'clean', 'continuous']) root.dataset[key] = String(preferences[key]);
            size.value = preferences.fontSize;
            if (save) { try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)); } catch { message(t.storage); } }
        }
        function showSettings() {
            const panel = dialog(t.settings); panel.body.append(sizeLabel);
            const line = field(panel.body, t.lineHeight, node('input', '', { type: 'range', min: 1.2, max: 2.2, step: .05, value: preferences.lineHeight }));
            line.addEventListener('input', () => { preferences.lineHeight = Number(line.value); applyPreferences(true); });
            const font = field(panel.body, t.font, node('select'));
            for (const [value, label] of [['serif', t.serif], ['sans', t.sans], ['slavonic', t.slavonic]]) font.append(node('option', label, { value }));
            font.value = preferences.font; font.addEventListener('change', () => { preferences.font = font.value; applyPreferences(true); });
            const switches = node('div', '', { class: 'gkbr-switches' }); panel.body.append(switches);
            for (const key of ['night', 'chapterLabels', 'verseNumbers', 'separateVerses', 'headings', 'footnotes', 'strongNumbers', 'paragraphs', 'addedWords', 'clean', 'continuous', 'tapPaging', 'swipeChapters', 'swipeBooks']) {
                const input = field(switches, t[key], node('input', '', { type: 'checkbox' })); input.checked = preferences[key];
                input.addEventListener('change', () => { preferences[key] = input.checked; applyPreferences(true); rerender(); });
            }
            panel.body.append(node('p', t.sourceAvailable));
            if (rememberControl) panel.body.append(rememberControl);
            if (clearAction) panel.body.append(clearAction);
            panel.element.addEventListener('close', () => {
                if (rememberControl) toolBody.append(rememberControl);
                if (clearAction) toolBody.append(clearAction);
            }, { once: true });
            button(t.exportStudy, () => personal.exportData(), panel.body);
        }
        let navigationPanel = null;
        function currentPreview(selection) {
            const place = getPlace();
            return selection.translation === place.translation && selection.book === place.book && Number(selection.chapter) === Number(place.chapter) ? getChapter() : null;
        }
        function fillGrid() {
            if (!navigationPanel?.element.open) return;
            const panel = navigationPanel, grid = panel.grid, place = panel.selection, book = panel.books.find(item => item.slug === place.book);
            grid.replaceChildren(node('h4', t.chapter)); const chapters = node('div', '', { class: 'gkbr-grid' }); grid.append(chapters);
            for (let number = 1; number <= Number(book?.chapters_count || 0); number++) {
                const choice = button(String(number), async () => {
                    panel.selection.chapter = number;
                    panel.preview = currentPreview(panel.selection);
                    const requestId = ++panel.requestId;
                    fillGrid();
                    if (panel.preview) return;
                    try {
                        const result = await loadChapter(panel.selection);
                        if (!panel.element.open || requestId !== panel.requestId) return;
                        panel.preview = result.data;
                        fillGrid();
                    } catch { /* Leave the current reading in place when a chapter is unavailable. */ }
                }, chapters);
                choice.setAttribute('aria-pressed', String(number === Number(place.chapter)));
            }
            grid.append(node('h4', t.verse)); const verses = node('div', '', { class: 'gkbr-grid' }); grid.append(verses);
            for (const verse of panel.preview?.verses || []) button(String(verse.number), () => {
                const destination = { ...panel.selection, verse: Number(verse.number) };
                const current = getPlace();
                panel.close();
                if (destination.translation === current.translation && destination.book === current.book && Number(destination.chapter) === Number(current.chapter)) selectVerse(destination.verse);
                else navigate(destination, false, { translation: destination.translation, book: destination.book, chapterNumber: destination.chapter, books: panel.books, chapter: panel.preview });
            }, verses);
        }
        function openNavigation() {
            if (navigationPanel?.element.open) return;
            const panel = dialog(t.choosePlace); navigationPanel = panel;
            panel.selection = getPlace(); panel.books = getBooks(); panel.preview = getChapter(); panel.requestId = 0;
            const fields = node('div', '', { class: 'gkbr-navigation-fields' });
            const selectors = [...toolbar.querySelectorAll('select')].filter(item => [t.translation, t.book].includes(item.getAttribute('aria-label'))).map(item => item.parentElement);
            fields.append(...selectors); panel.body.append(fields);
            const [translation, book] = selectors.map(item => item.querySelector('select'));
            const chooseTranslation = async () => {
                panel.selection.translation = translation.value;
                panel.selection.book = '';
                panel.selection.chapter = 1;
                panel.preview = null;
                panel.books = [];
                book.replaceChildren();
                const requestId = ++panel.requestId;
                fillGrid();
                try {
                    const current = getPlace();
                    const books = translation.value === current.translation ? getBooks() : (await loadBooks(translation.value)).data.books;
                    if (!panel.element.open || requestId !== panel.requestId) return;
                    panel.books = books;
                    panel.selection.book = books[0]?.slug || '';
                    book.replaceChildren(...books.map(item => node('option', item.name, { value: item.slug })));
                    panel.preview = currentPreview(panel.selection);
                    fillGrid();
                } catch { /* Keep the reader on its current passage when books are unavailable. */ }
            };
            const chooseBook = () => {
                ++panel.requestId;
                panel.selection.book = book.value;
                panel.selection.chapter = 1;
                panel.preview = currentPreview(panel.selection);
                fillGrid();
            };
            translation.addEventListener('change', chooseTranslation);
            book.addEventListener('change', chooseBook);
            panel.element.addEventListener('close', () => {
                ++panel.requestId;
                translation.removeEventListener('change', chooseTranslation);
                book.removeEventListener('change', chooseBook);
                toolbar.append(...selectors);
                translation.value = getPlace().translation;
                book.replaceChildren(...getBooks().map(item => node('option', item.name, { value: item.slug })));
                book.value = getPlace().book;
                navigationPanel = null;
            }, { once: true });
            panel.grid = node('div'); panel.body.append(panel.grid); fillGrid();
        }
        function openControl(label, control) {
            const panel = dialog(label), wrapper = control.parentElement;
            panel.body.append(wrapper);
            panel.element.addEventListener('close', () => toolbar.append(wrapper), { once: true });
            return panel;
        }
        function openSearch() {
            if (!query) return;
            const input = query.querySelector('input'), searchPanel = openControl(t.search, input);
            const close = event => { if (event.key === 'Enter') searchPanel.close(); };
            input.addEventListener('keydown', close);
            searchPanel.element.addEventListener('close', () => input.removeEventListener('keydown', close), { once: true });
            input.focus();
        }
        function openLibrary() {
            const catalog = catalogContext?.catalog() || [], families = catalogContext?.families || {}, labels = catalogContext?.labels || {};
            const panel = dialog(t.library); let favoriteCodes = [], favoriteOnly = false;
            try { const saved = JSON.parse(localStorage.getItem('gkbr:favorite-translations') || '[]'); if (Array.isArray(saved)) favoriteCodes = saved.filter(value => typeof value === 'string').slice(0, 100); } catch { /* Optional preferences. */ }
            const group = field(panel.body, t.languageGroup, node('select')), language = field(panel.body, t.language, node('select'));
            group.append(node('option', t.allGroups, { value: '' }));
            [...new Set(catalog.map(item => families[item.language?.code] || 'other'))].forEach(value => group.append(node('option', labels[value] || value, { value })));
            const query = field(panel.body, t.search, node('input', '', { type: 'search' }));
            const favorites = button(t.favorites, () => { favoriteOnly = !favoriteOnly; favorites.setAttribute('aria-pressed', String(favoriteOnly)); render(); }, panel.body);
            const cards = node('div', '', { class: 'gkbr-library-cards' }); panel.body.append(cards);
            function fillLanguages() {
                language.replaceChildren(node('option', t.allLanguages, { value: '' }));
                const available = new Map(catalog.filter(item => !group.value || (families[item.language?.code] || 'other') === group.value).map(item => [item.language.code, item.language]));
                for (const [code, value] of available) language.append(node('option', value.native_name || value.name || code, { value: code })); render();
            }
            const normalize = value => String(value).normalize('NFD').replace(/\p{M}+/gu, '').toLocaleLowerCase().replaceAll('ё', 'е');
            function render() {
                const tokens = normalize(query.value).trim().split(/\s+/u).filter(Boolean); cards.replaceChildren();
                const visible = catalog.filter(item => (!group.value || (families[item.language?.code] || 'other') === group.value) && (!language.value || item.language.code === language.value)
                    && (!favoriteOnly || favoriteCodes.includes(item.code)) && tokens.every(token => normalize([item.name, item.short_name, item.language.name, item.language.native_name].join(' ')).includes(token)));
                for (const item of visible) {
                    const card = node('article'); card.append(node('h4', item.name), node('p', item.language.native_name || item.language.name));
                    card.append(node('small', item.has_old_testament && item.has_new_testament ? t.bible : !item.has_old_testament && item.has_new_testament ? t.nt : t.otherEditions));
                    button(t.open, () => { panel.close(); navigate({ translation: item.code, book: '', chapter: 1, verse: 1 }); }, card);
                    button(favoriteCodes.includes(item.code) ? t.unfavorite : t.favorite, () => {
                        favoriteCodes = favoriteCodes.includes(item.code) ? favoriteCodes.filter(code => code !== item.code) : [...favoriteCodes, item.code].slice(-100);
                        try { localStorage.setItem('gkbr:favorite-translations', JSON.stringify(favoriteCodes)); render(); } catch { message(t.storage); }
                    }, card); cards.append(card);
                }
                if (!visible.length) cards.append(node('p', t.empty));
            }
            group.addEventListener('change', fillLanguages); language.addEventListener('change', render); query.addEventListener('input', render); fillLanguages();
        }
        function verseMenu() {
            const source = getChapter(), place = getPlace();
            const panel = dialog(source ? source.book.name + ' ' + place.chapter + ':' + place.verse : t.moreActions);
            const run = handler => () => { panel.close(); handler(); };
            button(t.bookmark, run(bookmark), panel.body);
            button(t.bookmarks, run(() => core(t.bookmarks)?.click()), panel.body);
            button(t.addNote, run(() => personal.note()), panel.body);
            button(t.notes, run(() => personal.notes()), panel.body);
            button(t.share, run(() => core(t.share)?.click()), panel.body);
            button(t.compare, run(() => {
                if (!compare) return;
                const selection = compare.querySelector('select'), picker = openControl(t.compare, selection);
                const close = () => picker.close();
                selection.addEventListener('change', close);
                picker.element.addEventListener('close', () => selection.removeEventListener('change', close), { once: true });
            }), panel.body);
            button(t.references, run(() => core(t.references)?.click()), panel.body);
            button(t.history, run(() => core(t.history)?.click()), panel.body);
            button(t.commentaries, run(commentary), panel.body);
            button(t.personal, run(() => personal.personal()), panel.body);
        }
        function footnote(note) {
            const panel = dialog(t.footnotes); panel.body.append(node('p', note.body_available && note.text ? note.text : t.sourceAvailable));
        }
        function moveBook(direction) {
            const books = getBooks(), index = books.findIndex(item => item.slug === getPlace().book), book = books[index + direction];
            if (book) navigate({ ...getPlace(), book: book.slug, chapter: 1, verse: 1 });
        }
        function changeChapter(direction) {
            const place = getPlace(), book = getBooks().find(item => item.slug === place.book), number = Number(place.chapter) + direction;
            if (number >= 1 && number <= Number(book?.chapters_count)) navigate({ ...place, chapter: number, verse: 1 }); else moveBook(direction);
        }
        function update() {
            const chapter = getChapter(), place = getPlace(); if (!chapter) return;
            editionTitle.textContent = chapter.translation.name; bookTitle.textContent = chapter.book.name;
            positionTitle.textContent = t.chapter + ' ' + place.chapter + ':' + place.verse;
            title.textContent = chapter.book.name + ' · ' + t.chapter + ' ' + place.chapter;
            fillGrid();
        }
        let gesture = null;
        text.addEventListener('touchstart', event => { const touch = event.touches[0]; gesture = { x: touch.clientX, y: touch.clientY, fingers: event.touches.length }; }, { passive: true, signal: api.signal });
        text.addEventListener('touchend', event => {
            if (!gesture || !event.changedTouches.length) return;
            const touch = event.changedTouches[0], dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
            if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                if (gesture.fingers === 1 && preferences.swipeChapters) changeChapter(dx < 0 ? 1 : -1);
                if (gesture.fingers === 2 && preferences.swipeBooks) moveBook(dx < 0 ? 1 : -1);
            }
            gesture = null;
        }, { passive: true, signal: api.signal });
        text.addEventListener('click', event => {
            if (!preferences.tapPaging || String(window.getSelection() || '')) return;
            const bounds = text.getBoundingClientRect(), offset = event.clientX - bounds.left;
            if (offset < bounds.width * .12 || offset > bounds.width * .88) text.scrollBy({ top: text.clientHeight * .85 * (offset < bounds.width * .12 ? -1 : 1), behavior: 'smooth' });
        }, { signal: api.signal });
        root.addEventListener('keydown', event => {
            if (event.target.closest('input,select,textarea,dialog') || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); changeChapter(event.key === 'ArrowRight' ? 1 : -1); }
        }, { signal: api.signal });
        applyPreferences();
        return { update, verseMenu, footnote, preferences: () => preferences, marks: personal.marks, note: personal.note, personal: personal.personal, refreshPreferences: () => applyPreferences(), setCatalogContext: value => { catalogContext = value; } };
    };
})();
