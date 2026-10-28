# Project status

- State: Georg Kloster Bible Reader 1.1.10 remains published. Dictionary workspace changes are prepared locally as a review build; no version bump or publication was made.
- Implemented: dictionary browsing and entries use the main reading area and independent state, so Bible navigation and verse selection do not control them. Verse-specific commentary remains in the right pane, which can be resized and remembers its width. Dictionary Bible references open the matching passage in a popup; structured references not matched inline remain clickable below the article. Changed reader assets use file modification times for cache refresh without changing the plugin version.
- Checks: JavaScript syntax checks, PHP lint, `git diff --check`, and a reference matcher smoke check passed. No live WordPress integration check was run; the plugin was not uploaded or published.
- Known issue: inline citation links require an exact match with structured references supplied by the API; remaining structured references are shown as clickable fallback links.
- Next: review `georg-kloster-bible-reader-1.1.10-review.zip` and send feedback before any publication.
- Last related commit: d72650c (Publish plugin directory screenshots).
