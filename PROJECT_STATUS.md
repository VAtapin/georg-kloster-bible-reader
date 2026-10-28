# Project status

- State: Georg Kloster Bible Reader 1.1.10 is published. The localized icon and eight banners are present in WordPress.org SVN revision 3770953; GitHub Actions run 40713820736 succeeded.
- Decision: keep directory artwork in `.wordpress-org/`, exclude it from plugin ZIPs, and sync artwork plus `readme.txt` from `main` through the dedicated GitHub Actions workflow.
- Checks: `git diff --check` passed; the 128/256 icons and 772x250/1544x500 banners use the required dimensions. The published SVN assets were verified in the built-in browser.
- Known issue: GlotPress accepted 200 RU and 200 DE interface translations, plus 12 localized readme strings for each of DE/PL/RU/UK; all are waiting for locale-team approval. The plugin directory page still shows its cached placeholder icon while the new icon URL and SVN files are live.
- Next: wait for translation approval and WordPress.org cache/release-delay propagation, then verify localized listings.
- Last related commit before this status update: 542d7c0 (Publish localized WordPress.org assets).
