/**
 * BibleDesktop - Bible study desktop and web application.
 *
 * @author Atapin Vladimir <atapin@gmail.com>
 * @copyright 2026 Atapin Vladimir / Bible Media
 * @version 1.0.0
 */

(function () {
    const config = window.gkbr_legacy_config || {};

    function request(action, params = {}) {
        const url = new URL(config.ajaxUrl);
        url.searchParams.set('action', action);
        url.searchParams.set('nonce', config.nonce);

        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });

        return fetch(url.toString(), {
            credentials: 'same-origin',
        })
            .then((response) => response.json())
            .then((payload) => {
                if (!payload.success) {
                    throw new Error(payload.data?.message || 'Request failed');
                }

                return payload.data;
            });
    }

    function options(select, rows, label, value) {
        select.innerHTML = '';
        rows.forEach((row) => {
            const option = document.createElement('option');
            option.value = String(value(row));
            option.textContent = label(row);
            select.appendChild(option);
        });
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
        }[char]));
    }

    function init(root) {
        const moduleSelect = root.querySelector('[data-gkbr-legacy-module]');
        const bookSelect = root.querySelector('[data-gkbr-legacy-book]');
        const chapterSelect = root.querySelector('[data-gkbr-legacy-chapter]');
        const textBox = root.querySelector('[data-gkbr-legacy-text]');
        const sideBox = root.querySelector('[data-gkbr-legacy-side]');
        const searchInput = root.querySelector('[data-gkbr-legacy-search]');
        const searchButton = root.querySelector('[data-gkbr-legacy-search-button]');
        const strongToggle = root.querySelector('[data-gkbr-legacy-strong-toggle]');
        let modules = [];

        function selectedModule() {
            return modules.find((module) => String(module.id) === moduleSelect.value);
        }

        function selectedBook() {
            const module = selectedModule();

            return module?.books?.find((book) => String(book.id) === bookSelect.value);
        }

        function fillBooks() {
            const module = selectedModule();
            options(bookSelect, module?.books || [], (book) => book.name, (book) => book.id);
            fillChapters();
        }

        function fillChapters() {
            const book = selectedBook();
            const count = Math.max(1, Number(book?.chapters_count || 1));
            const chapters = Array.from({ length: count }, (_, index) => index + 1);
            options(chapterSelect, chapters, (chapter) => String(chapter), (chapter) => chapter);
            loadChapter();
        }

        function loadChapter() {
            const module = selectedModule();
            const book = selectedBook();

            if (!module || !book) {
                textBox.innerHTML = '<p>' + escapeHtml(config.ui.noModules) + '</p>';
                return;
            }

            textBox.innerHTML = '<p>' + escapeHtml(config.ui.loading) + '</p>';
            request('gkbr_legacy_chapter', {
                module_id: module.id,
                book_id: book.id,
                chapter: chapterSelect.value || 1,
            }).then((verses) => {
                textBox.innerHTML = verses.map((verse) => (
                    `<p class="gkbr-legacy-verse"><span class="gkbr-legacy-verse-number">${verse.verse_number}</span> ${verse.html}</p>`
                )).join('');
            }).catch((error) => {
                textBox.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
            });
        }

        function runSearch() {
            const module = selectedModule();
            const query = searchInput.value.trim();

            if (!module || query.length < 2) {
                return;
            }

            sideBox.innerHTML = '<p>' + escapeHtml(config.ui.loading) + '</p>';
            request('gkbr_legacy_search', {
                module_id: module.id,
                q: query,
            }).then((rows) => {
                if (!rows.length) {
                    sideBox.innerHTML = '<p>' + escapeHtml(config.ui.empty) + '</p>';
                    return;
                }

                sideBox.innerHTML = rows.map((row) => (
                    `<button type="button" class="gkbr-legacy-search-result" data-book="${row.book_id}" data-chapter="${row.chapter_number}">
                        <strong>${escapeHtml(row.book_name)} ${row.chapter_number}:${row.verse_number}</strong>
                        <span>${escapeHtml(row.text_plain)}</span>
                    </button>`
                )).join('');
            }).catch((error) => {
                sideBox.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
            });
        }

        moduleSelect.addEventListener('change', fillBooks);
        bookSelect.addEventListener('change', fillChapters);
        chapterSelect.addEventListener('change', loadChapter);
        searchButton.addEventListener('click', runSearch);
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                runSearch();
            }
        });
        strongToggle.addEventListener('change', () => {
            root.classList.toggle('show-strong', strongToggle.checked);
        });
        textBox.addEventListener('click', (event) => {
            const button = event.target.closest('[data-strong]');

            if (!button) {
                return;
            }

            sideBox.innerHTML = '<p>' + escapeHtml(config.ui.loading) + '</p>';
            request('gkbr_legacy_strong', {
                number: button.dataset.strong,
            }).then((entry) => {
                sideBox.innerHTML = `<article class="gkbr-legacy-strong-card">
                    <h3>${escapeHtml(entry.number)}</h3>
                    <strong>${escapeHtml(entry.title)}</strong>
                    <p>${escapeHtml(entry.content)}</p>
                </article>`;
            }).catch((error) => {
                sideBox.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
            });
        });
        sideBox.addEventListener('click', (event) => {
            const result = event.target.closest('[data-chapter]');

            if (!result) {
                return;
            }

            bookSelect.value = result.dataset.book;
            fillChapters();
            chapterSelect.value = result.dataset.chapter;
            loadChapter();
        });

        request('gkbr_legacy_modules').then((rows) => {
            modules = rows;
            options(moduleSelect, modules, (module) => module.name, (module) => module.id);
            fillBooks();
        }).catch((error) => {
            textBox.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-gkbr-legacy-reader]').forEach(init);
    });
})();
