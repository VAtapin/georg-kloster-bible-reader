=== Georg Kloster Bible Reader ===
Contributors: atapin
Tags: bible, bible study, scripture, commentary, shortcode
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 1.1.10
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Read the Bible, compare translations, search Scripture, explore study tools, and embed passages in WordPress.

== Description ==

Georg Kloster Bible Reader is a Bible reading and study plugin for WordPress.

* Choose the translations available to visitors and the default translation.
* Read chapters, search Scripture, and share direct links to verses.
* Compare translations using stored verse correspondences, including different chapter numbering.
* Open commentary, cross references, Strong entries, dictionaries, and atlas images.
* Embed a passage or the full reader with Gutenberg blocks or shortcodes.
* Use the app-style reader shell, book/chapter/verse navigation, reading settings, continuous chapters, and a full-screen reading mode.
* Keep bookmarks, notes, highlights, saved passages, memory cards, and optional reading history in the visitor's browser.
* Cache chapters locally for one year and study responses for 90 days.
* Download selected editions in small background batches with progress, pause/resume, and refresh.
* Keep previously imported BibleQuote modules through the local reader.

English source interface with Russian and German translations. The WordPress.org
package uses translate.wordpress.org language packs; the standalone installation
package includes bundled translations. Until a language pack is published,
the WordPress.org package uses English for that language.

No calendar or daily reading widgets are included.

== External services ==

This plugin uses Bible Desktop, operated by the plugin author Vladimir Atapin,
at https://bible-desktop.com/api/ to retrieve public Bible texts, translation
catalogs, stored verse locations, search results, commentary, cross references,
Strong entries, dictionaries, and dictionary map images.

Activation makes no external request. The one-time setup page explains the
connection. No request is sent until an administrator explicitly checks the
connection consent checkbox and saves the settings. After consent, requests
occur when settings load or refresh the catalog, visitors request uncached
or outdated content, or an administrator starts/resumes a background download.
Revoking consent stops external requests and scheduled downloads.

Requests originate from the WordPress server and include its IP address, a
plugin/version User-Agent, and the requested translation, book, chapter, verse,
dictionary/entry/image identifiers or search words. No visitor IP address,
WordPress login, email, cookies, bookmark, reading history, or installation
identifier is forwarded. This plugin does not call translation AI or OpenAI.
Search words are not permanently saved by the plugin; the external service
may keep technical request logs as described in its privacy policy.

Terms: https://bible-desktop.com/pages/api-terms
Privacy: https://bible-desktop.com/pages/api-privacy

== Installation ==

1. Upload the georg-kloster-bible-reader directory into wp-content/plugins.
2. Activate the plugin. Individual activation opens the Georg Kloster Bible Reader menu.
   Bulk, network, and command-line activation do not redirect.
3. Read the external-service notice, check consent, and save to load the catalog.
4. Select one or more translations and a default translation, then save again.
5. Add the Bible Reader or Bible Passage block, or use [bible_desktop]. Use [bible_desktop bottom="no"] to hide the bottom bar for one reader; its actions remain in the header menu.

For a passage:
[georg_kloster_passage translation="L1_RST" book="john" chapter="3" from="16" to="21"]

For a reference that opens an inline reader:
[georg_kloster_bible_link book="john" chapter="3" verse="16"]John 3:16[/georg_kloster_bible_link]

Book slugs must come from the chosen translation's API catalog; the example
translation must be enabled by the administrator. Passages cover one chapter.

For the existing local module reader:
[bible_desktop source="local"]

When migrating from the Bible Desktop Reader prototype, deactivate the old
plugin before activating this one. The wp_bd_* tables and imported contents
are retained. Existing [bible_desktop] embeds use the API after setup; add
source="local" to keep the imported-module mode.

== Frequently Asked Questions ==

= Is a Bible Desktop API key required? =
No. This plugin uses the public reading API.

= What is stored on my server? =
Successful API responses are stored in a plugin-owned database cache.
Map images are validated raster images stored in WordPress uploads. Chapters
are reused for one year; study responses and dictionary articles for 90 days;
catalogs are checked daily. Available content revisions invalidate outdated
chapters or dictionary articles on demand. When revisions are absent, timed
refresh and manual Bible refresh remain available. Source version values
do not guarantee detection of every editorial correction.

Cached data is retained during transient service failures. Explicit 403/404/409
source responses block the resource instead of reviving withdrawn or corrupt
content. Manual refresh replaces working chapters only after successful
requests. Empty verse-location and dictionary-list lookups are kept for one day;
empty chapters and catalogs are not stored. Visitor search responses are not
persisted. A small one-minute cache in each browser tab reduces repeated
WordPress requests while reading.

"Refresh cached content on next use" also refreshes study materials and maps
without deleting their last working copy or downloading whole editions.

= Can I download whole editions? =
Connect the API, select translations, and start the background download. Public
API availability alone does not establish redistribution rights. The plugin
does not ship Bible corpora in its ZIP.

WordPress cron fetches at most two chapters per run. Progress totals increase
as each translation's book list is discovered. Configure a reliable cron
runner for unattended completion. This is a server cache, not an offline
browser application: the WordPress site must still be reachable.

= Are all cross references and translation matches verified? =
No. Translation comparison follows stored canonical verse IDs and module
locations. The plugin does not guess Psalm-number shifts. Cross references
show available verse text from the selected edition's stored verse location;
unavailable text is omitted rather than replaced with a technical notice.
TSK references appear only for Russian editions, with at most 12 references
displayed for a selected verse. Unverified references have no automatic jump.

= Where is personal reading data stored? =
Bookmarks, notes, highlights, saved passages, memory cards, reader preferences,
and the last position are stored in this browser's localStorage. Reading-history
storage requires its own checkbox. Personal data is not synchronized with
WordPress accounts or Bible Desktop. The reader offers manual JSON export.
Browser storage limits apply; clearing browser data also removes these records.

= How do continuous reading and source formatting work? =
The reader appends nearby chapters as the visitor reads, keeping at most 30
chapter bodies in the page. Passages can span at most 20 chapters. Source
headings, notes, added words, and Strong numbers are shown only when supplied
by the selected edition's annotation data. Invalid annotations fall back to
plain text. Audio is unavailable until the content service supplies it.

= Are fonts or scripts loaded from external CDNs? =
No. Scripts/styles are included, the Gutenberg editor uses WordPress libraries,
and Monomakh Unicode is bundled under SIL OFL 1.1. Maps are requested by the
WordPress server and served locally. No external credit link is shown unless
the administrator enables it.

= What happens on deactivation or uninstall? =
Background jobs stop on deactivation. Settings, downloaded images, cached
responses, and imported modules are retained. This release has no automatic
destructive uninstall routine.

== Screenshots ==

1. Connection settings, available Bible translations, and reader options.
2. Bible chapter view with reading controls.
3. Book, chapter, and verse navigation.
4. Bible chapter with the commentary panel.
5. Selected-verse study actions and saved passage tools.
6. Dictionaries and maps available for the selected translation.

== Changelog ==

= 1.1.10 =
* Enqueue the legacy admin stylesheet only on its plugin screen.
* Load bundled translations without registering a custom WordPress.org textdomain path.
* Point to the dedicated plugin source repository.

= 1.1.9 =
* Reuse recently opened content in the browser tab and briefly cache valid empty location and dictionary lookups.

= 1.1.8 =
* Limit public dictionary-map downloads alongside other outbound API requests.
* Keep the local-reader instruction as one translatable sentence and refresh release metadata and language catalogs.

= 1.1.7 =
* Open the existing reader full screen above the WordPress page and restore it without losing the current chapter.

= 1.1.6 =
* Match the full reader height to the browser viewport and allow individual shortcodes to hide the bottom action bar.

= 1.1.5 =
* Put search in the reader header and simplify the verse menu and bookmark labels.
* Show dictionaries in the selected translation's language by default; let visitors explicitly enable other available modules.
* Keep saved passages and memory cards inside personal study rather than duplicating them in the verse menu.

= 1.1.4 =
* Keep book and chapter choices in the navigation dialog until a verse is selected; reuse the loaded chapter when opening it.

= 1.1.3 =
* Show actual verse text in cross references, omit technical mapping messages, and limit TSK references to Russian editions.
* Show at most 12 references and remove the duplicate Strong numbers menu action.
* Move comparison, references, and reading history into the verse menu; keep display and local-data controls together in settings.
* Simplify navigation to translation and book selectors above the chapter and verse grids.

= 1.1.2 =
* Put verse bookmarking and commentary in the verse action menu and remove duplicate toolbar actions.
* Show only the verse number before mapped comparison text.

= 1.1.1 =
* Hide inline Strong numbers by default; preserve each visitor's saved display preference.

= 1.1.0 =
* Add the Bible app reader layout, navigation, reading preferences, and continuous chapters.
* Add local notes, highlights, saved passages, and memory cards with JSON export.
* Render source annotations safely and admit linked references only with verified source evidence.

= 1.0.0 =
* API-connected reader, consent-based setup, persistent cache and background downloads.
* Translation comparison, study tools, passage blocks, shortcodes, and local reading aids.
* Preserve the legacy local BibleQuote reader and imported tables.

== Credits ==

Monomakh Unicode: Copyright 2025 The Monomakh Project Authors.
SIL Open Font License 1.1, included in assets/fonts/OFL-Monomakh.txt.
Source: https://github.com/slavonic/Monomakh

Plugin source and reproducible packaging/translation scripts:
https://github.com/VAtapin/georg-kloster-bible-reader
