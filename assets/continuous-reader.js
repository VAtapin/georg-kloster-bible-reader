/* Bounded continuous reading; every page retains its actual edition/book/chapter context. */
(() => {
    'use strict';
    window.gkbrContinuousReader = function ({ root, initial, source, books, renderPage, activate, loadChapter, label, failure }) {
        let pages = [{ position: { ...initial }, source }], busy = false, disposed = false, automatic = 0;
        const lifecycle = new AbortController();
        const key = place => [place.translation, place.book, place.chapter].join(':');
        const more = document.createElement('button'); more.type = 'button'; more.className = 'gkbr-continuation'; more.textContent = label;
        const first = renderPage(initial, source); first.dataset.page = key(initial); root.replaceChildren(first, more);
        function next() {
            const last = pages.at(-1).position, index = books.findIndex(book => book.slug === last.book), book = books[index];
            if (Number(last.chapter) < Number(book?.chapters_count)) return { ...last, chapter: Number(last.chapter) + 1, verse: 1 };
            return books[index + 1] ? { ...last, book: books[index + 1].slug, chapter: 1, verse: 1 } : null;
        }
        function visible() {
            const top = root.getBoundingClientRect().top;
            const page = [...root.querySelectorAll('[data-page]')].find(item => item.getBoundingClientRect().bottom > top + 30);
            const entry = pages.find(item => key(item.position) === page?.dataset.page);
            if (entry) activate(entry.position, entry.source, false);
        }
        async function append(manual = false) {
            if (busy || disposed || !manual && automatic >= 5) return;
            const position = next(); if (!position) { more.hidden = true; return; }
            busy = true; more.disabled = true; if (!manual) automatic++; let completed = false;
            try {
                const result = await loadChapter(position); if (disposed) return;
                const page = renderPage(position, result.data); page.dataset.page = key(position); root.insertBefore(page, more); pages.push({ position, source: result.data });
                // Keep at most 30 chapter bodies in this reading window.
                if (pages.length > 30) {
                    const old = root.querySelector('[data-page]'), height = old.getBoundingClientRect().height; old.remove(); pages.shift(); root.scrollTop = Math.max(0, root.scrollTop - height);
                }
                more.hidden = !next(); completed = true;
            } catch (error) { if (!disposed) failure(error.message); }
            finally { busy = false; more.disabled = false; if (!disposed && completed && !more.hidden && root.scrollHeight <= root.clientHeight + 80) queueMicrotask(() => append()); }
        }
        more.addEventListener('click', () => { automatic = 0; append(true); }, { signal: lifecycle.signal });
        root.addEventListener('scroll', () => {
            visible(); if (root.scrollHeight - root.scrollTop - root.clientHeight < 180) { automatic = 0; append(); }
        }, { passive: true, signal: lifecycle.signal });
        const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) append(); }, { root, rootMargin: '80px' }); observer.observe(more);
        return { dispose: () => { disposed = true; lifecycle.abort(); observer.disconnect(); } };
    };
})();
