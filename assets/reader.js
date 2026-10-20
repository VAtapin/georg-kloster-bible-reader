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
            responseCache.set(key, { promise: pending, until: Date.now() + 60_000 });
            if (responseCache.size > 8) responseCache.delete(responseCache.keys().next().value);
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
        let navigation = 0, sideRequest = 0, compareRequest = 0, studyModules = null, dictionaries = null;
        let history = [], bookmarks = [], remember = false, lastPlace = null;
        let shell = null, continuous = null;
        const dictionaryStorageKey = 'gkbr:enabled-dictionaries:v1';
        let enabledDictionaries = new Set();
        try {
            const saved = JSON.parse(localStorage.getItem(dictionaryStorageKey) || '[]');
            if (Array.isArray(saved)) enabledDictionaries = new Set(saved.filter(code => typeof code === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(code)));
        } catch { /* Optional dictionary choices stay in this browser. */ }
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
        const text = element('div', '', { class: 'gkbr-text' });
        const side = element('aside', '', { class: 'gkbr-side', 'aria-label': t.study });
        side.hidden = true;
        layout.append(text, side);
        root.append(toolbar, actions, title, status, layout);
        function control(label, node) {
            node.setAttribute('aria-label', label);
            const wrapper = element('label', label);
            wrapper.append(node); toolbar.append(wrapper); return node;
        }
        function button(label, handler, parent = actions) {
            const node = element('button', label, { type: 'button', 'aria-label': label });
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
        button(t.dictionaries, () => dictionaryBrowser());
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
                bookmark: saveBookmark, commentary: () => study('commentaries'),
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
            side.hidden = false; side.replaceChildren();
            const header = element('div', '', { class: 'gkbr-actions' });
            header.append(element('strong', label)); button(t.close, () => { ++sideRequest; side.hidden = true; }, header); side.append(header);
        }
        function error(target, message, retry) {
            target.replaceChildren(element('p', message));
            if (retry) button(t.retry, retry, target);
        }
        async function navigate(position, initial = false, preload = null) {
            continuous?.dispose(); continuous = null;
            const version = ++navigation; ++sideRequest; ++compareRequest;
            status.textContent = t.loading; selected = null; side.hidden = true;
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
        async function dictionaryBrowser() {
            const version = ++sideRequest; openSide(t.dictionaries);
            try {
                dictionaries ||= (await request(config, 'dictionaries')).data;
                if (version !== sideRequest) return;
                const language = String(chapterData?.translation?.language?.code || '').toLowerCase().split(/[-_]/u)[0];
                const available = dictionaries.filter(row => row.kind !== 'word_forms');
                const moduleLanguage = row => String(row.definition_language || row.language_code || '').toLowerCase().split(/[-_]/u)[0];
                const visible = available.filter(row => (Boolean(language) && moduleLanguage(row) === language) || enabledDictionaries.has(row.code));
                const other = available.filter(row => moduleLanguage(row) !== language);
                const codes = visible.map(row => row.code);
                if (selected && codes.length) {
                    for (let offset = 0; offset < codes.length; offset += 30) {
                        const linked = await request(config, 'verse-dictionaries', { verse: selected.id, modules: codes.slice(offset, offset + 30).join(',') });
                        if (version !== sideRequest) return;
                        linked.data.forEach(row => button(row.topic + ' · ' + row.module_name, () => dictionaryEntry(row.module_code, row.key || row.id), side));
                    }
                }
                const select = element('select', '', { 'aria-label': t.module });
                options(select, visible, row => row.code, row => row.name);
                const input = element('input', '', { type: 'search', maxlength: 120, 'aria-label': t.search });
                const results = element('div');
                if (visible.length) { side.append(select, input); button(t.search, () => loadEntries(0), side); side.append(results); }
                if (other.length) button(t.enableDictionaries, () => {
                    ++sideRequest;
                    openSide(t.enableDictionaries);
                    for (const module of other) {
                        const choice = element('input', '', { type: 'checkbox' }); choice.checked = enabledDictionaries.has(module.code);
                        const label = element('label', module.name + (moduleLanguage(module) ? ' · ' + moduleLanguage(module) : ''));
                        label.prepend(choice); side.append(label);
                        choice.addEventListener('change', () => {
                            if (choice.checked) enabledDictionaries.add(module.code); else enabledDictionaries.delete(module.code);
                            try { localStorage.setItem(dictionaryStorageKey, JSON.stringify([...enabledDictionaries])); }
                            catch { status.textContent = t.storage; }
                        });
                    }
                    button(t.dictionaries, dictionaryBrowser, side);
                }, side);
                async function loadEntries(offset) {
                    const token = ++sideRequest, module = select.value;
                    try {
                        const result = await request(config, 'dictionary-entries', { module, q: input.value, offset }); if (token !== sideRequest) return;
                        results.replaceChildren(); result.data.forEach(row => button(row.topic, () => dictionaryEntry(module, row.key || row.id), results));
                        if (!result.data.length) results.append(element('p', t.empty));
                        if (offset + result.data.length < result.total) button(t.more, () => loadEntries(offset + 30), results);
                    } catch (failure) { if (token === sideRequest) error(results, failure.message, () => loadEntries(offset)); }
                }
                select.addEventListener('change', () => loadEntries(0)); input.addEventListener('keydown', event => { if (event.key === 'Enter') loadEntries(0); });
                if (select.value) loadEntries(0);
            } catch (failure) { if (version === sideRequest) error(side, failure.message, dictionaryBrowser); }
        }
        async function dictionaryEntry(module, entry) {
            const version = ++sideRequest;
            try {
                const result = await request(config, 'dictionary-entry', { module, entry }); if (version !== sideRequest) return;
                openSide(result.data.topic); side.append(element('p', result.data.body));
                (result.data.media || []).forEach(media => {
                    if (!numeric(media.id)) return;
                    const url = new URL(config.ajax, location.href); url.searchParams.set('action', 'gkbr_media'); url.searchParams.set('module', module); url.searchParams.set('media', media.id);
                    const image = element('img', '', { src: url.href, alt: result.data.topic, loading: 'lazy' }); side.append(image);
                });
                (result.data.links || []).forEach(link => button(link.label || link.topic, () => dictionaryEntry(module, link.key), side));
                button(t.dictionaries, dictionaryBrowser, side);
            } catch (failure) { if (version === sideRequest) error(side, failure.message, () => dictionaryEntry(module, entry)); }
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
