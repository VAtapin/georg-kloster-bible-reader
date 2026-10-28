# Project status

- State: Georg Kloster Bible Reader 1.1.10 is published. Six Russian-language UI screenshots and their readme captions are prepared in `.wordpress-org/` and `readme.txt`; the asset-sync workflow publishes them from `main`.
- Decision: keep plugin-directory screenshots and artwork in `.wordpress-org/`, excluded from plugin ZIPs; publish directory assets through the dedicated GitHub Actions workflow.
- Checks: `git diff --check` passed. Each screenshot matches its user-provided PNG byte-for-byte; dimensions range from 853×864 to 922×916. No software tests were needed for this documentation and image update.
- Known issue: GlotPress accepted 200 RU and 200 DE interface translations, plus 12 localized readme strings for each of DE/PL/RU/UK; all are waiting for locale-team approval. WordPress.org may take time to show refreshed directory assets.
- Next: verify the asset-sync workflow and published SVN screenshots, then check the translation approvals and localized listings.
- Last related commit before this update: 12a712f (Record WordPress.org asset publication).
