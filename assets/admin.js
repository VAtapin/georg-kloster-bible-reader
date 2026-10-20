/* Local settings filter. No external requests. */
(() => {
    const input = document.getElementById('gkbr-filter');
    if (!input) return;
    const group = document.getElementById('gkbr-group'), language = document.getElementById('gkbr-language');
    const normalize = value => value.normalize('NFD').replace(/\p{M}+/gu, '').toLocaleLowerCase().replaceAll('ё', 'е').trim();
    function filter() {
        const tokens = normalize(input.value).split(/\s+/u).filter(Boolean);
        document.querySelectorAll('[data-gkbr-choice]').forEach(row => {
            row.hidden = (group.value && row.dataset.group !== group.value)
                || (language.value && row.dataset.language !== language.value)
                || !tokens.every(token => normalize(row.textContent).includes(token));
        });
        document.querySelectorAll('[data-gkbr-kind]').forEach(section => {
            section.hidden = ![...section.querySelectorAll('[data-gkbr-choice]')].some(row => !row.hidden);
        });
    }
    group.addEventListener('change', () => {
        language.value = '';
        [...language.options].forEach(option => { option.hidden = Boolean(option.value && group.value && option.dataset.group !== group.value); option.disabled = option.hidden; });
        filter();
    });
    language.addEventListener('change', filter); input.addEventListener('input', filter); filter();
    input.dataset.filterReady = '1';
})();
