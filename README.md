# Georg Kloster Bible Reader

Bible reading and study plugin for WordPress. Slug, directory and text domain:
`georg-kloster-bible-reader`. Version: 1.1.10. See [readme.txt](readme.txt)
for installation, external-service disclosure, licensing, and shortcodes.

## Features

- Activation setup, explicit consent before external requests, selected translations/default and reader language.
- Reading, search, verse links and comparison using stored canonical IDs resolved to actual module chapters.
- Commentary selection, verified cross-reference navigation, Strong entries, dictionaries and locally cached maps.
- Gutenberg reader/passage blocks, single-chapter passage embeds, inline references and full-chapter expansion.
- One-year chapter cache, 90-day study cache, daily catalogs, content revisions and transient-error fallback.
- Small-batch WP-Cron full-edition downloads with progress and stop/resume after API connection.
- Local bookmarks, optional browser reading history, EN/RU/DE gettext interface and bundled licensed Monomakh.
- Existing BibleQuote import and original `wp_bd_*` tables retained with `[bible_desktop source="local"]`.

No calendar, daily readings, prayer book, AI integration, account sync or browser-offline application.
No destructive uninstall. Source-numbering limitations remain explicit rather than guessed.

## Localized directory descriptions

The following copy is prepared for the localized WordPress.org plugin pages. Short descriptions are under 150 characters.

### Русский

**Краткое описание:** Читайте Библию, сравнивайте переводы, ищите в тексте и добавляйте библейские отрывки на сайт WordPress.

**Полное описание:** Georg Kloster Bible Reader — читалка и инструмент для изучения Библии в WordPress. Читайте главы, ищите по тексту, открывайте прямые ссылки на стихи и сравнивайте переводы по сохранённым соответствиям. Используйте комментарии, перекрёстные ссылки, записи Strong, словари и карты атласа. Добавляйте читалку или отдельные отрывки с помощью блоков Gutenberg и шорткодов. Закладки, заметки, выделения, сохранённые отрывки, карточки для запоминания и необязательная история чтения хранятся в браузере. Главы и материалы для изучения кэшируются на сервере; выбранные издания можно загружать небольшими фоновыми пакетами. Ранее импортированные модули BibleQuote доступны через локальную читалку.

### Deutsch

**Kurzbeschreibung:** Bibel lesen, Übersetzungen vergleichen, in der Schrift suchen und Bibelstellen in WordPress einbetten.

**Vollständige Beschreibung:** Georg Kloster Bible Reader ist ein Bibellese- und Studienwerkzeug für WordPress. Lesen Sie Kapitel, durchsuchen Sie die Bibel, öffnen Sie direkte Verslinks und vergleichen Sie Übersetzungen anhand gespeicherter Verszuordnungen. Nutzen Sie Kommentare, Querverweise, Strong-Einträge, Wörterbücher und Atlasbilder. Binden Sie den vollständigen Leser oder einzelne Abschnitte mit Gutenberg-Blöcken und Shortcodes ein. Lesezeichen, Notizen, Markierungen, gespeicherte Abschnitte, Lernkarten und der optionale Leseverlauf werden im Browser gespeichert. Kapitel und Studienmaterialien werden auf dem Server zwischengespeichert; ausgewählte Ausgaben lassen sich in kleinen Hintergrundpaketen laden. Bereits importierte BibleQuote-Module bleiben über den lokalen Leser verfügbar.

### Українська

**Короткий опис:** Читайте Біблію, порівнюйте переклади, шукайте в тексті та додавайте біблійні уривки на сайт WordPress.

**Повний опис:** Georg Kloster Bible Reader — читалка та інструмент для вивчення Біблії у WordPress. Читайте розділи, шукайте за текстом, відкривайте прямі посилання на вірші та порівнюйте переклади за збереженими відповідностями. Користуйтеся коментарями, перехресними посиланнями, записами Strong, словниками та зображеннями атласу. Додавайте читалку або окремі уривки за допомогою блоків Gutenberg і шорткодів. Закладки, нотатки, виділення, збережені уривки, картки для запам’ятовування та необов’язкова історія читання зберігаються у браузері. Розділи й матеріали для вивчення кешуються на сервері; вибрані видання можна завантажувати невеликими фоновими пакетами. Раніше імпортовані модулі BibleQuote доступні у локальній читалці.

### Polski

**Krótki opis:** Czytaj Biblię, porównuj przekłady, szukaj w Piśmie i osadzaj fragmenty na stronie WordPress.

**Pełny opis:** Georg Kloster Bible Reader to czytnik i narzędzie do studiowania Biblii w WordPressie. Czytaj rozdziały, wyszukuj w Piśmie, otwieraj bezpośrednie odnośniki do wersetów i porównuj przekłady według zapisanych odpowiedników. Korzystaj z komentarzy, odsyłaczy, haseł Strong, słowników i map atlasu. Dodaj czytnik lub wybrane fragmenty za pomocą bloków Gutenberg i shortcode’ów. Zakładki, notatki, zaznaczenia, zapisane fragmenty, fiszki i opcjonalna historia czytania są przechowywane w przeglądarce. Rozdziały i materiały do studiowania są buforowane na serwerze; wybrane wydania można pobierać w małych pakietach w tle. Wcześniej zaimportowane moduły BibleQuote pozostają dostępne w lokalnym czytniku.
## Verification

From the repository root:

```powershell
node scripts/build-wordpress-reader-translations.mjs
node scripts/test-wordpress-reader.mjs
.\tools\php.ps1 tests/wordpress-reader-live.php .tmp/gkbr-wordpress
.\scripts\package-wordpress-reader.ps1
```

The runner creates an isolated WordPress/SQLite site and fresh database in
`.tmp/gkbr-wordpress`. Set `GKBR_WP_TEMPLATE` to WordPress core with the official
SQLite Database Integration drop-in; by default the existing neighbouring
Kalendar test installation is used. Set `GKBR_PLAYWRIGHT_PACKAGE` to a
package.json with Playwright (default: Kalendar) and `GKBR_BROWSER_CHANNEL`
to an installed browser (default: msedge). No other site's database, settings,
credentials or installed plugins are copied or modified.

Deterministic fixtures exercise errors, numbering differences, maps and the browser.
The separate live test makes read-only calls to the real public API.

With official Plugin Check and WP-CLI in the disposable test site:

```powershell
.\tools\php.ps1 .tmp/gkbr-wp-cli.phar --path=.tmp/gkbr-wordpress --require=.tmp/gkbr-wordpress/wp-content/plugins/plugin-check/cli.php plugin check georg-kloster-bible-reader
.\tools\php.ps1 .tmp/gkbr-wordpress/wp-content/plugins/plugin-check/vendor/bin/phpcs --standard=WordPress-Core --extensions=php wordpress-plugin/georg-kloster-bible-reader
```

Narrow explained exceptions cover read-only anonymous endpoints, owned
cache/legacy tables, native ZipArchive naming, and validated binary output.
Automated checks do not constitute WordPress.org approval.

## Packaging and migration

Connection settings, imported modules, and imports live in the plugin's own
Georg Kloster Bible Reader admin menu. Activation and saving settings return there.
The catalogue follows the application's language families → languages → Bible,
New Testament, or other editions. Coverage comes from API metadata; hidden
checked editions remain selected when changing filters.

`scripts/package-wordpress-reader.ps1` creates an installation ZIP with RU/DE
and a WordPress.org ZIP with English/POT but without bundled PO/MO/JSON language
catalogs, following the established submission workflow. ZIPs are written to
`releases/georg-kloster-bible-reader/<version>/`, not committed. The directory
and ZIP names use the version in the plugin header. `-OutputDirectory` can
override the destination inside this workspace. Human-readable runtime code needs no build.
Scripts/styles/fonts are local; Gutenberg uses WordPress packages.

Before installing the new ZIP, deactivate `bible-desktop-reader`. Imported tables
remain intact. After API setup, `[bible_desktop]` opens the API reader; use
`source="local"` for imported modules. SQLite preview still does not import
SQLite editions, and legacy Strong-dictionary imports remain unsupported.

`[bible_desktop bottom="no"]` hides the bottom action bar for that reader.
Its actions remain available from **More** in the header. The full reader
uses the browser viewport height. The header's full-screen button opens the
same reader above the WordPress page and returns it to its original position.

Packaging does not create Git tags, GitHub releases, SVN uploads, deployments, or submissions.
