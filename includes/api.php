<?php
/** Allowlisted public read operations. No private profile or note endpoints. @package GeorgKlosterBibleReader */
if ( ! defined( 'ABSPATH' ) ) {
	exit; }

function gkbr_catalog( bool $refresh = false ) {
	$result = gkbr_api_get( 'translations', array( 'catalog' => 'available' ), $refresh );
	if ( is_wp_error( $result ) ) {
		return $result; }
	$versions = get_option( 'gkbr_resource_versions', array() );
	foreach ( $result['data'] as $row ) {
		if ( isset( $row['code'] ) ) {
			$versions[ 'translation:' . $row['code'] ] = $row['content_revision'] ?? $row['module']['version'] ?? ''; }
	}
	update_option( 'gkbr_resource_versions', $versions, false );
	return $result['data'];
}

function gkbr_input( array $input, string $key, string $fallback = '' ): string {
	if ( ! isset( $input[ $key ] ) ) {
		return $fallback; }
	if ( ! is_scalar( $input[ $key ] ) ) {
		return ''; }
	return sanitize_text_field( (string) $input[ $key ] );
}

function gkbr_code( string $code ): bool {
	return (bool) preg_match( '/^[A-Za-z0-9_-]{1,100}$/D', $code );
}

function gkbr_number( string $value, int $max = 1000000000 ): int {
	return ctype_digit( $value ) && (int) $value > 0 && (int) $value <= $max ? (int) $value : 0;
}

/** This endpoint intentionally permits anonymous read-only access to published content. */
function gkbr_ajax_read(): void {
    // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Public read-only endpoint; all accepted values are scalar and validated by gkbr_dispatch.
	$input  = wp_unslash( $_GET );
	$result = gkbr_dispatch( is_array( $input ) ? $input : array() );
	if ( is_wp_error( $result ) ) {
		wp_send_json_error( array( 'message' => $result->get_error_message() ), 400 ); }
	wp_send_json_success( $result );
}

function gkbr_dispatch( array $input ) {
	$settings = gkbr_settings();
	if ( ! $settings['consent'] ) {
		return new WP_Error( 'gkbr_consent', __( 'The Bible reader is not connected yet.', 'georg-kloster-bible-reader' ) ); }
	$kind        = gkbr_input( $input, 'kind' );
	$translation = gkbr_input( $input, 'translation', $settings['default'] );
	$book        = gkbr_input( $input, 'book' );
	$chapter     = gkbr_number( gkbr_input( $input, 'chapter' ), 200 );
	$verse       = gkbr_number( gkbr_input( $input, 'verse' ) );
	$module      = gkbr_input( $input, 'module' );
	$query       = gkbr_input( $input, 'q' );
	if ( strlen( $query ) > 500 ) {
		return new WP_Error( 'gkbr_query', __( 'The search text is too long.', 'georg-kloster-bible-reader' ) ); }
	if ( in_array( $kind, array( 'books', 'chapter', 'locations', 'search', 'references', 'strong', 'tokens' ), true )
		&& ( ! gkbr_code( $translation ) || ! in_array( $translation, $settings['translations'], true ) ) ) {
		return new WP_Error( 'gkbr_translation', __( 'Choose a translation enabled by the administrator.', 'georg-kloster-bible-reader' ) );
	}
	$path   = '';
	$params = array();
	switch ( $kind ) {
		case 'catalog':
			$catalog = gkbr_catalog();
			return is_wp_error( $catalog ) ? $catalog : array( 'data' => array_values( array_filter( $catalog, static fn( $row ) => in_array( $row['code'], $settings['translations'], true ) ) ) );
		case 'books':
			$path = 'translations/' . rawurlencode( $translation ) . '/books';
			break;
		case 'chapter':
			if ( ! gkbr_code( $book ) || ! $chapter ) {
				break; }
			$path = 'translations/' . rawurlencode( $translation ) . '/books/' . rawurlencode( $book ) . '/chapters/' . $chapter;
			break;
		case 'locations':
			$ids = array_values( array_unique( array_filter( array_map( 'intval', explode( ',', gkbr_input( $input, 'verses' ) ) ), static fn( $id ) => $id > 0 ) ) );
			if ( ! $ids || count( $ids ) > 200 ) {
				break; }
			$path   = 'translations/' . rawurlencode( $translation ) . '/verse-locations';
			$params = array( 'verses' => $ids );
			break;
		case 'search':
			if ( strlen( $query ) < 2 ) {
				return array(
					'data' => array(
						'results'  => array(),
						'has_more' => false,
					),
				); }
			$path   = 'search/verses';
			$params = array(
				'translation' => $translation,
				'q'           => $query,
				'limit'       => 20,
				'offset'      => min( 10000, max( 0, (int) gkbr_input( $input, 'offset' ) ) ),
			);
			break;
		case 'commentary-modules':
			$path = 'commentary-modules';
			break;
		case 'commentaries':
			if ( ! $verse || ! gkbr_code( $module ) ) {
				break; }
			$path   = 'verses/' . $verse . '/commentaries';
			$params = array( 'modules' => $module );
			break;
		case 'references':
			if ( ! $verse ) {
				break; }
			$path   = 'verses/' . $verse . '/cross-references';
			$params = array( 'translation' => $translation );
			break;
		case 'tokens':
			if ( ! $verse ) {
				break; }
			$path   = 'verses/' . $verse . '/strong-tokens';
			$params = array( 'translation' => $translation );
			break;
		case 'strong':
			$number = strtoupper( gkbr_input( $input, 'number' ) );
			if ( ! preg_match( '/^[GH]?[0-9]{1,5}$/D', $number ) || ! $verse ) {
				break; }
			$path   = 'strong/' . $number;
			$params = array( 'verse' => $verse );
			break;
		case 'dictionaries':
			$path = 'dictionaries';
			break;
		case 'dictionary-entries':
			if ( ! gkbr_code( $module ) || strlen( $query ) > 120 ) {
				break; }
			$path   = 'dictionaries/' . rawurlencode( $module ) . '/entries';
			$params = array(
				'q'      => $query,
				'limit'  => 30,
				'offset' => min( 1000000, max( 0, (int) gkbr_input( $input, 'offset' ) ) ),
			);
			break;
		case 'dictionary-alphabet':
			if ( ! gkbr_code( $module ) ) {
				break; }
			$path = 'dictionaries/' . rawurlencode( $module ) . '/alphabet';
			break;
		case 'dictionary-search':
			$letter = gkbr_input( $input, 'letter' );
			if ( ! gkbr_code( $module ) || strlen( $query ) > 120 || ( '' !== $letter && ( ! ctype_digit( $letter ) || (int) $letter < 1 || (int) $letter > 36 ) ) ) {
				break; }
			$path   = 'dictionaries/' . rawurlencode( $module ) . '/search';
			$params = array(
				'q'      => $query,
				'mode'   => 'word',
				'limit'  => 30,
				'offset' => min( 1000000, max( 0, (int) gkbr_input( $input, 'offset' ) ) ),
			);
			if ( '' !== $letter ) {
				$params['letter'] = (int) $letter; }
			break;
		case 'dictionary-entry':
			$entry = gkbr_input( $input, 'entry' );
			if ( ! gkbr_code( $module ) || ! preg_match( '/^(?:[a-f0-9]{40}|[0-9]{1,10})$/D', $entry ) ) {
				break; }
			$path = 'dictionaries/' . rawurlencode( $module ) . '/entries/' . $entry;
			break;
		case 'verse-dictionaries':
			if ( ! $verse ) {
				break; }
			$modules = gkbr_input( $input, 'modules' );
			$codes   = '' === $modules ? array() : explode( ',', $modules );
			if ( count( $codes ) > 30 || array_filter( $codes, static fn( $code ) => ! gkbr_code( $code ) ) ) {
				break; }
			$path   = 'verses/' . $verse . '/dictionary-entries';
			$params = array( 'limit' => 30 );
			if ( $codes ) {
				$params['modules'] = implode( ',', $codes ); }
			break;
	}
	if ( '' === $path ) {
		return new WP_Error( 'gkbr_input', __( 'Invalid reader request.', 'georg-kloster-bible-reader' ) ); }
	// Do not persist arbitrary visitor searches in the database.
	$result = gkbr_api_get( $path, $params );
	if ( ! is_wp_error( $result ) && 'dictionaries' === $kind ) {
		$versions = get_option( 'gkbr_resource_versions', array() );
		foreach ( $result['data'] as $row ) {
			$versions[ 'dictionary:' . $row['code'] ] = $row['content_version'] ?? ''; }
		update_option( 'gkbr_resource_versions', $versions, false );
	}
	return $result;
}
