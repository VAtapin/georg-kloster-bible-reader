# Project status

- State: Georg Kloster Bible Reader 1.1.10 is prepared as a local review build; it has not been uploaded or published to WordPress.org.
- Implemented: Dictionary words appear as cards and open in a popup while preserving the list. Dictionary article responses are kept in a bounded browser cache for 15 minutes. Alphabet selection is limited to known text alphabets, uses Bible Desktop's alphabet/search endpoints for the Church Slavonic lexicon, and is disabled for Strong-number dictionaries and unknown languages. Church Slavonic headwords and articles use Monomakh. Bible references still open the full chapter with the referenced verses highlighted; commentary stays in the resizable right pane.
- Checks: JavaScript syntax checks, PHP lint, and `git diff --check` passed. No live WordPress/API integration check was run.
- Known limitation: Dictionaries without a confirmed alphabet offer cards and search instead of a guessed alphabet.
- Next: Review `georg-kloster-bible-reader-1.1.10-review.zip` before any WordPress.org publication.
- Last related commit: f5020ac (Improve dictionary browsing and verse references); current review corrections are prepared locally.
