<?php
/**
 * Plugin Name: Georg Kloster Bible Reader
 * Plugin URI: https://bible-desktop.com/
 * Description: Read and study the Bible, compare translations, and embed passages using Bible Desktop.
 * Version: 1.1.11
 * Requires at least: 6.5
 * Requires PHP: 8.2
 * Author: Vladimir Atapin
 * Author URI: https://atapin.de/
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: georg-kloster-bible-reader
 * Domain Path: /languages
 *
 * @package GeorgKlosterBibleReader
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GKBR_VERSION', '1.1.11' );
define( 'GKBR_FILE', __FILE__ );
define( 'GKBR_DIR', plugin_dir_path( __FILE__ ) );
define( 'GKBR_URL', plugin_dir_url( __FILE__ ) );
define( 'GKBR_API', 'https://bible-desktop.com/api/' );

require_once GKBR_DIR . 'includes/cache.php';
require_once GKBR_DIR . 'includes/api.php';
require_once GKBR_DIR . 'includes/admin.php';
require_once GKBR_DIR . 'includes/catalog.php';
require_once GKBR_DIR . 'includes/frontend.php';
require_once GKBR_DIR . 'includes/reader-ui.php';
require_once GKBR_DIR . 'includes/media.php';
require_once GKBR_DIR . 'includes/legacy.php';

register_activation_hook( __FILE__, 'gkbr_activate' );
register_deactivation_hook( __FILE__, 'gkbr_deactivate' );
add_action( 'init', 'gkbr_init' );
add_action( 'admin_init', 'gkbr_activation_redirect' );
add_action( 'admin_menu', 'gkbr_admin_menu' );
add_action( 'admin_post_gkbr_settings', 'gkbr_save_settings' );
add_action( 'gkbr_prefetch', 'gkbr_prefetch' );
add_action( 'wp_ajax_gkbr_read', 'gkbr_ajax_read' );
add_action( 'wp_ajax_nopriv_gkbr_read', 'gkbr_ajax_read' );
add_action( 'wp_ajax_gkbr_media', 'gkbr_ajax_media' );
add_action( 'wp_ajax_nopriv_gkbr_media', 'gkbr_ajax_media' );
add_action( 'wp_enqueue_scripts', 'gkbr_register_assets' );
add_action( 'enqueue_block_editor_assets', 'gkbr_editor_assets' );

/** Install only the response cache; preserve legacy Bible tables. */
function gkbr_activate( $network_wide = false ): void {
	gkbr_cache_install();
	gkbr_legacy_install();
	if ( ! $network_wide && ! wp_doing_ajax() && ! defined( 'WP_CLI' ) ) {
		set_transient( 'gkbr_activation_' . get_current_user_id(), 1, 120 );
	}
}

/** Stop background work without deleting cached chapters. */
function gkbr_deactivate(): void {
	wp_clear_scheduled_hook( 'gkbr_prefetch' );
	delete_option( 'gkbr_prefetch_lock' );
}

function gkbr_init(): void {
	gkbr_load_bundled_textdomain( determine_locale() );
	add_shortcode( 'bible_desktop', 'gkbr_reader_shortcode' );
	add_shortcode( 'georg_kloster_bible', 'gkbr_reader_shortcode' );
	add_shortcode( 'georg_kloster_passage', 'gkbr_passage_shortcode' );
	add_shortcode( 'georg_kloster_bible_link', 'gkbr_link_shortcode' );
	register_block_type( GKBR_DIR . 'blocks/passage', array( 'render_callback' => 'gkbr_passage_shortcode' ) );
	register_block_type( GKBR_DIR . 'blocks/reader', array( 'render_callback' => 'gkbr_reader_shortcode' ) );
	gkbr_legacy_hooks();
}

/** Load a bundled catalog only when WordPress.org has no catalog for this locale. */
function gkbr_load_bundled_textdomain( string $locale ): bool {
	if ( ! preg_match( '/^[a-z]{2,3}_[A-Z]{2}$/D', $locale ) ) {
		return false; }
	$domain       = 'georg-kloster-bible-reader';
	$catalog      = $domain . '-' . $locale . '.mo';
	$wporg_path   = WP_LANG_DIR . '/plugins/' . $catalog;
	$bundled_path = GKBR_DIR . 'languages/' . $catalog;
	if ( is_readable( $wporg_path ) || ! is_readable( $bundled_path ) ) {
		return false; }
	return load_textdomain( $domain, $bundled_path, $locale );
}

function gkbr_settings(): array {
	$settings = get_option( 'gkbr_settings', array() );
	return array_merge(
		array(
			'consent'      => false,
			'translations' => array(),
			'default'      => '',
			'locale'       => '',
			'credit'       => false,
		),
		is_array( $settings ) ? $settings : array()
	);
}
