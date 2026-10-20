/* Unbundled source using WordPress' built-in block editor packages. */
(() => {
    const { createElement: el, useState, useEffect } = wp.element;
    const { __ } = wp.i18n;
    const domain = 'georg-kloster-bible-reader';
    const { TextControl, SelectControl, PanelBody } = wp.components;
    const { InspectorControls, useBlockProps } = wp.blockEditor;
    const config = window.gkbr_editor_config || {};
    const pending = new Map();
    function request(kind, params = {}) {
        const key = JSON.stringify([kind, params]);
        if (!pending.has(key)) {
            const url = new URL(config.ajax, location.href);
            url.searchParams.set('action', 'gkbr_read'); url.searchParams.set('kind', kind);
            Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
            pending.set(key, fetch(url, { credentials: 'same-origin' }).then(response => response.json()).then(response => {
                if (!response.success) throw new Error(response.data?.message || __('Could not load this material. Please try again later.', domain));
                return response.data.data;
            }).catch(error => { pending.delete(key); throw error; }));
        }
        return pending.get(key);
    }
    function register(name, title, passage) {
        wp.blocks.registerBlockType(name, {
            title, icon: 'book-alt', category: 'widgets',
            edit({ attributes, setAttributes }) {
                const [translations, setTranslations] = useState([]);
                const [books, setBooks] = useState([]);
                const [error, setError] = useState('');
                const translation = attributes.translation || config.default;
                useEffect(() => {
                    let active = true;
                    if (config.connected) request('catalog').then(rows => { if (active) setTranslations(rows); }).catch(failure => { if (active) setError(failure.message); });
                    return () => { active = false; };
                }, []);
                useEffect(() => {
                    let active = true; setBooks([]);
                    if (config.connected && translation) request('books', { translation }).then(result => { if (active) { setBooks(result.books); setError(''); } }).catch(failure => { if (active) setError(failure.message); });
                    return () => { active = false; };
                }, [translation]);
                const book = books.find(row => row.slug === attributes.book);
                const controls = [
                    el(SelectControl, { key: 'translation', label: __('Translation', domain), value: attributes.translation || '', options: [{ label: __('Default translation', domain), value: '' }, ...translations.map(row => ({ label: row.name, value: row.code }))], onChange: value => setAttributes({ translation: value, book: '', chapter: '1' }) }),
                    el(SelectControl, { key: 'book', label: __('Book', domain), value: attributes.book || '', options: [{ label: __('None', domain), value: '' }, ...books.map(row => ({ label: row.name, value: row.slug }))], onChange: value => setAttributes({ book: value, chapter: '1' }) }),
                    el(SelectControl, { key: 'chapter', label: __('Chapter', domain), value: attributes.chapter || '1', options: Array.from({ length: book?.chapters_count || 1 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) })), onChange: value => setAttributes({ chapter: value }) }),
                ];
                if (passage) [['from', __('First verse', domain)], ['to', __('Last verse', domain)]].forEach(([key, label]) => controls.push(el(TextControl, { key, label, type: 'number', min: 1, max: 200, value: attributes[key], onChange: value => setAttributes({ [key]: value }) })));
                return el('div', useBlockProps(),
                    el(InspectorControls, {}, el(PanelBody, { title }, controls)),
                    el('strong', {}, title),
                    el('p', {}, config.connected ? __('Choose a translation and passage in the block settings.', domain) : __('Connect Bible Desktop in the reader settings first.', domain)),
                    error ? el('p', { role: 'alert' }, error) : null,
                    el('p', {}, `${translations.find(row => row.code === translation)?.name || ''} ${book?.name || ''} ${attributes.chapter || ''}${passage ? ':' + attributes.from + '–' + attributes.to : ''}`)
                );
            },
            save() { return null; }
        });
    }
    register('georg-kloster-bible-reader/reader', __('Bible Reader', domain), false);
    register('georg-kloster-bible-reader/passage', __('Bible Passage', domain), true);
})();
