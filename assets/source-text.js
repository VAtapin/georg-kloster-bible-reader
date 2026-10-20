/* Source-only UTF-16 annotations, using the same bounds rules as my_bible_app. */
(() => {
    'use strict';
    window.gkbrSourceText = function (verse, prefs, marks, callbacks) {
        const text = String(verse.plain_text ?? ''), root = document.createElement('span'); root.className = 'gkbr-source';
        const position = offset => Number.isInteger(offset) && offset >= 0 && offset <= text.length
            && !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]));
        const arrays = ['paragraph_breaks', 'line_breaks', 'headings', 'footnotes', 'added_words', 'emphasis', 'red_letters', 'strong_tokens'];
        const raw = verse.annotations;
        const provenance = value => value && ['mybible', 'biblequote', 'legacy_html', 'unknown', 'mybible_stories', 'biblequote_heading', 'mybible_footnotes'].includes(value.kind) && (value.sha256 === null || /^[a-f0-9]{64}$/iu.test(value.sha256));
        const valid = raw?.status === 'available' && provenance(raw.source) && (raw.paragraph_before === null || typeof raw.paragraph_before === 'boolean')
            && raw.features && ['headings', 'footnotes', 'added_words', 'paragraphs'].every(key => ['present', 'absent', 'unknown'].includes(raw.features[key]))
            && Array.isArray(raw.headings) && raw.headings.every(item => item && typeof item.id === 'string' && typeof item.text === 'string' && provenance(item.source))
            && Array.isArray(raw.footnotes) && raw.footnotes.every(item => item && typeof item.id === 'string' && (item.marker === null || typeof item.marker === 'string') && (item.text === null || typeof item.text === 'string') && typeof item.body_available === 'boolean' && ['inline_note', 'footnote'].includes(item.kind) && provenance(item.source))
            && arrays.every(key => Array.isArray(raw[key]) && raw[key].every(item => item && typeof item === 'object'
            && (['added_words', 'emphasis', 'red_letters'].includes(key) ? position(item.start_utf16) && position(item.end_utf16) && item.end_utf16 > item.start_utf16 : position(item.offset_utf16))));
        const annotation = valid ? raw : null;
        const ranges = key => annotation?.[key] || [];
        const remaining = verse.has_strong_markup ? [...text.matchAll(/(?<![\p{L}\p{N}])([HG])(\d{1,5})(?!\p{N})/giu)].filter(match => Number(match[2]) > 0).map(match => ({ start: match.index, end: match.index + match[0].length, strong_number: match[1].toUpperCase() + Number(match[2]), offset_utf16: match.index })) : [];
        const tokens = [...ranges('strong_tokens').filter(item => /^[HG][1-9]\d{0,4}$/iu.test(item.strong_number)), ...remaining.filter(item => !ranges('strong_tokens').some(token => token.offset_utf16 === item.start && token.strong_number === item.strong_number))];
        const points = [...new Set([0, text.length, ...arrays.flatMap(key => ranges(key).flatMap(item => 'start_utf16' in item ? [item.start_utf16, item.end_utf16] : [item.offset_utf16])),
            ...remaining.flatMap(item => [item.start, item.end]), ...marks.flatMap(item => [item.start, item.end])])].sort((a, b) => a - b);
        function append(tag, value, className = '') { const item = document.createElement(tag); item.textContent = value; item.className = className; root.append(item); return item; }
        function actionable(item, callback, label) {
            item.setAttribute('role', 'button'); item.tabIndex = 0; item.setAttribute('aria-label', label);
            item.addEventListener('click', event => { event.stopPropagation(); callback(); });
            item.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); callback(); } });
        }
        for (let index = 0; index < points.length; index++) {
            const start = points[index], end = points[index + 1] ?? start;
            if (!prefs.clean) {
                if (prefs.paragraphs && (start === 0 && annotation?.paragraph_before || ranges('paragraph_breaks').some(item => item.offset_utf16 === start))) append('span', '', 'gkbr-source-paragraph');
                if (prefs.paragraphs && ranges('line_breaks').some(item => item.offset_utf16 === start)) root.append(document.createElement('br'));
                if (prefs.headings) for (const heading of ranges('headings').filter(item => item.offset_utf16 === start && typeof item.text === 'string')) append('span', heading.text, 'gkbr-source-heading');
                if (prefs.footnotes) for (const note of ranges('footnotes').filter(item => item.offset_utf16 === start)) {
                    const item = append('sup', note.marker || '*', 'gkbr-source-note'); actionable(item, () => callbacks.footnote(note), callbacks.noteLabel);
                }
                if (prefs.strongNumbers) for (const token of tokens.filter(item => item.offset_utf16 === start)) {
                    const item = append('sup', token.strong_number, 'gkbr-source-strong'); actionable(item, () => callbacks.strong(token.strong_number.toUpperCase()), token.strong_number);
                }
            }
            if (remaining.some(item => start >= item.start && start < item.end)) continue;
            const span = append('span', prefs.clean || !prefs.paragraphs ? text.slice(start, end).replace(/\n/gu, ' ') : text.slice(start, end));
            if (!prefs.clean) {
                if (prefs.addedWords && ranges('added_words').some(item => start >= item.start_utf16 && start < item.end_utf16)) span.classList.add('gkbr-source-added');
                if (ranges('emphasis').some(item => start >= item.start_utf16 && start < item.end_utf16)) span.classList.add('gkbr-source-emphasis');
                if (ranges('red_letters').some(item => start >= item.start_utf16 && start < item.end_utf16)) span.classList.add('gkbr-source-red');
                for (const mark of marks.filter(item => start >= item.start && start < item.end)) {
                    span.classList.add('gkbr-mark-' + (['yellow', 'blue', 'green', 'pink'].includes(mark.color) ? mark.color : 'yellow'));
                    if (mark.underline) span.classList.add('gkbr-underlined'); if (mark.note) span.title = String(mark.note);
                }
            }
        }
        return root;
    };
})();
