<?php
/** Same-site, persistent cache for published dictionary map images. @package GeorgKlosterBibleReader */
if ( ! defined( 'ABSPATH' ) ) {
	exit; }

/** Public read-only media endpoint. It accepts IDs, never a visitor-supplied URL or file path. */
function gkbr_ajax_media(): void {
	if ( ! gkbr_settings()['consent'] ) {
		status_header( 403 );
		exit; }
    // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Anonymous read-only media; IDs are validated, and no visitor URL is accepted.
	$input  = wp_unslash( $_GET );
	$module = gkbr_input( $input, 'module' );
	$media  = gkbr_number( gkbr_input( $input, 'media' ) );
	if ( ! gkbr_code( $module ) || ! $media ) {
		status_header( 400 );
		exit; }
	$result = gkbr_cached_media( $module, $media );
	if ( is_wp_error( $result ) ) {
		status_header( 404 );
		exit; }
	header( 'Content-Type: ' . $result['mime'] );
	header( 'X-Content-Type-Options: nosniff' );
	header( 'Cache-Control: public, max-age=2592000' );
    // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- Stream validated image bytes from the plugin-owned uploads record; no request-controlled path.
	readfile( $result['file'] );
	exit;
}

function gkbr_cached_media( string $module, int $media ) {
	$key = 'gkbr_media_' . hash( 'sha256', $module . ':' . $media );
	if ( ! gkbr_settings()['consent'] || get_transient( $key . '_removed' ) ) {
		return new WP_Error( 'gkbr_media' ); }
	$cached   = get_option( $key );
	$has_file = is_array( $cached ) && is_string( $cached['file'] ?? null ) && is_file( $cached['file'] );
	$revision = gkbr_resource_revision( 'dictionaries/' . $module . '/media/' . $media );
	if ( $has_file && ( $cached['revision'] ?? '' ) === $revision && time() - ( $cached['time'] ?? 0 ) < YEAR_IN_SECONDS ) {
		return $cached; }
	if ( get_transient( 'gkbr_api_cooldown' ) || ! gkbr_outbound_budget_available() ) {
		return $has_file ? $cached : new WP_Error( 'gkbr_media' ); }
	$response = wp_safe_remote_get(
		GKBR_API . 'dictionaries/' . rawurlencode( $module ) . '/media/' . $media,
		array(
			'timeout'             => 15,
			'redirection'         => 0,
			'sslverify'           => true,
			'limit_response_size' => 8 * MB_IN_BYTES,
			'user-agent'          => 'Georg-Kloster-Bible-Reader/' . GKBR_VERSION,
		)
	);
	$code     = is_wp_error( $response ) ? 0 : wp_remote_retrieve_response_code( $response );
	if ( in_array( $code, array( 403, 404, 409 ), true ) ) {
		set_transient( $key . '_removed', 1, DAY_IN_SECONDS );
		delete_option( $key );
		return new WP_Error( 'gkbr_media' ); }
	if ( 200 !== $code ) {
		set_transient( 'gkbr_api_cooldown', 1, 60 );
		return $has_file ? $cached : new WP_Error( 'gkbr_media' );
	}
	$body = wp_remote_retrieve_body( $response );
	// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- Malformed remote images must fail without emitting parser warnings into the response.
	$info  = @getimagesizefromstring( $body );
	$types = array(
		'image/jpeg' => 'jpg',
		'image/png'  => 'png',
		'image/webp' => 'webp',
		'image/gif'  => 'gif',
	);
	$mime  = $info['mime'] ?? '';
	if ( ! isset( $types[ $mime ] ) || $info[0] > 16000 || $info[1] > 16000 ) {
		return new WP_Error( 'gkbr_media' ); }
	if ( $has_file && hash_equals( hash_file( 'sha256', $cached['file'] ), hash( 'sha256', $body ) ) ) {
		$cached['revision'] = $revision;
		$cached['time']     = time();
		update_option( $key, $cached, false );
		return $cached;
	}
	$file = wp_upload_bits( 'gkbr-' . hash( 'sha256', $body ) . '.' . $types[ $mime ], null, $body );
	if ( $file['error'] ) {
		return new WP_Error( 'gkbr_media' ); }
	$record = array(
		'file'     => $file['file'],
		'mime'     => $mime,
		'revision' => $revision,
		'time'     => time(),
	);
	update_option( $key, $record, false );
	return $record;
}
