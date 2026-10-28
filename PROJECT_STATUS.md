# Project status

- State: Georg Kloster Bible Reader 1.1.10 is published; localized WordPress.org artwork and descriptions are prepared in the repository.
- Decision: keep directory artwork in `.wordpress-org/`, exclude it from the plugin ZIP, and sync artwork plus `readme.txt` to WordPress.org from the dedicated GitHub Actions workflow on push to `main`.
- Checks: `git diff --check` passed; icon and banners use the required WordPress.org dimensions.
- Known issue: WordPress.org translations are managed in GlotPress. The plugin’s DE/RU catalogs and DE/PL/RU/UK readme copy still need submission and approval there.
- Next: commit and push the assets/workflow, verify the asset workflow, then submit existing GlotPress translations and check their publication status.
- Last related commit before this update: d956bcc (Update Bible Reader descriptions).
