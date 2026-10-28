# Project status

- State: Georg Kloster Bible Reader 1.1.10 source and Git-based WordPress.org release workflow are in the dedicated repository.
- Decision: release is triggered by an annotated `X.Y.Z` tag. Workflow validates the tag against the plugin header and `readme.txt`, deploys through the configured SVN secrets and `WORDPRESS_ORG_SLUG`, and attaches the generated ZIP to a GitHub Release. `.distignore` excludes repository documentation and workflow metadata from the plugin package.
- Checks: workflow and version-gate review; `git diff --check` passed.
- Known limitation: WordPress.org publication completes only after the GitHub Actions deployment succeeds.
- Next: commit and push workflow, then push annotated tag `1.1.10` to start deployment.
- Last related commit: d956bcc (Update Bible Reader descriptions).
