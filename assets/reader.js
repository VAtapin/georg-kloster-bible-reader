/* Human-readable source. API content is inserted only as text or same-site images. */
(() => {
    'use strict';
    const numeric = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
    function element(tag, text, attributes = {}) {
        const node = document.createElement(tag);
        if (text !== null && text !== undefined) node.textContent = String(text);
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
        return node;
    }
    function plain(value) {
        // Decode permitted API markup into inert text; never insert it into the live document.
        const parsed = new DOMParser().parseFromString(String(value || ''), 'text/html');
        parsed.querySelectorAll('script,style').forEach(node => node.remove());
        return parsed.body.textContent || '';
    }
    const responseCache = new Map();
    async function request(config, kind, params = {}) {
        const url = new URL(config.ajax, location.href);
        url.searchParams.set('action', 'gkbr_read');
        url.searchParams.set('kind', kind);
        Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
        const reusable = kind !== 'search' && kind !== 'dictionary-entries';
        const key = url.href;
        const hit = reusable && responseCache.get(key);
        if (hit && hit.until > Date.now()) {
            responseCache.delete(key);
            responseCache.set(key, hit);
            return hit.promise;
        }
        if (hit) responseCache.delete(key);
        const pending = (async () => {
            const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
            let payload;
            try { payload = await response.json(); } catch { throw new Error(config.ui.error); }
            if (!response.ok || !payload.success) throw new Error(payload.data?.message || config.ui.error);
            return payload.data;
        })();
        if (reusable) {
            const ttl = kind === 'dictionary-entry' ? 15 * 60_000 : 60_000;
            responseCache.set(key, { promise: pending, until: Date.now() + ttl });
            if (responseCache.size > 64) responseCache.delete(responseCache.keys().next().value);
        }
        try { return await pending; }
        catch (failure) {
            if (responseCache.get(key)?.promise === pending) responseCache.delete(key);
            throw failure;
        }
    }
    function init(root) {
        if (root.dataset.initialized) return;
        root.dataset.initialized = '1';
        root.gkbrDispose?.();
        const lifecycle = new AbortController();
        root.gkbrDispose = () => lifecycle.abort();
        let config;
        try { config = JSON.parse(root.dataset.config); } catch { return; }
        const t = config.ui;
        let current = { ...config.initial }, selected = null, catalog = [], books = [], chapterData = null;
        let navigation = 0, sideRequest = 0, compareRequest = 0, dictionaryRequest = 0, studyModules = null, dictionaries = null;
        let history = [], bookmarks = [], remember = false, lastPlace = null;
        let shell = null, continuous = null;
        const dictionaryState = { module: '', query: '', letter: '', letterLabel: '', mode: 'browser', open: false };
        let dictionaryObserver = null, dictionarySearchTimer = 0, dictionaryEntryDialog = null, dictionaryEntryRequest = 0;
        lifecycle.signal.addEventListener('abort', () => continuous?.dispose());
        const storageKey = 'gkbr:' + location.pathname;
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            history = Array.isArray(saved.history) ? saved.history.slice(0, 50) : [];
            bookmarks = Array.isArray(saved.bookmarks) ? saved.bookmarks.slice(0, 100) : [];
            remember = saved.remember === true;
            lastPlace = saved.last && typeof saved.last.translation === 'string' && typeof saved.last.book === 'string' && numeric(saved.last.chapter) && numeric(saved.last.verse) ? saved.last : null;
        } catch { /* Storage is optional. */ }
        function persist() {
            try {
                localStorage.setItem(storageKey, JSON.stringify({ remember, history: remember ? history : [], bookmarks, last: lastPlace }));
                window.dispatchEvent(new CustomEvent('gkbr-storage', { detail: storageKey }));
            }
            catch { status.textContent = t.storage; }
        }
        root.replaceChildren();
        const toolbar = element('div', '', { class: 'gkbr-toolbar' });
        const actions = element('div', '', { class: 'gkbr-actions' });
        const title = element('h3');
        const status = element('p', '', { class: 'gkbr-status', role: 'status', 'aria-live': 'polite' });
        const layout = element('div', '', { class: 'gkbr-layout' });
        const main = element('div', '', { class: 'gkbr-main' });
        const text = element('div', '', { class: 'gkbr-text' });
        const dictionaryPane = element('section', '', { class: 'gkbr-dictionary', 'aria-label': t.dictionaries, hidden: true });
        const resizeHandle = element('div', '', { class: 'gkbr-side-resize', role: 'separator', tabindex: 0, 'aria-orientation': 'vertical', 'aria-label': t.study });
        const side = element('aside', '', { class: 'gkbr-side', 'aria-label': t.study });
        side.hidden = true;
        main.append(text, dictionaryPane);
        layout.append(main, resizeHandle, side);
        root.append(toolbar, actions, title, status, layout);
        function control(label, node) {
            node.setAttribute('aria-label', label);
            const wrapper = element('label', label);
            wrapper.append(node); toolbar.append(wrapper); return node;
        }
        function button(label, handler, parent = actions) {
            const node = element('button', label, { type: 'button', 'aria-label': label });
            node.title = label;
            node.addEventListener('click', handler); parent.append(node); return node;
        }
        function options(select, rows, value, label, initial = '') {
            select.replaceChildren();
            rows.forEach(row => select.append(element('option', label(row), { value: value(row) })));
            if ([...select.options].some(option => option.value === String(initial))) select.value = String(initial);
        }
        const translationSelect = control(t.translation, element('select'));
        const bookSelect = control(t.book, element('select'));
        const compareSelect = control(t.compare, element('select'));
        const queryInput = control(t.search, element('input', '', { type: 'search', maxlength: 500 }));
        queryInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); search(0); } });
        const previous = button(t.previous, () => navigate({ ...current, chapter: current.chapter - 1, verse: 1 }));
        const next = button(t.next, () => navigate({ ...current, chapter: current.chapter + 1, verse: 1 }));
        const size = element('input', '', { type: 'range', min: 16, max: 36, value: 20 });
        control(t.size, size);
        size.addEventListener('input', () => root.style.setProperty('--gkbr-size', size.value + 'px'));
        button(t.commentaries, () => study('commentaries'));
        button(t.references, () => study('references'));
        button(t.dictionaries, () => openDictionaryView());
        function saveBookmark() {
            if (!selected) { status.textContent = t.study; return; }
            const item = { ...current, verse: selected.number, label: title.textContent + ':' + selected.number };
            const key = placeKey(item);
            bookmarks = [item, ...bookmarks.filter(row => placeKey(row) !== key)].slice(0, 100); persist(); status.textContent = t.bookmarks;
        }
        button(t.bookmark, saveBookmark);
        button(t.bookmarks, () => showPlaces(bookmarks, t.bookmarks));
        button(t.history, () => showPlaces(history, t.history));
        button(t.share, () => {
            if (!selected) { status.textContent = t.study; return; }
            const url = new URL(location.href);
            url.hash = '';
            const position = { ...current, verse: selected.number };
            ['translation', 'book', 'chapter', 'verse'].forEach(key => url.searchParams.set('gkbr_' + key, position[key]));
            const box = element('input', '', { class: 'gkbr-share', readonly: 'readonly', 'aria-label': t.share });
            box.value = url.href; openSide(t.share); side.append(box); box.focus(); box.select();
        });
        const rememberInput = element('input', '', { type: 'checkbox' }); rememberInput.checked = remember;
        const rememberLabel = element('label', t.remember); rememberLabel.prepend(rememberInput); actions.append(rememberLabel);
        rememberInput.addEventListener('change', () => { remember = rememberInput.checked; if (!remember) history = []; persist(); });
        function syncStorage(event) {
            if (event.key !== storageKey && event.detail !== storageKey) return;
            try {
                const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
                history = Array.isArray(saved.history) ? saved.history.slice(0, 50) : [];
                bookmarks = Array.isArray(saved.bookmarks) ? saved.bookmarks.slice(0, 100) : [];
                remember = saved.remember === true; rememberInput.checked = remember;
            } catch { /* Optional storage remains local to the reader. */ }
        }
        window.addEventListener('storage', syncStorage, { signal: lifecycle.signal });
        window.addEventListener('gkbr-storage', syncStorage, { signal: lifecycle.signal });
        button(t.clear, () => {
            history = []; bookmarks = []; remember = false; rememberInput.checked = false;
            try { localStorage.removeItem(storageKey); window.dispatchEvent(new CustomEvent('gkbr-storage', { detail: storageKey })); }
            catch { status.textContent = t.storage; }
        });
        const localNote = element('p', t.local, { class: 'gkbr-note' }); root.append(localNote);
        function arrangeTools() {
            const details = element('details', '', { class: 'gkbr-tools' });
            const menu = element('div', '', { class: 'gkbr-actions' });
            details.append(element('summary', t.tools), menu);
            [...actions.children].forEach(node => {
                if (![t.open, t.search, t.previous, t.next].includes(node.getAttribute('aria-label'))) menu.append(node);
            });
            root.insertBefore(details, title);
            shell = window.gkbrReaderShell({ root, t, node: element, button, toolbar, actions, title, text, layout, tools: details, size, showBottom: config.bottom !== false,
                getPlace: () => ({ ...current }), getChapter: () => chapterData ? { ...chapterData, book: { ...books.find(book => book.slug === current.book), ...chapterData.book } } : null, getBooks: () => books,
                loadBooks: translation => request(config, 'books', { translation }), navigate, selectVerse,
                loadChapter: position => request(config, 'chapter', { translation: position.translation, book: position.book, chapter: position.chapter }), rerender: () => { renderVerses(); selectVerse(current.verse, false); compare(); },
                bookmark: saveBookmark, commentary: () => study('commentaries'), openDictionaries: openDictionaryView,
                message: value => { status.textContent = value; }, signal: lifecycle.signal });
            shell.setCatalogContext({ catalog: () => catalog, families: config.families, labels: config.groupLabels });
        }
        if (config.passage) {
            toolbar.hidden = true; rememberLabel.hidden = true; localNote.hidden = true;
            const fullButtons = [...actions.querySelectorAll('button')];
            const passageTools = [t.commentaries, t.references, t.share];
            fullButtons.forEach(node => { node.hidden = !passageTools.includes(node.getAttribute('aria-label')); });
            const expand = button(t.fullChapter, () => {
                config.passage = false; config.from = 0; config.to = 0;
                toolbar.hidden = false; rememberLabel.hidden = false; localNote.hidden = false;
                fullButtons.forEach(node => { node.hidden = false; }); expand.hidden = true;
                arrangeTools();
                navigate(current);
            });
        } else arrangeTools();
        function placeKey(row) { return [row.translation, row.book, row.chapter, row.verse].join(':'); }
        function record() {
            if (config.passage) return;
            lastPlace = { ...current };
            if (!remember) { persist(); return; }
            const item = { ...current, label: title.textContent + ':' + (current.verse || 1) };
            history = [item, ...history.filter(row => placeKey(row) !== placeKey(item))].slice(0, 50); persist();
        }
        function openSide(label) {
            side.hidden = false; resizeHandle.hidden = false; side.replaceChildren();
            const header = element('div', '', { class: 'gkbr-actions' });
            header.append(element('strong', label)); button(t.close, () => { ++sideRequest; side.hidden = true; resizeHandle.hidden = true; }, header); side.append(header);
        }
        resizeHandle.hidden = true;
        resizeHandle.setAttribute('aria-valuemin', '22'); resizeHandle.setAttribute('aria-valuemax', '55'); resizeHandle.setAttribute('aria-valuenow', '32');
        try {
            const width = Number(localStorage.getItem('gkbr:study-pane-width:v1'));
            if (Number.isFinite(width) && width >= 22 && width <= 55) { layout.style.setProperty('--gkbr-side-width', width + '%'); resizeHandle.setAttribute('aria-valuenow', String(width)); }
        } catch { /* Pane size is an optional local preference. */ }
        function setSideWidth(clientX) {
            const bounds = layout.getBoundingClientRect();
            if (bounds.width < 760) return;
            const width = Math.max(22, Math.min(55, (bounds.right - clientX) / bounds.width * 100));
            layout.style.setProperty('--gkbr-side-width', width + '%');
            resizeHandle.setAttribute('aria-valuenow', String(Math.round(width)));
            try { localStorage.setItem('gkbr:study-pane-width:v1', String(Math.round(width))); } catch { /* The current session still works. */ }
        }
        resizeHandle.addEventListener('pointerdown', event => {
            if (side.hidden || event.pointerType === 'touch') return;
            event.preventDefault(); resizeHandle.setPointerCapture(event.pointerId); setSideWidth(event.clientX);
        }, { signal: lifecycle.signal });
        resizeHandle.addEventListener('pointermove', event => {
            if (event.buttons && !side.hidden) setSideWidth(event.clientX);
        }, { signal: lifecycle.signal });
        resizeHandle.addEventListener('keydown', event => {
            if (side.hidden || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault(); const bounds = layout.getBoundingClientRect();
            setSideWidth(event.key === 'ArrowLeft' ? bounds.right - bounds.width * .03 : bounds.right + bounds.width * .03);
        }, { signal: lifecycle.signal });
        function error(target, message, retry) {
            target.replaceChildren(element('p', message));
            if (retry) button(t.retry, retry, target);
        }
        async function navigate(position, initial = false, preload = null) {
            continuous?.dispose(); continuous = null;
            const version = ++navigation; ++sideRequest; ++compareRequest;
            status.textContent = t.loading; selected = null; side.hidden = true; resizeHandle.hidden = true;
            // Locations coming from personal records must never carry note text into HTTP URLs.
            current = Object.fromEntries(['translation', 'book', 'chapter', 'verse'].map(key => [key, ['string', 'number'].includes(typeof position[key]) ? position[key] : current[key]]));
            if (!catalog.some(row => row.code === current.translation)) { status.textContent = t.empty; error(text, t.empty); return; }
            translationSelect.value = current.translation;
            try {
                const result = preload?.translation === current.translation && Array.isArray(preload.books)
                    ? { data: { books: preload.books } } : await request(config, 'books', { translation: current.translation });
                if (version !== navigation) return;
                books = result.data.books;
                if (!current.book) current.book = books[0]?.slug;
                else if (!books.some(book => book.slug === current.book)) { status.textContent = t.empty; error(text, t.empty); return; }
                if (!current.book) { text.replaceChildren(element('p', t.empty)); status.textContent = ''; return; }
                const book = books.find(book => book.slug === current.book);
                options(bookSelect, books, row => row.slug, row => row.name, current.book);
                current.chapter = Math.min(Math.max(1, numeric(current.chapter)), Number(book.chapters_count));
                previous.disabled = current.chapter <= 1; next.disabled = current.chapter >= Number(book.chapters_count);
                const chapter = preload?.translation === current.translation && preload.book === current.book
                    && Number(preload.chapterNumber) === Number(current.chapter) && preload.chapter?.verses
                    ? { data: preload.chapter } : await request(config, 'chapter', current);
                if (version !== navigation) return;
                chapterData = chapter.data;
                title.textContent = chapterData.book.name + ' ' + chapterData.chapter.number + ' · ' + chapterData.translation.name;
                text.lang = chapterData.translation.language?.code || '';
                text.dir = ['he', 'ar', 'syr', 'fa', 'ur'].includes(text.lang) ? 'rtl' : 'auto';
                renderVerses(); shell?.update(); status.textContent = '';
                selectVerse(current.verse || chapterData.verses[0]?.number, !initial);
                await compare();
            } catch (failure) {
                if (version !== navigation) return;
                status.textContent = failure.message; error(text, failure.message, () => navigate(position, initial));
            }
        }
        function visibleVerses() {
            return (chapterData?.verses || []).filter(row => !config.passage || ((!config.from || row.number >= config.from) && (!config.to || row.number <= config.to)));
        }
        function renderVerses() {
            continuous?.dispose(); continuous = null;
            if (!chapterData) return;
            if (shell?.preferences().continuous && !config.passage && !compareSelect.value) {
                continuous = window.gkbrContinuousReader({ root: text, initial: { ...current }, source: chapterData, books, renderPage,
                    activate: activatePage, loadChapter: position => request(config, 'chapter', position), label: t.next, failure: value => { status.textContent = value; } });
            } else text.replaceChildren(renderPage({ ...current }, chapterData, true));
        }
        function activatePage(position, source, selectedByUser = true) {
            if (current.book !== position.book || Number(current.chapter) !== Number(position.chapter)) {
                ++sideRequest; selected = null; chapterData = source; current = { ...current, ...position, verse: source.verses[0]?.number || position.verse };
                text.querySelectorAll('[aria-pressed=true]').forEach(row => row.setAttribute('aria-pressed', 'false'));
                const book = books.find(item => item.slug === current.book); bookSelect.value = current.book;
                previous.disabled = current.chapter <= 1; next.disabled = current.chapter >= Number(book?.chapters_count);
                shell?.update(); if (selectedByUser) side.hidden = true;
            }
        }
        function renderPage(position, source, single = false) {
            const page = element('section', '', { class: 'gkbr-chapter-page' });
            if (!single) page.append(element('h4', source.book.name + ' · ' + t.chapter + ' ' + source.chapter.number, { class: 'gkbr-page-heading' }));
            const verses = source.verses.filter(row => !config.passage || ((!config.from || row.number >= config.from) && (!config.to || row.number <= config.to)));
            verses.forEach(verse => {
                const row = element('div', '', { role: 'button', tabindex: 0, class: 'gkbr-verse', 'data-number': verse.number, 'data-verse': verse.id, 'aria-pressed': 'false' });
                row.dataset.location = [position.translation, position.book, position.chapter].join(':');
                const displayed = { ...verse, plain_text: verse.plain_text ?? plain(verse.text) };
                const prefs = shell?.preferences() || { clean: false, paragraphs: true, headings: true, footnotes: true, strongNumbers: true, addedWords: true };
                const choose = () => { activatePage(position, source); selectVerse(verse.number, false); };
                const sourceText = window.gkbrSourceText(displayed, prefs, shell?.marks(displayed, position) || [], {
                    noteLabel: t.footnotes, footnote: note => { if (shell) shell.footnote(note); else { openSide(t.footnotes); side.append(element('p', note.text || t.sourceAvailable)); } }, strong: number => { choose(); strongEntry(number); } });
                while (sourceText.firstElementChild?.classList.contains('gkbr-source-heading')) page.append(sourceText.firstElementChild);
                row.append(element('span', verse.number, { class: 'gkbr-num' }), sourceText);
                row.addEventListener('click', choose); page.append(row);
                row.addEventListener('contextmenu', event => { event.preventDefault(); choose(); shell?.verseMenu(); });
                row.addEventListener('dblclick', () => { choose(); shell?.verseMenu(); });
                row.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key) && event.target === row) { event.preventDefault(); choose(); shell?.verseMenu(); } });
            });
            if (!verses.length) page.append(element('p', t.empty)); return page;
        }
        function selectVerse(number, scroll = true) {
            if (selected && Number(selected.number) !== Number(number)) ++sideRequest;
            selected = visibleVerses().find(row => Number(row.number) === Number(number)) || null;
            if (!selected) { status.textContent = t.empty; return; }
            current.verse = selected.number;
            text.querySelectorAll('[data-number]').forEach(row => {
                const active = row.dataset.location === [current.translation, current.book, current.chapter].join(':') && Number(row.dataset.number) === Number(selected.number); row.setAttribute('aria-pressed', String(active));
                if (active && scroll) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }); shell?.update(); record();
        }
        async function compare() {
            const second = compareSelect.value, version = ++compareRequest, nav = navigation;
            if (second && continuous) { continuous.dispose(); continuous = null; text.replaceChildren(renderPage({ ...current }, chapterData, true)); selectVerse(current.verse, false); }
            if (!second && shell?.preferences().continuous && !continuous && chapterData) { renderVerses(); selectVerse(current.verse, false); }
            text.querySelectorAll('.gkbr-comparison').forEach(row => row.remove()); root.dataset.comparing = String(Boolean(second));
            if (!second || !chapterData) return;
            try {
                const ids = visibleVerses().map(row => row.id);
                const response = await request(config, 'locations', { translation: second, verses: ids.join(',') });
                if (version !== compareRequest || nav !== navigation) return;
                const locations = response.data;
                const chapters = new Map();
                for (const spot of locations) {
                    const key = spot.book_slug + ':' + spot.chapter_number;
                    if (!chapters.has(key)) chapters.set(key, request(config, 'chapter', { translation: second, book: spot.book_slug, chapter: spot.chapter_number }));
                }
                const results = await Promise.all([...chapters].map(async ([key, value]) => [key, (await value).data]));
                if (version !== compareRequest || nav !== navigation) return;
                const loaded = new Map(results);
                visibleVerses().forEach(verse => {
                    const matches = locations.filter(spot => Number(spot.verse_id) === Number(verse.id));
                    let label = '';
                    if (matches.length === 1) {
                        const spot = matches[0], other = loaded.get(spot.book_slug + ':' + spot.chapter_number);
                        const candidates = other?.verses.filter(row => Number(row.id) === Number(verse.id)) || [];
                        if (candidates.length === 1) label = spot.verse_number + ' · ' + (candidates[0].plain_text ?? plain(candidates[0].text));
                    }
                    const row = text.querySelector('[data-verse="' + numeric(verse.id) + '"]');
                    const line = element('span', label, { class: 'gkbr-comparison', lang: catalog.find(item => item.code === second)?.language?.code || '', dir: 'auto' }); row?.append(line);
                });
            } catch { /* An unavailable comparison leaves an empty parallel column. */ }
        }
        async function resolveAndOpen(id) {
            const version = navigation;
            try {
                const result = await request(config, 'locations', { translation: current.translation, verses: id });
                if (version !== navigation) return;
                if (result.data.length !== 1) return;
                const place = result.data[0]; navigate({ ...current, book: place.book_slug, chapter: place.chapter_number, verse: place.verse_number });
            } catch { /* The reference remains in the current chapter. */ }
        }
        async function search(offset) {
            const version = ++sideRequest, query = queryInput.value.trim(), translation = current.translation;
            openSide(t.search); side.append(element('p', t.loading));
            try {
                const result = await request(config, 'search', { translation, q: query, offset });
                if (version !== sideRequest) return;
                openSide(t.search);
                result.data.results.forEach(row => {
                    const node = button(row.reference, () => resolveAndOpen(row.verse_id), side); node.className = 'gkbr-result'; node.append(element('span', row.snippet || plain(row.text)));
                });
                if (!result.data.results.length) side.append(element('p', t.empty));
                if (result.data.has_more) button(t.more, () => search(offset + 20), side);
            } catch (failure) { if (version === sideRequest) error(side, failure.message, () => search(offset)); }
        }
        function showPlaces(rows, label) {
            ++sideRequest; openSide(label);
            rows.forEach(row => {
                if (!catalog.some(item => item.code === row.translation)) return;
                button(row.label || [row.book, row.chapter, row.verse].join(':'), () => navigate(row), side);
            });
            if (!rows.length) side.append(element('p', t.empty));
        }
        async function study(kind) {
            if (!selected) { status.textContent = t.study; return; }
            const verse = selected.id, version = ++sideRequest, translation = current.translation;
            openSide(t[kind] || t.strong);
            if (kind !== 'references') side.append(element('p', t.loading));
            try {
                if (kind === 'commentaries') {
                    studyModules ||= (await request(config, 'commentary-modules')).data;
                    if (version !== sideRequest) return;
                    openSide(t.commentaries);
                    const select = element('select', '', { 'aria-label': t.module });
                    options(select, [{ code: '', name: t.none }, ...studyModules], row => row.code, row => row.name + (row.language_name ? ' · ' + row.language_name : ''));
                    const contents = element('div'); side.append(select, contents);
                    // No commentary in another language is selected silently.
                    const initial = studyModules.find(row => row.code === 'OPTINA_COMMENTARIES' && chapterData.translation.language?.code === 'ru');
                    async function load() {
                        const token = ++sideRequest, module = select.value; contents.replaceChildren(); if (!module) return;
                        try {
                            const result = await request(config, 'commentaries', { verse, module }); if (token !== sideRequest) return;
                            result.data.entries.forEach(entry => { const article = element('article'); article.append(element('h4', entry.title || entry.module_name), element('p', entry.body ?? plain(entry.content))); contents.append(article); });
                            if (!result.data.entries.length) contents.append(element('p', t.empty));
                        } catch (failure) { if (token === sideRequest) error(contents, failure.message, load); }
                    }
                    select.addEventListener('change', load); if (initial) { select.value = initial.code; load(); }
                } else if (kind === 'references') {
                    const result = await request(config, 'references', { verse, translation }); if (version !== sideRequest) return;
                    openSide(t.references);
                    const language = String(chapterData.translation.language?.code || '').toLowerCase().split(/[-_]/u)[0];
                    const references = result.data.references.filter(row => language === 'ru' || !['legacy_quote', 'tsk', 'tsk2'].includes(String(row.source || '').toLowerCase())).slice(0, 12);
                    const rows = references.map(row => ({ row, target: window.gkbrReferenceTarget(row, result.data, { id: verse, osis_ref: selected?.osis_ref, translation }) }));
                    const ids = [...new Set(rows.filter(item => !item.target?.text).map(item => numeric(item.row.target?.verse_id)).filter(Boolean))];
                    let locations = [];
                    try { if (ids.length) locations = (await request(config, 'locations', { translation, verses: ids.join(',') })).data; }
                    catch { /* A reference without readable text is omitted. */ }
                    if (version !== sideRequest) return;
                    const byId = new Map();
                    for (const location of locations) {
                        const id = numeric(location.verse_id);
                        if (!byId.has(id)) byId.set(id, []);
                        byId.get(id).push(location);
                    }
                    const places = new Map();
                    for (const [id, matches] of byId) if (matches.length === 1 && typeof matches[0].book_slug === 'string' && numeric(matches[0].chapter_number)) places.set(id, matches[0]);
                    const chapters = new Map();
                    const keys = [...new Set([...places.values()].map(place => place.book_slug + ':' + place.chapter_number))];
                    for (let offset = 0; offset < keys.length; offset += 3) {
                        const batch = await Promise.allSettled(keys.slice(offset, offset + 3).map(async key => {
                            const place = [...places.values()].find(row => row.book_slug + ':' + row.chapter_number === key);
                            return [key, (await request(config, 'chapter', { translation, book: place.book_slug, chapter: place.chapter_number })).data];
                        }));
                        if (version !== sideRequest) return;
                        for (const item of batch) if (item.status === 'fulfilled') chapters.set(...item.value);
                    }
                    for (const { row, target } of rows) {
                        let label = target?.reference || row.target?.reference;
                        let verseText = target?.text ? plain(target.text).trim() : '';
                        if (!verseText) {
                            const place = places.get(numeric(row.target?.verse_id));
                            const chapter = place && chapters.get(place.book_slug + ':' + place.chapter_number);
                            const found = chapter?.verses?.find(item => Number(item.id) === Number(row.target?.verse_id));
                            verseText = plain(found?.plain_text ?? found?.text).trim();
                            if (verseText) label = chapter.book.name + ' ' + chapter.chapter.number + ':' + place.verse_number;
                        }
                        if (!verseText || !label) continue;
                        const article = element('article', '', { class: 'gkbr-reference' });
                        if (target) button(label, () => row.resolution ? navigate({ translation, book: target.book_slug, chapter: target.chapter_number, verse: target.verse_number }) : resolveAndOpen(target.verse_id), article);
                        else article.append(element('strong', label));
                        article.append(element('p', verseText)); side.append(article);
                    }
                } else {
                    const result = await request(config, 'tokens', { verse, translation }); if (version !== sideRequest) return;
                    openSide(t.strong);
                    result.data.tokens.forEach(token => button(token.strong_number, async () => {
                        const id = ++sideRequest;
                        try {
                            const entry = await request(config, 'strong', { verse, translation, number: token.strong_number }); if (id !== sideRequest) return;
                            openSide(t.strong); side.append(element('h4', [entry.data.number, entry.data.word, entry.data.transliteration].filter(Boolean).join(' · ')), element('p', plain(entry.data.content)));
                            button(t.strong, () => study('strong'), side);
                        } catch (failure) { if (id === sideRequest) error(side, failure.message); }
                    }, side));
                    if (!result.data.tokens.length) side.append(element('p', t.empty));
                }
            } catch (failure) {
                if (version !== sideRequest) return;
                if (kind === 'references') openSide(t.references);
                else error(side, failure.message, () => study(kind));
            }
        }
        async function strongEntry(number) {
            const version = ++sideRequest;
            openSide(number); side.append(element('p', t.loading));
            try {
                const result = await request(config, 'strong', { number, verse: selected?.id, translation: current.translation }); if (version !== sideRequest) return;
                openSide(number); side.append(element('p', [result.data.word, result.data.transliteration, plain(result.data.content)].filter(Boolean).join('\n')));
            } catch (failure) { if (version === sideRequest) error(side, failure.message, () => strongEntry(number)); }
        }
        function showDictionaryPane() {
            dictionaryState.open = true;
            text.hidden = true;
            dictionaryPane.hidden = false;
            resizeHandle.hidden = side.hidden;
        }
        function returnToBible() {
            ++dictionaryRequest;
            clearTimeout(dictionarySearchTimer); dictionarySearchTimer = 0;
            dictionaryObserver?.disconnect(); dictionaryObserver = null;
            dictionaryState.open = false;
            dictionaryPane.hidden = true;
            text.hidden = false;
        }
        function openDictionaryView() {
            dictionaryBrowser();
        }
        async function dictionaryBrowser() {
            showDictionaryPane();
            clearTimeout(dictionarySearchTimer); dictionarySearchTimer = 0;
            dictionaryObserver?.disconnect(); dictionaryObserver = null;
            const version = ++dictionaryRequest;
            dictionaryState.mode = 'browser';
            dictionaryPane.replaceChildren();
            const header = element('div', '', { class: 'gkbr-dictionary-toolbar' });
            header.append(element('strong', t.dictionaries));
            button(t.reader, returnToBible, header);
            dictionaryPane.append(header, element('p', t.loading));
            try {
                dictionaries ||= (await request(config, 'dictionaries')).data;
                if (version !== dictionaryRequest) return;
                const modules = dictionaries.filter(row => row.kind !== 'word_forms');
                const controls = element('div', '', { class: 'gkbr-dictionary-controls' });
                const select = element('select', '', { 'aria-label': t.module });
                options(select, modules, row => row.code, row => row.name + (row.language_name ? ' · ' + row.language_name : ''));
                if (dictionaryState.module && modules.some(row => row.code === dictionaryState.module)) select.value = dictionaryState.module;
                else if (modules[0]) select.value = modules[0].code;
                else dictionaryState.module = select.value;
                dictionaryState.module = select.value;
                const input = element('input', '', { type: 'search', maxlength: 120, 'aria-label': t.search, placeholder: t.search });
                input.setAttribute('aria-autocomplete', 'list');
                input.value = dictionaryState.query;
                controls.prepend(select, input);
                const alphabet = element('nav', '', { class: 'gkbr-dictionary-alphabet', 'aria-label': t.dictionaries });
                const results = element('div', '', { class: 'gkbr-dictionary-results', role: 'listbox' });
                dictionaryPane.replaceChildren(header, controls, alphabet, results);
                let scrollListener = null;
                function alphabetFor(module) {
                    const code = String(module?.language_code || '').toLowerCase().split(/[-_]/u)[0];
                    if (/strong|стронг/iu.test(String(module?.code || '') + ' ' + String(module?.name || ''))) return null;
                    const alphabets = {
                        ru: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
                        uk: 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ',
                        pl: 'AĄBCĆDEĘFGHIJKLŁMNŃOÓPRSŚTUWYZŹŻ',
                        de: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ',
                        en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
                    };
                    return alphabets[code] ? [...alphabets[code]] : null;
                }
                function clearPagination() {
                    dictionaryObserver?.disconnect(); dictionaryObserver = null;
                    if (scrollListener) dictionaryPane.removeEventListener('scroll', scrollListener);
                    scrollListener = null;
                }
                async function renderAlphabet() {
                    clearPagination(); ++dictionaryRequest;
                    const token = dictionaryRequest;
                    dictionaryState.mode = 'browser';
                    alphabet.replaceChildren(); results.replaceChildren();
                    const module = modules.find(row => row.code === select.value);
                    const addLetter = (label, value) => {
                        const choice = button(label, () => {
                            clearTimeout(dictionarySearchTimer); dictionarySearchTimer = 0;
                            dictionaryState.query = ''; dictionaryState.letter = String(value); dictionaryState.letterLabel = label; input.value = '';
                            loadEntries('letter', String(value), label);
                        }, alphabet);
                        choice.dataset.value = String(value);
                        choice.setAttribute('aria-pressed', String(String(value) === dictionaryState.letter));
                    };
                    const code = String(module?.language_code || '').toLowerCase().split(/[-_]/u)[0];
                    if (code === 'cu' && module?.kind === 'lexicon') {
                        try {
                            const result = await request(config, 'dictionary-alphabet', { module: select.value });
                            if (token !== dictionaryRequest || !dictionaryState.open) return;
                            (Array.isArray(result.data) ? result.data : []).forEach(row => addLetter(row.label, row.chapter));
                            if (!alphabet.childElementCount) loadEntries('browse', '');
                        } catch (failure) {
                            if (token === dictionaryRequest) error(results, failure.message, () => { void renderAlphabet(); });
                        }
                        return;
                    }
                    const letters = alphabetFor(module);
                    if (!letters) {
                        dictionaryState.letter = ''; dictionaryState.letterLabel = '';
                        loadEntries('browse', '');
                        return;
                    }
                    letters.forEach(letter => addLetter(letter, letter));
                }
                function loadEntries(mode, term, label = term) {
                    clearPagination();
                    const token = ++dictionaryRequest, module = select.value;
                    const moduleRow = modules.find(row => row.code === module);
                    const language = String(moduleRow?.language_code || '').toLowerCase();
                    const cuLexicon = language.split(/[-_]/u)[0] === 'cu' && moduleRow?.kind === 'lexicon';
                    alphabet.lang = language; results.lang = language;
                    dictionaryState.module = module; dictionaryState.mode = mode;
                    dictionaryState.query = mode === 'search' ? term : '';
                    dictionaryState.letter = mode === 'letter' ? String(term) : '';
                    dictionaryState.letterLabel = mode === 'letter' ? label : '';
                    if (mode === 'search') alphabet.replaceChildren();
                    else alphabet.querySelectorAll('button').forEach(choice => { choice.setAttribute('aria-pressed', choice.dataset.value === String(term) ? 'true' : 'false'); });
                    results.replaceChildren();
                    const list = element('div', '', { class: 'gkbr-dictionary-results-list' });
                    const sentinel = element('p', t.loading, { class: 'gkbr-dictionary-sentinel', 'aria-live': 'polite' });
                    results.append(list, sentinel);
                    let offset = 0, total = Infinity, busy = false, done = false;
                    async function loadNext() {
                        if (busy || done) return;
                        sentinel.replaceChildren(element('span', t.loading));
                        busy = true;
                        try {
                            do {
                                let result;
                                if (cuLexicon) {
                                    const params = { module, offset };
                                    if (mode === 'letter') params.letter = term;
                                    else params.q = term;
                                    result = await request(config, 'dictionary-search', params);
                                } else result = await request(config, 'dictionary-entries', { module, q: term, offset });
                                if (token !== dictionaryRequest || !dictionaryState.open) return;
                                const rows = Array.isArray(result.data) ? result.data : [];
                                if (!rows.length) done = true;
                                offset += rows.length; total = Number(result.total || 0);
                                const matches = mode === 'letter' && !cuLexicon
                                    ? rows.filter(row => String(row.topic || '').trim().normalize('NFC').toLocaleUpperCase().startsWith(String(term).toLocaleUpperCase()))
                                    : rows;
                                matches.forEach(row => {
                                    const choice = button(row.topic || row.headword, () => dictionaryEntry(module, row.key || row.id), list);
                                    choice.setAttribute('role', 'option');
                                });
                                if (offset >= total || offset >= 10000) done = true;
                                if (mode !== 'letter' || list.childElementCount >= 20 || done) break;
                            } while (token === dictionaryRequest);
                            if (token !== dictionaryRequest) return;
                            busy = false;
                            if (done) {
                                dictionaryObserver?.disconnect(); dictionaryObserver = null;
                                sentinel.remove();
                                if (!list.childElementCount) results.replaceChildren(element('p', t.empty));
                            } else if (!dictionaryObserver && window.IntersectionObserver) {
                                dictionaryObserver = new IntersectionObserver(entries => {
                                    if (entries.some(entry => entry.isIntersecting)) loadNext();
                                }, { root: dictionaryPane, rootMargin: '220px' });
                                dictionaryObserver.observe(sentinel);
                            }
                        } catch (failure) {
                            if (token !== dictionaryRequest) return;
                            dictionaryObserver?.disconnect(); dictionaryObserver = null;
                            busy = false; error(sentinel, failure.message, loadNext);
                        }
                    }
                    if (window.IntersectionObserver) {
                        dictionaryObserver = new IntersectionObserver(entries => {
                            if (entries.some(entry => entry.isIntersecting)) loadNext();
                        }, { root: dictionaryPane, rootMargin: '220px' });
                        dictionaryObserver.observe(sentinel);
                    } else {
                        scrollListener = () => {
                            if (dictionaryPane.scrollTop + dictionaryPane.clientHeight >= dictionaryPane.scrollHeight - 240) loadNext();
                        };
                        dictionaryPane.addEventListener('scroll', scrollListener, { passive: true });
                    }
                    loadNext();
                }
                select.addEventListener('change', () => {
                    dictionaryState.module = select.value; dictionaryState.query = ''; dictionaryState.letter = ''; dictionaryState.letterLabel = '';
                    input.value = ''; void renderAlphabet();
                });
                input.addEventListener('input', () => {
                    clearTimeout(dictionarySearchTimer); dictionaryState.query = input.value.trim();
                    if (!dictionaryState.query) { void renderAlphabet(); return; }
                    dictionarySearchTimer = setTimeout(() => loadEntries('search', dictionaryState.query), 250);
                });
                input.addEventListener('keydown', event => {
                    if (event.key === 'Enter' && input.value.trim()) { event.preventDefault(); clearTimeout(dictionarySearchTimer); loadEntries('search', input.value.trim()); }
                });
                if (!modules.length) { alphabet.replaceChildren(); results.replaceChildren(element('p', t.empty)); }
                else if (dictionaryState.query) loadEntries('search', dictionaryState.query);
                else {
                    const selectedLetter = dictionaryState.letter, selectedLabel = dictionaryState.letterLabel;
                    await renderAlphabet();
                    if (selectedLetter) loadEntries('letter', selectedLetter, selectedLabel);
                }
            } catch (failure) { if (version === dictionaryRequest) error(dictionaryPane, failure.message, dictionaryBrowser); }
        }
        const dictionaryAliases = {
            genesis:['Быт','Бытие','Быт.','Gen','Genesis'], exodus:['Исх','Исход','Исх.','Ex','Exod','Exodus'], leviticus:['Лев','Левит','Лев.','Lev','Leviticus'], numbers:['Чис','Числа','Чис.','Num','Numbers'], deuteronomy:['Втор','Второзаконие','Втор.','Deut','Deuteronomy'],
            joshua:['Нав','Иисус Навин','Нав.','Josh','Joshua'], judges:['Суд','Судьи','Суд.','Judg','Judges'], ruth:['Руф','Руфь','Руф.','Ruth'], '1-samuel':['1 Цар','1Цар','1 Царств','1 Sam','1 Samuel'], '2-samuel':['2 Цар','2Цар','2 Царств','2 Sam','2 Samuel'], '1-kings':['3 Цар','3Цар','3 Царств','1 Kings'], '2-kings':['4 Цар','4Цар','4 Царств','2 Kings'],
            '1-chronicles':['1 Пар','1Пар','1 Паралипоменон','1 Chron'], '2-chronicles':['2 Пар','2Пар','2 Паралипоменон','2 Chron'], ezra:['Езд','Ездра','Езд.','Ezra'], nehemiah:['Неем','Неемия','Неем.','Neh'], esther:['Есф','Есфирь','Есф.','Esther'], job:['Иов','Иов.','Job'], psalms:['Пс','Псалом','Псалмы','Пс.','Ps','Psalm'], proverbs:['Прит','Притчи','Прит.','Prov'], ecclesiastes:['Еккл','Екклесиаст','Еккл.','Eccl'], 'song-of-solomon':['Песн','Песнь Песней','Песн.','Song'],
            isaiah:['Ис','Исаия','Ис.','Isa','Isaiah'], jeremiah:['Иер','Иеремия','Иер.','Jer'], lamentations:['Плач','Плач Иеремии','Плач.','Lam'], ezekiel:['Иез','Иезекииль','Иез.','Ezek'], daniel:['Дан','Даниил','Дан.','Dan'], hosea:['Ос','Осия','Ос.','Hos'], joel:['Иоил','Иоиль','Иоил.','Joel'], amos:['Ам','Амос','Ам.','Amos'], obadiah:['Авд','Авдий','Авд.','Obad'], jonah:['Ион','Иона','Ион.','Jonah'], micah:['Мих','Михей','Мих.','Mic'], nahum:['Наум','Наум.','Nah'], habakkuk:['Авв','Аввакум','Авв.','Hab'], zephaniah:['Соф','Софония','Соф.','Zeph'], haggai:['Агг','Аггей','Агг.','Hag'], zechariah:['Зах','Захария','Зах.','Zech'], malachi:['Мал','Малахия','Мал.','Mal'],
            matthew:['Мф','Матф','Матфея','Мф.','Matt','Matthew'], mark:['Мк','Марка','Мк.','Mark'], luke:['Лк','Луки','Лк.','Luke'], john:['Ин','Иоанна','Ин.','John'], acts:['Деян','Деяния','Деян.','Acts'], romans:['Рим','Римлянам','Рим.','Rom'], '1-corinthians':['1 Кор','1Кор','1 Коринфянам','1 Cor'], '2-corinthians':['2 Кор','2Кор','2 Коринфянам','2 Cor'], galatians:['Гал','Галатам','Гал.','Gal'], ephesians:['Еф','Ефесянам','Еф.','Eph'], philippians:['Флп','Филиппийцам','Флп.','Phil'], colossians:['Кол','Колоссянам','Кол.','Col'], '1-thessalonians':['1 Фес','1Фес','1 Фессалоникийцам','1 Thess'], '2-thessalonians':['2 Фес','2Фес','2 Фессалоникийцам','2 Thess'], '1-timothy':['1 Тим','1Тим','1 Тимофею','1 Tim'], '2-timothy':['2 Тим','2Тим','2 Тимофею','2 Tim'], titus:['Тит','Титу','Тит.','Titus'], philemon:['Флм','Филимону','Флм.','Philem'], hebrews:['Евр','Евреям','Евр.','Heb'], james:['Иак','Иакова','Иак.','James'], '1-peter':['1 Пет','1Пет','1 Петра','1 Pet'], '2-peter':['2 Пет','2Пет','2 Петра','2 Pet'], '1-john':['1 Ин','1Ин','1 Иоанна','1 John'], '2-john':['2 Ин','2Ин','2 Иоанна','2 John'], '3-john':['3 Ин','3Ин','3 Иоанна','3 John'], jude:['Иуд','Иуды','Иуд.','Jude'], revelation:['Откр','Откровение','Откр.','Rev','Revelation']
        };
        function referenceAliasMap() {
            const map = new Map();
            for (const [slug, names] of Object.entries(dictionaryAliases)) for (const name of names) map.set(name.toLocaleLowerCase(), slug);
            for (const book of books) {
                for (const name of [book.name, book.short_name, book.abbreviation, book.slug].filter(Boolean)) map.set(String(name).toLocaleLowerCase(), book.slug);
            }
            return map;
        }
        function formatDictionaryReference(ref, bookRows = books) {
            const book = bookRows.find(row => row.slug === ref.book_slug);
            const from = Number(ref.verse_from), to = Number(ref.verse_to || from);
            return (book?.name || ref.book_slug) + ' ' + ref.chapter_number + ':' + from + (to !== from ? '–' + to : '');
        }
        async function openDictionaryReference(ref) {
            if (!ref || typeof ref.book_slug !== 'string' || !numeric(ref.chapter_number)) return;
            const panel = document.createElement('dialog'); panel.className = 'gkbr-dialog'; panel.setAttribute('aria-label', t.references);
            const header = element('header'), body = element('div', '', { class: 'gkbr-dialog-body' });
            header.append(element('strong', t.references));
            const close = button(t.close, () => panel.close(), header); close.textContent = '×';
            panel.append(header, body); root.append(panel); panel.addEventListener('close', () => panel.remove(), { once: true });
            panel.addEventListener('click', event => { if (event.target === panel) panel.close(); });
            panel.showModal(); body.append(element('p', t.loading));
            try {
                const result = await request(config, 'chapter', { translation: current.translation, book: ref.book_slug, chapter: ref.chapter_number });
                body.replaceChildren();
                const from = Number(ref.verse_from || 1), to = Number(ref.verse_to || from);
                body.append(element('h3', result.data.book.name + ' ' + ref.chapter_number + ':' + from + (to !== from ? '–' + to : '')));
                let highlighted = null;
                for (const verse of result.data.verses) {
                    const line = element('p', '', { class: 'gkbr-dictionary-verse' });
                    const isTarget = Number(verse.number) >= from && Number(verse.number) <= to;
                    line.setAttribute('aria-current', String(isTarget));
                    if (isTarget && !highlighted) highlighted = line;
                    line.append(element('sup', verse.number), document.createTextNode(' ' + plain(verse.plain_text ?? verse.text)));
                    body.append(line);
                }
                highlighted?.scrollIntoView({ block: 'center' });
                if (!result.data.verses.length) body.append(element('p', t.empty));
            } catch (failure) { body.replaceChildren(element('p', failure.message)); }
        }
        function appendLinkedDictionaryBody(parent, body, references) {
            const source = String(body || ''), aliases = referenceAliasMap();
            const aliasPattern = [...aliases.keys()].sort((a, b) => b.length - a.length).map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
            const explicit = new RegExp('(?<![\\p{L}\\p{N}])(?<book>' + aliasPattern + ')\\s+(?<chapter>\\d{1,3})\\s*[:,]\\s*(?<from>\\d{1,3})(?:\\s*[-–—]\\s*(?<to>\\d{1,3}))?(?![\\p{L}\\p{N}])', 'giu');
            const shorthand = /(?<![\p{L}\p{N}])(?<chapter>\d{1,3}):(?<from>\d{1,3})(?:\s*[-–—]\s*(?<to>\d{1,3}))?(?![\p{L}\p{N}])/gu;
            const hits = [];
            for (const match of source.matchAll(explicit)) hits.push({ index: match.index, end: match.index + match[0].length, text: match[0], slug: aliases.get(match.groups.book.toLocaleLowerCase()), chapter: Number(match.groups.chapter), from: Number(match.groups.from), to: Number(match.groups.to || match.groups.from), named: true });
            for (const match of source.matchAll(shorthand)) hits.push({ index: match.index, end: match.index + match[0].length, text: match[0], chapter: Number(match.groups.chapter), from: Number(match.groups.from), to: Number(match.groups.to || match.groups.from), named: false });
            hits.sort((a, b) => a.index - b.index || Number(b.named) - Number(a.named));
            const used = new Set(); let lastBook = '', position = 0;
            for (const hit of hits) {
                if (hit.index < position) continue;
                if (hit.named) lastBook = hit.slug;
                else hit.slug = lastBook;
                const refIndex = hit.slug ? references.findIndex((ref, index) => !used.has(index) && ref.book_slug === hit.slug && Number(ref.chapter_number) === hit.chapter && Number(ref.verse_from) === hit.from && Number(ref.verse_to || ref.verse_from) === hit.to) : -1;
                parent.append(document.createTextNode(source.slice(position, hit.index)));
                if (refIndex >= 0) {
                    const ref = references[refIndex]; used.add(refIndex);
                    button(hit.text, () => openDictionaryReference(ref), parent).classList.add('gkbr-inline-reference');
                } else parent.append(document.createTextNode(hit.text));
                position = hit.end;
            }
            parent.append(document.createTextNode(source.slice(position)));
            return used;
        }
        async function dictionaryEntry(module, entry) {
            const version = ++dictionaryEntryRequest;
            if (!dictionaryEntryDialog?.isConnected) {
                const panel = document.createElement('dialog'); panel.className = 'gkbr-dialog'; panel.setAttribute('aria-label', t.dictionaries);
                const header = element('header'), heading = element('strong'); header.append(heading);
                const close = button(t.close, () => panel.close(), header);
                close.textContent = '×'; panel.append(header, element('div', '', { class: 'gkbr-dialog-body gkbr-dictionary-entry-content' }));
                const body = panel.lastElementChild;
                panel.addEventListener('click', event => { if (event.target === panel) panel.close(); });
                panel.addEventListener('close', () => {
                    if (dictionaryEntryDialog === panel) dictionaryEntryDialog = null;
                    ++dictionaryEntryRequest; panel.remove();
                }, { once: true });
                root.append(panel); panel.showModal(); dictionaryEntryDialog = panel;
            }
            const panel = dictionaryEntryDialog, heading = panel.querySelector('header strong'), body = panel.querySelector('.gkbr-dictionary-entry-content');
            if (!panel.open) panel.showModal();
            heading.textContent = t.loading; body.replaceChildren(element('p', t.loading));
            try {
                const result = await request(config, 'dictionary-entry', { module, entry }); if (version !== dictionaryEntryRequest || !panel.open) return;
                const data = result.data;
                const language = String(dictionaries.find(row => row.code === module)?.language_code || '').toLowerCase();
                heading.lang = language; heading.textContent = data.topic || t.dictionaries;
                body.replaceChildren();
                const article = element('article', '', { class: 'gkbr-dictionary-article' });
                const articleBody = element('div', '', { class: 'gkbr-dictionary-body' }); articleBody.lang = language;
                const references = Array.isArray(data.references) ? data.references.filter(ref => ref && typeof ref.book_slug === 'string' && numeric(ref.chapter_number) && numeric(ref.verse_from)) : [];
                const linked = appendLinkedDictionaryBody(articleBody, data.body, references);
                article.append(articleBody);
                (data.media || []).forEach(media => {
                    if (!numeric(media.id)) return;
                    const url = new URL(config.ajax, location.href); url.searchParams.set('action', 'gkbr_media'); url.searchParams.set('module', module); url.searchParams.set('media', media.id);
                    article.append(element('img', '', { src: url.href, alt: data.topic || '', loading: 'lazy' }));
                });
                body.append(article);
                const unlinked = references.filter((ref, index) => !linked.has(index));
                if (unlinked.length) {
                    const section = element('section', '', { class: 'gkbr-dictionary-reference-list' }); section.append(element('h3', t.references));
                    unlinked.forEach(ref => button(formatDictionaryReference(ref), () => openDictionaryReference(ref), section));
                    body.append(section);
                }
                const links = Array.isArray(data.links) ? data.links : [];
                if (links.length) {
                    const section = element('section', '', { class: 'gkbr-dictionary-crosslinks' });
                    links.forEach(link => { if (link.key) button(link.label || link.topic, () => dictionaryEntry(module, link.key), section); });
                    body.append(section);
                }
            } catch (failure) { if (version === dictionaryEntryRequest && panel.open) error(body, failure.message, () => dictionaryEntry(module, entry)); }
        }
        compareSelect.addEventListener('change', compare);
        request(config, 'catalog').then(result => {
            catalog = result.data;
            options(translationSelect, catalog, row => row.code, row => row.name, current.translation);
            options(compareSelect, [{ code: '', name: t.none }, ...catalog], row => row.code, row => row.name);
            if (!config.passage && !root.closest('details')) {
                const url = new URL(location.href);
                const direct = {};
                ['translation', 'book', 'chapter', 'verse'].forEach(key => { if (url.searchParams.has('gkbr_' + key)) direct[key] = url.searchParams.get('gkbr_' + key); });
                current = { ...current, ...(config.restore && !Object.keys(direct).length && lastPlace && catalog.some(item => item.code === lastPlace.translation) ? lastPlace : direct) };
            }
            navigate(current, true);
        }).catch(failure => error(text, failure.message, () => { delete root.dataset.initialized; init(root); }));
    }
    function start() {
        document.querySelectorAll('[data-gkbr-reader]').forEach(root => {
            const details = root.closest('details');
            if (details && !details.open) details.addEventListener('toggle', () => { if (details.open) init(root); });
            else init(root);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
