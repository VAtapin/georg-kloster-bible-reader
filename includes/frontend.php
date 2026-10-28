<?php
/** Shortcodes, dynamic blocks, and localized reader configuration. @package GeorgKlosterBibleReader */
if ( ! defined( 'ABSPATH' ) ) {
	exit; }

function gkbr_register_assets(): void {
	wp_register_style( 'gkbr-reader', GKBR_URL . 'assets/reader.css', array(), (string) filemtime( GKBR_DIR . 'assets/reader.css' ) );
	wp_register_script( 'gkbr-personal', GKBR_URL . 'assets/personal-study.js', array(), GKBR_VERSION, true );
	wp_register_script( 'gkbr-source', GKBR_URL . 'assets/source-text.js', array(), GKBR_VERSION, true );
	wp_register_script( 'gkbr-references', GKBR_URL . 'assets/reference-target.js', array(), GKBR_VERSION, true );
	wp_register_script( 'gkbr-continuous', GKBR_URL . 'assets/continuous-reader.js', array(), GKBR_VERSION, true );
	wp_register_script( 'gkbr-shell', GKBR_URL . 'assets/reader-shell.js', array( 'gkbr-personal' ), (string) filemtime( GKBR_DIR . 'assets/reader-shell.js' ), true );
	wp_register_script( 'gkbr-reader', GKBR_URL . 'assets/reader.js', array( 'gkbr-shell', 'gkbr-source', 'gkbr-references', 'gkbr-continuous' ), (string) filemtime( GKBR_DIR . 'assets/reader.js' ), true );
}

function gkbr_editor_assets(): void {
	wp_enqueue_script( 'gkbr-editor', GKBR_URL . 'assets/editor.js', array( 'wp-blocks', 'wp-element', 'wp-components', 'wp-block-editor', 'wp-i18n' ), GKBR_VERSION, true );
	wp_localize_script(
		'gkbr-editor',
		'gkbr_editor_config',
		array(
			'ajax'      => admin_url( 'admin-ajax.php' ),
			'connected' => (bool) gkbr_settings()['consent'],
			'default'   => gkbr_settings()['default'],
		)
	);
	wp_set_script_translations( 'gkbr-editor', 'georg-kloster-bible-reader', GKBR_DIR . 'languages' );
}

function gkbr_ui_strings(): array {
	return array_merge(
		gkbr_reader_ui_strings(),
		array(
			'tools'              => __( 'Study tools and bookmarks', 'georg-kloster-bible-reader' ),
			'fullChapter'        => __( 'Read full chapter', 'georg-kloster-bible-reader' ),
			'translation'        => __( 'Translation', 'georg-kloster-bible-reader' ),
			'book'               => __( 'Book', 'georg-kloster-bible-reader' ),
			'chapter'            => __( 'Chapter', 'georg-kloster-bible-reader' ),
			'verse'              => __( 'Verse', 'georg-kloster-bible-reader' ),
			'compare'            => __( 'Compare translation', 'georg-kloster-bible-reader' ),
			'none'               => __( 'None', 'georg-kloster-bible-reader' ),
			'loading'            => __( 'Loading…', 'georg-kloster-bible-reader' ),
			'search'             => __( 'Search', 'georg-kloster-bible-reader' ),
			'previous'           => __( 'Previous chapter', 'georg-kloster-bible-reader' ),
			'next'               => __( 'Next chapter', 'georg-kloster-bible-reader' ),
			'open'               => __( 'Open', 'georg-kloster-bible-reader' ),
			'close'              => __( 'Close', 'georg-kloster-bible-reader' ),
			'empty'              => __( 'No results.', 'georg-kloster-bible-reader' ),
			'error'              => __( 'Could not load this material. Please try again later.', 'georg-kloster-bible-reader' ),
			'retry'              => __( 'Retry', 'georg-kloster-bible-reader' ),
			'size'               => __( 'Text size', 'georg-kloster-bible-reader' ),
			'commentaries'       => __( 'Commentary', 'georg-kloster-bible-reader' ),
			'references'         => __( 'Cross references', 'georg-kloster-bible-reader' ),
			'strong'             => __( 'Strong numbers', 'georg-kloster-bible-reader' ),
			'dictionaries'       => __( 'Dictionaries and maps', 'georg-kloster-bible-reader' ),
			'module'             => __( 'Study module', 'georg-kloster-bible-reader' ),
			'study'              => __( 'Select a verse to study it.', 'georg-kloster-bible-reader' ),
			'unmapped'           => __( 'No stored correspondence for this verse. No numbering shift was guessed.', 'georg-kloster-bible-reader' ),
			'mapping'            => __( 'Comparison follows stored verse IDs. Unverified source numbering may differ, especially in Psalms.', 'georg-kloster-bible-reader' ),
			'unverified'         => __( 'Source numbering is not verified. The reference is shown without an automatic text match.', 'georg-kloster-bible-reader' ),
			'bookmark'           => __( 'Bookmark verse', 'georg-kloster-bible-reader' ),
			'bookmarks'          => __( 'My bookmarks', 'georg-kloster-bible-reader' ),
			'enableDictionaries' => __( 'Enable other dictionaries', 'georg-kloster-bible-reader' ),
			'history'            => __( 'Reading history', 'georg-kloster-bible-reader' ),
			'remember'           => __( 'Remember reading history in this browser', 'georg-kloster-bible-reader' ),
			'clear'              => __( 'Clear local bookmarks and history', 'georg-kloster-bible-reader' ),
			'share'              => __( 'Link to selected verse', 'georg-kloster-bible-reader' ),
			'more'               => __( 'More results', 'georg-kloster-bible-reader' ),
			'storage'            => __( 'Browser storage is unavailable.', 'georg-kloster-bible-reader' ),
			'offline'            => __( 'Already cached chapters remain available when Bible Desktop is unavailable.', 'georg-kloster-bible-reader' ),
			'local'              => __( 'Bookmarks and history stay in this browser.', 'georg-kloster-bible-reader' ),
		)
	);
}

function gkbr_reader_shortcode( $attributes = array() ): string {
	$attributes = is_array( $attributes ) ? $attributes : array();
	if ( ( $attributes['source'] ?? '' ) === 'local' ) {
		return gkbr_legacy_shortcode(); }
	return gkbr_render_reader( $attributes, false );
}

function gkbr_passage_shortcode( $attributes = array() ): string {
	return gkbr_render_reader( is_array( $attributes ) ? $attributes : array(), true );
}

function gkbr_render_reader( array $attributes, bool $passage ): string {
	// Initialize WordPress' script/style registries before the temporary reader locale.
	gkbr_register_assets();
	$settings        = gkbr_settings();
	$controller      = WP_Translation_Controller::get_instance();
	$original_locale = $controller->get_locale();
	$switched        = '' !== $settings['locale'] && switch_to_locale( $settings['locale'] );
	$override        = false;
	$manual_locale   = false;
	if ( '' !== $settings['locale'] && ! $switched && get_locale() !== $settings['locale'] ) {
		$domain        = 'georg-kloster-bible-reader';
		$file          = $domain . '-' . $settings['locale'] . '.mo';
		$path          = is_file( WP_LANG_DIR . '/plugins/' . $file ) ? WP_LANG_DIR . '/plugins/' . $file : GKBR_DIR . 'languages/' . $file;
		$manual_locale = true;
		$controller->set_locale( $settings['locale'] );
		unload_textdomain( $domain );
		$override = load_textdomain( $domain, $path, $settings['locale'] );
	}
	try {
		if ( ! $settings['consent'] || ! $settings['translations'] ) {
			return '<p class="gkbr-message">' . esc_html__( 'The Bible reader is not configured yet.', 'georg-kloster-bible-reader' ) . '</p>';
		}
		wp_enqueue_style( 'gkbr-reader' );
		wp_enqueue_script( 'gkbr-reader' );
		$requested   = gkbr_input( $attributes, 'translation' );
		$translation = '' !== $requested ? $requested : $settings['default'];
		if ( ! in_array( $translation, $settings['translations'], true ) ) {
			return '<p class="gkbr-message">' . esc_html__( 'Choose a translation enabled by the administrator.', 'georg-kloster-bible-reader' ) . '</p>'; }
		$chapter = gkbr_number( gkbr_input( $attributes, 'chapter', '1' ), 200 );
		$chapter = $chapter > 0 ? $chapter : 1;
		$from    = gkbr_number( gkbr_input( $attributes, 'from', gkbr_input( $attributes, 'verse', '0' ) ), 200 );
		$to      = gkbr_number( gkbr_input( $attributes, 'to', '0' ), 200 );
		$config  = array(
			'ajax'        => admin_url( 'admin-ajax.php' ),
			'passage'     => $passage,
			'bottom'      => 'no' !== strtolower( gkbr_input( $attributes, 'bottom', 'yes' ) ),
			'restore'     => ! $passage && empty( $attributes['book'] ) && empty( $attributes['translation'] ),
			'initial'     => array(
				'translation' => $translation,
				'book'        => gkbr_input( $attributes, 'book' ),
				'chapter'     => $chapter,
				'verse'       => $from,
			),
			'from'        => $from,
			'to'          => $to ? $to : ( $passage && $from ? $from : 0 ),
			'ui'          => gkbr_ui_strings(),
			'families'    => gkbr_language_groups(),
			'groupLabels' => gkbr_group_labels(),
			'font'        => GKBR_URL . 'assets/fonts/MonomakhUnicode.ttf',
		);
		$html    = '<section class="gkbr-reader" data-gkbr-reader data-config="' . esc_attr( wp_json_encode( $config ) ) . '" aria-label="' . esc_attr__( 'Bible Reader', 'georg-kloster-bible-reader' ) . '"><p role="status">' . esc_html__( 'Loading…', 'georg-kloster-bible-reader' ) . '</p></section>';
		if ( $settings['credit'] ) {
			$html .= '<p class="gkbr-credit"><a href="https://bible-desktop.com/" rel="noopener noreferrer">Bible Desktop</a></p>'; }
		return $html;
	} finally {
		if ( $switched ) {
			restore_previous_locale(); }
		if ( $override ) {
			unload_textdomain( 'georg-kloster-bible-reader' );
			gkbr_load_bundled_textdomain( $original_locale ); }
		if ( $manual_locale ) {
			$controller->set_locale( $original_locale ); }
	}
}

function gkbr_link_shortcode( $attributes = array(), $content = '' ): string {
	$attributes = is_array( $attributes ) ? $attributes : array();
	$label      = '' !== $content ? wp_strip_all_tags( $content ) : gkbr_input( $attributes, 'book' ) . ' ' . gkbr_input( $attributes, 'chapter', '1' ) . ':' . gkbr_input( $attributes, 'verse', '1' );
	return '<details class="gkbr-reference"><summary>' . esc_html( $label ) . '</summary>' . gkbr_reader_shortcode( $attributes ) . '</details>';
}
