<?php
/** Existing local BibleQuote reader. Tables and imported data retain their original names. @package GeorgKlosterBibleReader */
if ( ! defined( 'ABSPATH' ) ) {
	exit; }

function gkbr_legacy_hooks(): void {
	add_action( 'admin_menu', 'gkbr_legacy_admin_menu' );
	add_action( 'admin_enqueue_scripts', 'gkbr_legacy_admin_assets' );
	add_action( 'admin_post_gkbr_legacy_preview_import', 'gkbr_legacy_handle_preview_import' );
	add_action( 'admin_post_gkbr_legacy_import_module', 'gkbr_legacy_handle_import_module' );
	foreach ( array( 'modules', 'chapter', 'search', 'strong' ) as $operation ) {
		add_action( 'wp_ajax_gkbr_legacy_' . $operation, 'gkbr_legacy_ajax_' . $operation );
		add_action( 'wp_ajax_nopriv_gkbr_legacy_' . $operation, 'gkbr_legacy_ajax_' . $operation );
	}
}

/** Load the imported-module card styles only on their admin screen. */
function gkbr_legacy_admin_assets( string $hook_suffix ): void {
	if ( 'georg-kloster-bible-reader_page_gkbr-legacy-modules' !== $hook_suffix ) {
		return; }
	wp_enqueue_style( 'gkbr-legacy-admin', GKBR_URL . 'assets/legacy-admin.css', array(), GKBR_VERSION );
}

/** Cache reads of the retained local module tables independently from API responses. */
function gkbr_legacy_query( string $sql, string $format = ARRAY_A, bool $single = false ) {
	global $wpdb;
	$key   = hash( 'sha256', $sql . $format . ( $single ? 'single' : 'rows' ) . get_option( 'gkbr_legacy_generation', 'initial' ) );
	$found = false;
	$value = wp_cache_get( $key, 'gkbr_legacy', false, $found );
	if ( $found ) {
		return $value; }
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.PreparedSQL.NotPrepared,PluginCheck.Security.DirectDB.UnescapedDBParameter -- All callers prepare value placeholders; table identifiers use the trusted WordPress prefix. This helper has no public SQL input.
	$value = $single ? $wpdb->get_var( $sql ) : $wpdb->get_results( $sql, $format );
	wp_cache_set( $key, $value, 'gkbr_legacy', 300 );
	return $value;
}

/** Keep legacy importer writes and invalidate only the legacy reader cache. */
function gkbr_legacy_replace( string $table, array $data ): void {
	global $wpdb;
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Writes only plugin-owned import tables; their cache generation is changed immediately below.
	$wpdb->replace( $table, $data );
	update_option( 'gkbr_legacy_generation', wp_generate_uuid4(), false );
}

/**
 * Create plugin-owned tables. WordPress keeps this database separate from Laravel.
 */
function gkbr_legacy_install(): void {
	if ( get_option( 'gkbr_legacy_schema' ) === 1 ) {
		return; }
	global $wpdb;

	require_once ABSPATH . 'wp-admin/includes/upgrade.php';

	$charset = $wpdb->get_charset_collate();
	$prefix  = $wpdb->prefix . 'bd_';

	dbDelta(
		"
        CREATE TABLE {$prefix}modules (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            code VARCHAR(120) NOT NULL,
            name VARCHAR(255) NOT NULL,
            short_name VARCHAR(120) NULL,
            language_code VARCHAR(16) NOT NULL DEFAULT 'ru',
            description TEXT NULL,
            cover_id BIGINT UNSIGNED NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY code (code),
            KEY language_code (language_code)
        ) {$charset};
    "
	);

	dbDelta(
		"
        CREATE TABLE {$prefix}books (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            module_id BIGINT UNSIGNED NOT NULL,
            slug VARCHAR(120) NOT NULL,
            name VARCHAR(180) NOT NULL,
            short_name VARCHAR(80) NULL,
            book_order INT UNSIGNED NOT NULL DEFAULT 0,
            chapters_count INT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (id),
            UNIQUE KEY module_book (module_id, slug),
            KEY module_order (module_id, book_order)
        ) {$charset};
    "
	);

	dbDelta(
		"
        CREATE TABLE {$prefix}verses (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            module_id BIGINT UNSIGNED NOT NULL,
            book_id BIGINT UNSIGNED NOT NULL,
            chapter_number INT UNSIGNED NOT NULL,
            verse_number INT UNSIGNED NOT NULL,
            text LONGTEXT NOT NULL,
            text_plain LONGTEXT NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY verse_key (module_id, book_id, chapter_number, verse_number),
            KEY chapter_key (module_id, book_id, chapter_number),
            KEY search_key (module_id, chapter_number, verse_number)
        ) {$charset};
    "
	);

	dbDelta(
		"
        CREATE TABLE {$prefix}strong_entries (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            number VARCHAR(20) NOT NULL,
            title VARCHAR(255) NULL,
            content LONGTEXT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY number (number)
        ) {$charset};
    "
	);

	dbDelta(
		"
        CREATE TABLE {$prefix}cross_references (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            module_id BIGINT UNSIGNED NOT NULL,
            book_id BIGINT UNSIGNED NOT NULL,
            chapter_number INT UNSIGNED NOT NULL,
            verse_number INT UNSIGNED NOT NULL,
            target_ref VARCHAR(120) NOT NULL,
            target_text TEXT NULL,
            PRIMARY KEY (id),
            KEY source_key (module_id, book_id, chapter_number, verse_number)
        ) {$charset};
    "
	);
	update_option( 'gkbr_legacy_schema', 1, false );
}

/**
 * Register admin pages for modules and imports.
 */
function gkbr_legacy_admin_menu(): void {
	add_submenu_page(
		'gkbr-settings',
		__( 'Modules', 'georg-kloster-bible-reader' ),
		__( 'Modules', 'georg-kloster-bible-reader' ),
		'manage_options',
		'gkbr-legacy-modules',
		'gkbr_legacy_admin_modules_page'
	);

	add_submenu_page(
		'gkbr-settings',
		__( 'Import', 'georg-kloster-bible-reader' ),
		__( 'Import', 'georg-kloster-bible-reader' ),
		'manage_options',
		'gkbr-legacy-import',
		'gkbr_legacy_admin_import_page'
	);
}

/**
 * Render imported module cards in wp-admin.
 */
function gkbr_legacy_admin_modules_page(): void {
	global $wpdb;

	$modules = gkbr_legacy_query( "SELECT * FROM {$wpdb->prefix}bd_modules ORDER BY name ASC", OBJECT );
	?>
	<div class="wrap gkbr-legacy-admin">
		<h1><?php esc_html_e( 'Bible Desktop modules', 'georg-kloster-bible-reader' ); ?></h1>
		<p>
		<?php
		printf(
			/* translators: %s: shortcode for the previously imported local Bible modules. */
			esc_html__( 'Use the %s shortcode on any WordPress page.', 'georg-kloster-bible-reader' ),
			'<code>[bible_desktop source="local"]</code>'
		);
		?>
		</p>
		<div class="gkbr-legacy-admin-grid">
			<?php foreach ( $modules as $module ) : ?>
				<article class="gkbr-legacy-admin-card">
					<?php if ( (int) $module->cover_id > 0 ) : ?>
						<?php echo wp_get_attachment_image( (int) $module->cover_id, 'medium' ); ?>
					<?php else : ?>
						<div class="gkbr-legacy-admin-cover">BD</div>
					<?php endif; ?>
					<h2><?php echo esc_html( $module->name ); ?></h2>
					<p><strong><?php echo esc_html( $module->short_name ? $module->short_name : $module->code ); ?></strong> · <?php echo esc_html( $module->language_code ); ?></p>
					<p><?php echo esc_html( wp_trim_words( (string) $module->description, 28 ) ); ?></p>
				</article>
			<?php endforeach; ?>
		</div>
	</div>
	<?php
}

/**
 * Render upload and check/import controls.
 */
function gkbr_legacy_admin_import_page(): void {
	$preview = get_transient( 'gkbr_legacy_last_preview_' . get_current_user_id() );
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Import Bible module', 'georg-kloster-bible-reader' ); ?></h1>
		<p><?php esc_html_e( 'Upload a BibleQuote ZIP or a SQLite3 module. The plugin imports into its own WordPress tables.', 'georg-kloster-bible-reader' ); ?></p>

		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" enctype="multipart/form-data">
			<?php wp_nonce_field( 'gkbr_legacy_import' ); ?>
			<input type="hidden" name="action" value="gkbr_legacy_preview_import">
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="gkbr_legacy_module"><?php esc_html_e( 'Module file', 'georg-kloster-bible-reader' ); ?></label></th>
					<td><input id="gkbr_legacy_module" type="file" name="module_file" accept=".zip,.sqlite,.sqlite3,.SQLite3" required></td>
				</tr>
			</table>
			<?php submit_button( __( 'Check module', 'georg-kloster-bible-reader' ) ); ?>
		</form>

		<?php if ( is_array( $preview ) ) : ?>
			<hr>
			<h2><?php esc_html_e( 'Last check result', 'georg-kloster-bible-reader' ); ?></h2>
			<table class="widefat striped">
				<tbody>
					<tr><th><?php esc_html_e( 'File', 'georg-kloster-bible-reader' ); ?></th><td><?php echo esc_html( $preview['file'] ); ?></td></tr>
					<tr><th><?php esc_html_e( 'Format', 'georg-kloster-bible-reader' ); ?></th><td><?php echo esc_html( $preview['format'] ); ?></td></tr>
					<tr><th><?php esc_html_e( 'Name', 'georg-kloster-bible-reader' ); ?></th><td><?php echo esc_html( $preview['name'] ); ?></td></tr>
					<tr><th><?php esc_html_e( 'Language', 'georg-kloster-bible-reader' ); ?></th><td><?php echo esc_html( $preview['language_code'] ); ?></td></tr>
					<tr><th><?php esc_html_e( 'Books', 'georg-kloster-bible-reader' ); ?></th><td><?php echo esc_html( (string) $preview['books'] ); ?></td></tr>
					<tr><th><?php esc_html_e( 'Verses', 'georg-kloster-bible-reader' ); ?></th><td><?php echo esc_html( (string) $preview['verses'] ); ?></td></tr>
					<tr><th><?php esc_html_e( 'Strong', 'georg-kloster-bible-reader' ); ?></th><td><?php echo $preview['has_strong'] ? esc_html__( 'Yes', 'georg-kloster-bible-reader' ) : esc_html__( 'No', 'georg-kloster-bible-reader' ); ?></td></tr>
				</tbody>
			</table>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'gkbr_legacy_import' ); ?>
				<input type="hidden" name="action" value="gkbr_legacy_import_module">
				<input type="hidden" name="path" value="<?php echo esc_attr( $preview['path'] ); ?>">
				<?php submit_button( __( 'Import module', 'georg-kloster-bible-reader' ), 'primary' ); ?>
			</form>
		<?php endif; ?>
	</div>
	<?php
}

/**
 * Store an upload and show its parse preview.
 */
function gkbr_legacy_handle_preview_import(): void {
	if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'gkbr_legacy_import' ) ) {
		wp_die( esc_html__( 'Forbidden', 'georg-kloster-bible-reader' ) );
	}

	if ( ! isset( $_FILES['module_file'] ) ) {
		wp_die( esc_html__( 'No file uploaded.', 'georg-kloster-bible-reader' ) );
	}

	require_once ABSPATH . 'wp-admin/includes/file.php';
	$upload = wp_handle_upload( $_FILES['module_file'], array( 'test_form' => false ) );

	if ( ! empty( $upload['error'] ) ) {
		wp_die( esc_html( $upload['error'] ) );
	}

	gkbr_legacy_install();
	$preview = gkbr_legacy_scan_module( (string) $upload['file'] );
	set_transient( 'gkbr_legacy_last_preview_' . get_current_user_id(), $preview, HOUR_IN_SECONDS );

	wp_safe_redirect( admin_url( 'admin.php?page=gkbr-legacy-import' ) );
	exit;
}

/**
 * Import the checked module into WordPress tables.
 */
function gkbr_legacy_handle_import_module(): void {
	if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'gkbr_legacy_import' ) ) {
		wp_die( esc_html__( 'Forbidden', 'georg-kloster-bible-reader' ) );
	}

	$preview  = get_transient( 'gkbr_legacy_last_preview_' . get_current_user_id() );
	$path     = is_array( $preview ) ? (string) ( $preview['path'] ?? '' ) : '';
	$uploads  = wp_upload_dir();
	$resolved = '' !== $path ? realpath( $path ) : false;
	$base     = realpath( $uploads['basedir'] );
	if ( ! $resolved || ! $base || ! str_starts_with( wp_normalize_path( $resolved ), trailingslashit( wp_normalize_path( $base ) ) ) ) {
		wp_die( esc_html__( 'Import file is missing.', 'georg-kloster-bible-reader' ) );
	}

	if ( '' === $path || ! is_readable( $path ) ) {
		wp_die( esc_html__( 'Import file is missing.', 'georg-kloster-bible-reader' ) );
	}

	$result = gkbr_legacy_import_module( $path );
	set_transient( 'gkbr_legacy_last_preview_' . get_current_user_id(), $result, HOUR_IN_SECONDS );

	wp_safe_redirect( admin_url( 'admin.php?page=gkbr-legacy-import' ) );
	exit;
}

/**
 * Register frontend assets.
 */
function gkbr_legacy_register_assets(): void {
	wp_register_style( 'gkbr-legacy', GKBR_URL . 'assets/legacy.css', array(), GKBR_VERSION );
	wp_register_script( 'gkbr-legacy', GKBR_URL . 'assets/legacy.js', array(), GKBR_VERSION, true );
}

/**
 * Render the frontend reader.
 */
function gkbr_legacy_shortcode(): string {
	gkbr_legacy_register_assets();
	wp_enqueue_style( 'gkbr-legacy' );
	wp_enqueue_script( 'gkbr-legacy' );
	wp_localize_script(
		'gkbr-legacy',
		'gkbr_legacy_config',
		array(
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce'   => wp_create_nonce( 'gkbr_legacy_ajax' ),
			'ui'      => array(
				'loading'   => __( 'Loading…', 'georg-kloster-bible-reader' ),
				'empty'     => __( 'No results.', 'georg-kloster-bible-reader' ),
				'noModules' => __( 'No imported modules yet.', 'georg-kloster-bible-reader' ),
			),
		)
	);

	return '<div class="gkbr-legacy" data-gkbr-legacy-reader>
        <header class="gkbr-legacy-toolbar">
            <select data-gkbr-legacy-module></select>
            <select data-gkbr-legacy-book></select>
            <select data-gkbr-legacy-chapter></select>
            <label><input type="checkbox" data-gkbr-legacy-strong-toggle> ' . esc_html__( 'Strong numbers', 'georg-kloster-bible-reader' ) . '</label>
            <input type="search" data-gkbr-legacy-search placeholder="' . esc_attr__( 'Search Bible', 'georg-kloster-bible-reader' ) . '">
            <button type="button" data-gkbr-legacy-search-button>' . esc_html__( 'Search', 'georg-kloster-bible-reader' ) . '</button>
        </header>
        <main class="gkbr-legacy-layout">
            <section class="gkbr-legacy-text" data-gkbr-legacy-text></section>
            <aside class="gkbr-legacy-side" data-gkbr-legacy-side></aside>
        </main>
    </div>';
}

/**
 * AJAX: return modules with nested books.
 */
function gkbr_legacy_ajax_modules(): void {
	gkbr_legacy_verify_ajax();
	global $wpdb;

	$modules = gkbr_legacy_query( "SELECT * FROM {$wpdb->prefix}bd_modules WHERE is_active = 1 ORDER BY name ASC", ARRAY_A );

	foreach ( $modules as &$module ) {
		$module['books'] = gkbr_legacy_query(
			$wpdb->prepare(
				"SELECT id, slug, name, short_name, chapters_count FROM {$wpdb->prefix}bd_books WHERE module_id = %d ORDER BY book_order ASC",
				(int) $module['id']
			),
			ARRAY_A
		);
	}

	wp_send_json_success( $modules );
}

/**
 * AJAX: return one chapter.
 */
function gkbr_legacy_ajax_chapter(): void {
	gkbr_legacy_verify_ajax();
	global $wpdb;

	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only request; nonce already verified by gkbr_legacy_verify_ajax.
	$input     = wp_unslash( $_GET );
	$module_id = gkbr_number( gkbr_input( $input, 'module_id' ) );
	$book_id   = gkbr_number( gkbr_input( $input, 'book_id' ) );
	$chapter   = gkbr_number( gkbr_input( $input, 'chapter', '1' ), 200 );

	$verses = gkbr_legacy_query(
		$wpdb->prepare(
			"SELECT verse_number, text FROM {$wpdb->prefix}bd_verses WHERE module_id = %d AND book_id = %d AND chapter_number = %d ORDER BY verse_number ASC",
			$module_id,
			$book_id,
			$chapter
		),
		ARRAY_A
	);

	foreach ( $verses as &$verse ) {
		$verse['html'] = gkbr_legacy_render_verse_text( (string) $verse['text'] );
	}

	wp_send_json_success( $verses );
}

/**
 * AJAX: search imported verses.
 */
function gkbr_legacy_ajax_search(): void {
	gkbr_legacy_verify_ajax();
	global $wpdb;

	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only request; nonce already verified by gkbr_legacy_verify_ajax.
	$input     = wp_unslash( $_GET );
	$module_id = gkbr_number( gkbr_input( $input, 'module_id' ) );
	$query     = gkbr_input( $input, 'q' );

	if ( mb_strlen( $query ) < 2 ) {
		wp_send_json_success( array() );
	}

	$like = '%' . $wpdb->esc_like( mb_strtolower( $query ) ) . '%';
	$rows = gkbr_legacy_query(
		$wpdb->prepare(
			"SELECT v.id, v.book_id, v.chapter_number, v.verse_number, v.text_plain, b.name AS book_name
             FROM {$wpdb->prefix}bd_verses v
             INNER JOIN {$wpdb->prefix}bd_books b ON b.id = v.book_id
             WHERE v.module_id = %d AND LOWER(v.text_plain) LIKE %s
             ORDER BY b.book_order ASC, v.chapter_number ASC, v.verse_number ASC
             LIMIT 50",
			$module_id,
			$like
		),
		ARRAY_A
	);

	wp_send_json_success( $rows );
}

/**
 * AJAX: return Strong dictionary entry.
 */
function gkbr_legacy_ajax_strong(): void {
	gkbr_legacy_verify_ajax();
	global $wpdb;

	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only request; nonce already verified by gkbr_legacy_verify_ajax.
	$input   = wp_unslash( $_GET );
	$number  = strtoupper( preg_replace( '/[^GH0-9]/i', '', gkbr_input( $input, 'number' ) ) );
	$entries = gkbr_legacy_query(
		$wpdb->prepare( "SELECT number, title, content FROM {$wpdb->prefix}bd_strong_entries WHERE number = %s", $number ),
		ARRAY_A
	);
	$entry   = $entries[0] ?? null;

	if ( ! $entry ) {
		$entry = array(
			'number'  => $number,
			'title'   => 'Strong ' . $number,
			'content' => __( 'Dictionary entry is not imported yet.', 'georg-kloster-bible-reader' ),
		);
	}

	wp_send_json_success( $entry );
}

/**
 * Scan ZIP/SQLite3 and return a preview.
 *
 * @return array<string, mixed>
 */
function gkbr_legacy_scan_module( string $path ): array {
	$format     = preg_match( '/\.zip$/i', $path ) ? 'BibleQuote ZIP' : 'SQLite3';
	$name       = pathinfo( $path, PATHINFO_FILENAME );
	$language   = gkbr_legacy_guess_language( $name );
	$books      = 0;
	$verses     = 0;
	$has_strong = false;

	if ( 'BibleQuote ZIP' === $format && class_exists( 'ZipArchive' ) ) {
		$zip = new ZipArchive();

		if ( $zip->open( $path ) === true ) {
			// phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- Native ZipArchive property.
			for ( $i = 0; $i < $zip->numFiles; $i++ ) {
				$entry = $zip->getNameIndex( $i );

				if ( ! preg_match( '/\.(?:htm|html|txt)$/i', $entry ) ) {
					continue;
				}

				$content = (string) $zip->getFromIndex( $i );
				++$books;
				$verses    += gkbr_legacy_count_verses( $content );
				$has_strong = $has_strong || preg_match( '/\b(?:[GH]\d{1,5}|\d{1,5})\b/u', $content ) === 1;
			}

			$zip->close();
		}
	}

	return array(
		'path'          => $path,
		'file'          => basename( $path ),
		'format'        => $format,
		'name'          => $name,
		'language_code' => $language,
		'books'         => $books,
		'verses'        => $verses,
		'has_strong'    => $has_strong,
	);
}

/**
 * Import a module file. ZIP import is implemented first; SQLite3 preview is reserved.
 *
 * @return array<string, mixed>
 */
function gkbr_legacy_import_module( string $path ): array {
	$preview = gkbr_legacy_scan_module( $path );

	if ( 'BibleQuote ZIP' !== $preview['format'] ) {
		$preview['message'] = 'SQLite3 preview is available; importer will be added after table variants are mapped.';

		return $preview;
	}

	if ( ! class_exists( 'ZipArchive' ) ) {
		wp_die( esc_html__( 'PHP ZipArchive extension is required.', 'georg-kloster-bible-reader' ) );
	}

	global $wpdb;

	$now         = current_time( 'mysql' );
	$module_code = sanitize_title( $preview['name'] ) . '-' . substr( md5( (string) $path ), 0, 8 );

	gkbr_legacy_replace(
		$wpdb->prefix . 'bd_modules',
		array(
			'code'          => $module_code,
			'name'          => (string) $preview['name'],
			'short_name'    => (string) $preview['name'],
			'language_code' => (string) $preview['language_code'],
			'description'   => '',
			'is_active'     => 1,
			'created_at'    => $now,
			'updated_at'    => $now,
		)
	);
	$module_id = (int) gkbr_legacy_query( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}bd_modules WHERE code = %s", $module_code ), ARRAY_A, true );

	$zip = new ZipArchive();
	$zip->open( $path );
	$imported_books  = 0;
	$imported_verses = 0;

	// phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- Native ZipArchive property.
	for ( $i = 0; $i < $zip->numFiles; $i++ ) {
		$entry = $zip->getNameIndex( $i );

		if ( ! preg_match( '/\.(?:htm|html|txt)$/i', $entry ) ) {
			continue;
		}

		$book    = gkbr_legacy_book_from_entry( $entry, $imported_books + 1 );
		$content = (string) $zip->getFromIndex( $i );
		$verses  = gkbr_legacy_extract_verses( $content );

		if ( array() === $verses ) {
			continue;
		}

		gkbr_legacy_replace(
			$wpdb->prefix . 'bd_books',
			array(
				'module_id'      => $module_id,
				'slug'           => $book['slug'],
				'name'           => $book['name'],
				'short_name'     => $book['short_name'],
				'book_order'     => $book['order'],
				'chapters_count' => max( array_column( $verses, 'chapter' ) ),
			)
		);
		$book_id = (int) gkbr_legacy_query(
			$wpdb->prepare(
				"SELECT id FROM {$wpdb->prefix}bd_books WHERE module_id = %d AND slug = %s",
				$module_id,
				$book['slug']
			),
			ARRAY_A,
			true
		);

		foreach ( $verses as $verse ) {
			$text = gkbr_legacy_clean_import_text( $verse['text'] );
			gkbr_legacy_replace(
				$wpdb->prefix . 'bd_verses',
				array(
					'module_id'      => $module_id,
					'book_id'        => $book_id,
					'chapter_number' => (int) $verse['chapter'],
					'verse_number'   => (int) $verse['verse'],
					'text'           => $text,
					'text_plain'     => gkbr_legacy_plain_text( $text ),
				)
			);
			++$imported_verses;
		}

		++$imported_books;
	}

	$zip->close();

	$preview['books']   = $imported_books;
	$preview['verses']  = $imported_verses;
	$preview['message'] = 'Imported.';

	return $preview;
}

/**
 * Extract simple chapter/verse records from BibleQuote-like HTML/TXT.
 *
 * @return list<array{chapter: int, verse: int, text: string}>
 */
function gkbr_legacy_extract_verses( string $content ): array {
	$content = html_entity_decode( $content, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	$content = preg_replace( '/<\s*br\s*\/?>/iu', "\n", $content ) ?? $content;
	$content = preg_replace( '/<\s*\/p\s*>/iu', "\n", $content ) ?? $content;
	$content = strip_tags( $content, '<font>' );
	$lines   = preg_split( '/\R/u', $content );
	$lines   = is_array( $lines ) ? $lines : array();
	$chapter = 1;
	$verses  = array();

	foreach ( $lines as $line ) {
		$line = trim( $line );

		if ( '' === $line ) {
			continue;
		}

		if ( preg_match( '/^(?:chapter|глава|kapitel)\s+(\d{1,3})/iu', $line, $matches ) ) {
			$chapter = (int) $matches[1];
			continue;
		}

		if ( preg_match( '/^(\d{1,3})\s+(.+)$/u', $line, $matches ) ) {
			$verses[] = array(
				'chapter' => $chapter,
				'verse'   => (int) $matches[1],
				'text'    => $matches[2],
			);
		}
	}

	return $verses;
}

/**
 * Count probable verse lines for admin preview.
 */
function gkbr_legacy_count_verses( string $content ): int {
	return count( gkbr_legacy_extract_verses( $content ) );
}

/**
 * Convert imported raw verse to safe stored text while preserving Strong numbers.
 */
function gkbr_legacy_clean_import_text( string $text ): string {
	$text = html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	$text = preg_replace( '/<\s*font\b[^>]*color\s*=\s*["\']?darkred["\']?[^>]*>/iu', '<span class="bd-red">', $text ) ?? $text;
	$text = preg_replace( '/<\s*\/\s*font\s*>/iu', '</span>', $text ) ?? $text;
	$text = strip_tags( $text, '<span>' );
	$text = preg_replace( '/\s+([,.;:!?»])/u', '$1', $text ) ?? $text;

	return preg_replace( '/\s{2,}/u', ' ', trim( $text ) ) ?? trim( $text );
}

/**
 * Build plain searchable text without Strong numbers or HTML.
 */
function gkbr_legacy_plain_text( string $text ): string {
	$text = preg_replace( '/\s*\b(?:[GH]\d{1,5}|\d{1,5})\b/u', '', $text ) ?? $text;
	$text = wp_strip_all_tags( $text );

	return preg_replace( '/\s{2,}/u', ' ', trim( $text ) ) ?? trim( $text );
}

/**
 * Render verse text with clickable Strong numbers hidden by default.
 */
function gkbr_legacy_render_verse_text( string $text ): string {
	$safe = wp_kses(
		$text,
		array(
			'span' => array( 'class' => true ),
		)
	);

	return preg_replace_callback(
		'/\b(?:[GH]\d{1,5}|\d{1,5})\b/u',
		static function ( array $matches ): string {
			$number = esc_attr( $matches[0] );

			return '<button type="button" class="bd-strong-number" data-strong="' . $number . '">' . $number . '</button>';
		},
		$safe
	) ?? $safe;
}

/**
 * Infer book metadata from a module entry path.
 *
 * @return array{slug: string, name: string, short_name: string, order: int}
 */
function gkbr_legacy_book_from_entry( string $entry, int $order ): array {
	$base       = pathinfo( $entry, PATHINFO_FILENAME );
	$clean_base = preg_replace( '/^\d+[_\-\s]*/', '', $base );
	$base       = $clean_base ? $clean_base : $base;
	$name       = trim( str_replace( array( '_', '-' ), ' ', $base ) );

	return array(
		'slug'       => sanitize_title( $base ? $base : 'book-' . $order ),
		'name'       => $name ? $name : __( 'Book', 'georg-kloster-bible-reader' ) . ' ' . $order,
		'short_name' => $name ? $name : __( 'Book', 'georg-kloster-bible-reader' ) . ' ' . $order,
		'order'      => $order,
	);
}

/**
 * Guess language from file/module naming.
 */
function gkbr_legacy_guess_language( string $name ): string {
	$value = mb_strtolower( $name );

	return match ( true ) {
		str_contains( $value, 'ukrain' ) || str_contains( $value, 'укра' ) => 'uk',
		str_contains( $value, 'german' ) || str_contains( $value, 'deutsch' ) || str_contains( $value, 'elberfelder' ) => 'de',
		str_contains( $value, 'english' ) || str_contains( $value, 'kjv' ) || str_contains( $value, 'nasb' ) => 'en',
		str_contains( $value, 'poland' ) || str_contains( $value, 'polish' ) || str_contains( $value, 'gda' ) => 'pl',
		str_contains( $value, 'russian' ) || str_contains( $value, 'синод' ) || str_contains( $value, 'рус' ) => 'ru',
		default => 'ru',
	};
}

/**
 * Basic nonce gate for public AJAX reads.
 */
function gkbr_legacy_verify_ajax(): void {
	$get   = wp_unslash( $_GET );
	$post  = wp_unslash( $_POST );
	$nonce = gkbr_input( $get, 'nonce', gkbr_input( $post, 'nonce' ) );

	if ( ! wp_verify_nonce( $nonce, 'gkbr_legacy_ajax' ) ) {
		wp_send_json_error( array( 'message' => __( 'Bad nonce', 'georg-kloster-bible-reader' ) ), 403 );
	}
}
