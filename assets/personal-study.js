/* Personal study stays in this browser. No profile, note, or account API requests. */
(() => {
    'use strict';
    window.gkbrPersonalStudy = function ({ root, t, node, button, dialog, getPlace, getChapter, loadChapter, navigate, refresh, message }) {
        const key = 'gkbr:personal:v1';
        let state = { notes: [], marks: [], passages: [], cards: [] };
        const identity = place => [place.translation, place.book, place.chapter, place.verse].join(':');
        function read() {
            try {
                const saved = JSON.parse(localStorage.getItem(key) || '{}');
                for (const name of Object.keys(state)) state[name] = Array.isArray(saved[name]) ? saved[name].filter(row => row && typeof row === 'object').slice(0, 400) : [];
            } catch { message(t.storage); }
        }
        function save() {
            try { localStorage.setItem(key, JSON.stringify(state)); refresh(); return true; }
            catch { message(t.storage); return false; }
        }
        function place() {
            const location = getPlace(), chapter = getChapter();
            const verse = chapter?.verses.find(row => Number(row.number) === Number(location.verse));
            return verse ? { ...location, label: chapter.book.name + ' ' + location.chapter + ':' + location.verse, text: verse.plain_text || '' } : null;
        }
        function field(parent, label, input) {
            input.setAttribute('aria-label', label); const wrapper = node('label', label); wrapper.append(input); parent.append(wrapper); return input;
        }
        function note() {
            read(); const spot = place(); if (!spot) { message(t.study); return; }
            const panel = dialog(t.addNote), existing = state.notes.find(row => identity(row) === identity(spot));
            panel.body.append(node('strong', spot.label), node('p', spot.text));
            const area = field(panel.body, t.notes, node('textarea', '', { rows: 7, maxlength: 10000 })); area.value = existing?.note || '';
            button(t.save, () => {
                state.notes = [{ ...spot, note: area.value.trim(), updated: Date.now() }, ...state.notes.filter(row => identity(row) !== identity(spot))].filter(row => row.note).slice(0, 200);
                if (save()) { panel.close(); message(t.saved); }
            }, panel.body);
            if (existing) button(t.remove, () => { state.notes = state.notes.filter(row => identity(row) !== identity(spot)); if (save()) panel.close(); }, panel.body);
            area.focus();
        }
        function notes() {
            read(); const panel = dialog(t.notes);
            for (const item of state.notes) {
                const card = node('article'); button(item.label, () => { panel.close(); navigate(item); }, card);
                card.append(node('p', item.note)); button(t.remove, () => { state.notes = state.notes.filter(row => row !== item); if (save()) { panel.close(); notes(); } }, card); panel.body.append(card);
            }
            if (!state.notes.length) panel.body.append(node('p', t.empty));
        }
        function marks(verse, position) {
            read(); return state.marks.filter(mark => identity(mark) === identity({ ...position, verse: verse.number }) && typeof mark.start === 'number' && typeof mark.end === 'number'
                && mark.start >= 0 && mark.end > mark.start && mark.end <= (verse.plain_text || '').length && verse.plain_text.slice(mark.start, mark.end) === mark.quote);
        }
        function notesFor(verse, position) {
            const key = identity({ ...position, verse: verse.number });
            return [
                ...state.notes.filter(item => identity(item) === key && typeof item.note === 'string' && item.note.trim()).map(item => ({ text: item.note })),
                ...state.marks.filter(item => identity(item) === key && typeof item.note === 'string' && item.note.trim()).map(item => ({ text: item.note }))
            ];
        }
        function personal() {
            read(); const spot = place(); if (!spot) { message(t.study); return; }
            const selection = String(window.getSelection()?.toString() || '').trim();
            const panel = dialog(t.personal); panel.body.append(node('strong', spot.label));
            const start = field(panel.body, t.from, node('input', '', { value: spot.chapter + ':' + spot.verse, inputmode: 'numeric' }));
            const end = field(panel.body, t.to, node('input', '', { value: spot.chapter + ':' + spot.verse, inputmode: 'numeric' }));
            const title = field(panel.body, t.title, node('input', '', { maxlength: 200 }));
            const collection = field(panel.body, t.collection, node('input', '', { maxlength: 100 }));
            const preview = node('div', '', { class: 'gkbr-passage-preview' }); panel.body.append(preview);
            const result = node('p', '', { role: 'status' }); panel.body.append(result);
            let excerpt = null;
            function point(value) { const match = /^(\d{1,3}):(\d{1,3})$/.exec(value.trim()); return match ? { chapter: Number(match[1]), verse: Number(match[2]) } : null; }
            async function collect() {
                const first = point(start.value), last = point(end.value); excerpt = null;
                const book = getChapter()?.book;
                if (!first || !last || first.chapter < 1 || last.chapter > Number(book?.chapters_count) || first.chapter > last.chapter || last.chapter - first.chapter > 19 || first.verse < 1 || last.verse < 1 || (first.chapter === last.chapter && first.verse > last.verse)) { result.textContent = t.invalid; return null; }
                result.textContent = t.loading; const rows = [];
                try {
                    for (let chapter = first.chapter; chapter <= last.chapter; chapter++) {
                        const source = (await loadChapter({ ...spot, chapter })).data;
                        if (chapter === first.chapter && !source.verses.some(row => Number(row.number) === first.verse) || chapter === last.chapter && !source.verses.some(row => Number(row.number) === last.verse)) throw new Error(t.invalid);
                        source.verses.filter(row => (chapter !== first.chapter || row.number >= first.verse) && (chapter !== last.chapter || row.number <= last.verse)).forEach(row => rows.push({ chapter, verse: row.number, text: row.plain_text || '' }));
                    }
                    if (!panel.element.open) return null;
                    excerpt = { ...spot, from: first, to: last, verses: rows, label: book.name + ' ' + start.value + '–' + end.value, title: title.value.trim(), collection: collection.value.trim(), id: crypto.randomUUID() };
                    preview.replaceChildren(node('p', rows.map(row => row.chapter + ':' + row.verse + ' ' + row.text).join('\n'))); result.textContent = ''; return excerpt;
                } catch (failure) { result.textContent = failure.message; return null; }
            }
            button(t.preview, collect, panel.body);
            for (const [label, name] of [[t.savePassage, 'passages'], [t.saveMemory, 'cards']]) button(label, async event => {
                const trigger = event.currentTarget; trigger.disabled = true;
                try { const value = await collect(); if (!value) return; state[name] = [{ ...value, learned: false }, ...state[name]].slice(0, 200); if (save()) { panel.close(); message(t.saved); } }
                finally { trigger.disabled = false; }
            }, panel.body);
            button(t.collections, () => { panel.close(); library(); }, panel.body);
            button(t.memorize, () => { panel.close(); library(true); }, panel.body);
            const quote = selection && spot.text.includes(selection) && spot.text.indexOf(selection) === spot.text.lastIndexOf(selection) ? selection : spot.text;
            panel.body.append(node('h4', t.highlight), node('p', quote));
            const color = field(panel.body, t.color, node('select'));
            ['yellow', 'green', 'blue', 'pink'].forEach(value => color.append(node('option', t[value], { value })));
            const underline = field(panel.body, t.underline, node('input', '', { type: 'checkbox' }));
            const comment = field(panel.body, t.addNote, node('textarea', '', { rows: 3, maxlength: 3000 }));
            button(t.highlight, () => {
                const offset = spot.text.indexOf(quote); if (offset < 0 || !quote) return;
                state.marks = [{ ...spot, quote, start: offset, end: offset + quote.length, color: color.value, underline: underline.checked, note: comment.value, id: crypto.randomUUID() }, ...state.marks].slice(0, 400);
                if (save()) { panel.close(); message(t.saved); }
            }, panel.body);
            button(t.removeHighlights, () => { state.marks = state.marks.filter(mark => identity(mark) !== identity(spot)); if (save()) panel.close(); }, panel.body);
        }
        function library(memory = false) {
            read(); const name = memory ? 'cards' : 'passages', panel = dialog(memory ? t.memorize : t.collections);
            const filter = field(panel.body, t.collection, node('select'));
            filter.append(node('option', t.all, { value: '' }));
            [...new Set(state[name].map(row => row.collection).filter(Boolean))].forEach(value => filter.append(node('option', value, { value })));
            const content = node('div'); panel.body.append(content);
            function render() {
                content.replaceChildren(); const items = state[name].filter(row => !filter.value || row.collection === filter.value);
                for (const item of items) {
                    const card = node('article'); card.append(node('h4', item.title || item.label));
                    const text = node('p', (item.verses || []).map(row => row.chapter + ':' + row.verse + ' ' + row.text).join('\n')); text.hidden = memory; card.append(text);
                    if (memory) {
                        button(t.reveal, () => { text.hidden = !text.hidden; }, card);
                        const learned = field(card, t.learned, node('input', '', { type: 'checkbox' })); learned.checked = item.learned === true;
                        learned.addEventListener('change', () => { item.learned = learned.checked; save(); });
                    }
                    button(t.open, () => { panel.close(); navigate({ translation: item.translation, book: item.book, chapter: item.from.chapter, verse: item.from.verse }); }, card);
                    button(t.remove, () => { state[name] = state[name].filter(row => row !== item); if (save()) render(); }, card); content.append(card);
                }
                if (!items.length) content.append(node('p', t.empty));
            }
            filter.addEventListener('change', render); render();
        }
        function exportData() {
            read(); const href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
            const link = node('a', '', { href, download: 'bible-reader-personal-study.json' }); root.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
        }
        return { note, notes, personal, library, marks, notesFor, exportData };
    };
})();
