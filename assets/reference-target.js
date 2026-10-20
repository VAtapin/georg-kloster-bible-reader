/* Same admission rules as my_bible_app resolvedReadingTarget; raw candidates remain visible. */
(() => {
    'use strict';
    const id = value => Number.isSafeInteger(value) && value > 0;
    const osis = value => typeof value === 'string' && /^[A-Za-z0-9]+\.[1-9]\d*\.[1-9]\d*$/u.test(value);
    const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value);
    const text = value => typeof value === 'string' && Boolean(value.trim());
    const original = value => value && id(value.verse_id) && osis(value.osis_ref);
    function proof(value) {
        if (!value || !osis(value.osis_ref) || value.relation !== 'exact' || value.cardinality !== 'one-to-one' || value.part !== null || !text(value.evidence_id)) return false;
        try { const url = new URL(value.evidence_uri); return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; }
    }
    const target = value => original(value) && text(value.book_slug) && text(value.reference) && id(value.chapter_number) && id(value.verse_number)
        && value.osis_ref.split('.')[1] === String(value.chapter_number) && value.osis_ref.split('.')[2] === String(value.verse_number);
    window.gkbrReferenceTarget = function (item, payload, context) {
        if (!context || payload.verse?.id !== context.id || payload.verse?.osis_ref !== context.osis_ref || payload.translation_code !== context.translation) return null;
        const envelope = payload.reference_resolution;
        if (envelope === undefined) {
            if (item.resolution || item.resolved_source || item.resolved_targets) return null;
            const status = item.versification;
            return status?.status === 'verified' && text(status.source_profile) && text(status.edition_profile) && text(status.map_version) && target(item.target) ? item.target : null;
        }
        if (!envelope || envelope.schema !== 2 || envelope.query_osis_ref !== context.osis_ref || !Array.isArray(envelope.sources)
            || !envelope.sources.every(source => source && typeof source.source === 'string' && ['unknown', 'raw', 'ambiguous', 'verified'].includes(source.status)
                && Array.isArray(source.original_osis_refs) && source.original_osis_refs.every(osis) && new Set(source.original_osis_refs).size === source.original_osis_refs.length
                && (source.map_id === null || id(source.map_id)) && (source.map_version === null || typeof source.map_version === 'string') && (source.map_sha256 === null || hash(source.map_sha256)))
            || new Set(envelope.sources.map(source => source?.source)).size !== envelope.sources.length) return null;
        const resolution = item.resolution;
        if (resolution?.status !== 'verified' || !text(resolution.source_profile) || !text(resolution.edition_profile) || !id(resolution.map_id) || !text(resolution.map_version) || !hash(resolution.map_sha256)
            || !original(item.original_source) || !original(item.original_target)) return null;
        const source = envelope.sources.find(source => source?.source === item.source);
        if (!source || source.status !== 'verified' || source.map_id !== resolution.map_id || source.map_version !== resolution.map_version || source.map_sha256 !== resolution.map_sha256
            || !Array.isArray(source.original_osis_refs) || source.original_osis_refs.length !== 1 || source.original_osis_refs[0] !== item.original_source.osis_ref) return null;
        if (item.original_target.osis_ref !== item.target?.osis_ref || item.original_target.verse_id !== item.target?.verse_id
            || !Array.isArray(item.resolved_source) || item.resolved_source.length !== 1 || !Array.isArray(item.resolved_targets) || item.resolved_targets.length !== 1) return null;
        const from = item.resolved_source[0], reading = item.resolved_targets[0];
        return proof(from) && from.osis_ref === envelope.query_osis_ref && proof(reading) && target(reading) && text(reading.text) ? reading : null;
    };
})();
