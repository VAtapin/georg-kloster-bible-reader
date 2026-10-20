<?php
/** Persistent cache: never clear working bodies before a replacement succeeds. @package GeorgKlosterBibleReader */
if ( ! defined( 'ABSPATH' ) ) {
	exit; }

function gkbr_cache_install(): void {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$charset = $wpdb->get_charset_collate();
	dbDelta(
		"CREATE TABLE {$wpdb->prefix}gkbr_cache (
        cache_key varchar(64) NOT NULL,
        body longtext NOT NULL,
        fetched_at bigint unsigned NOT NULL,
        revision varchar(100) NOT NULL DEFAULT '',
        PRIMARY KEY  (cache_key)
    ) $charset;"
	);
	update_option( 'gkbr_cache_schema', 1, false );
}

function gkbr_api_query( string $path, array $query ): array {
	if ( preg_match( '#^translations/[^/]+/books/[^/]+/chapters/[0-9]+$#', $path ) ) {
		$query['annotations'] = 1; }
	return $query;
}

function gkbr_cache_key( string $path, array $query = array() ): string {
	$query = gkbr_api_query( $path, $query );
	ksort( $query );
	return hash( 'sha256', GKBR_API . $path . '?' . http_build_query( $query ) );
}

function gkbr_cache_get( string $key ): ?array {
	global $wpdb;
	$memory = wp_cache_get( $key, 'gkbr' );
	if ( is_array( $memory ) ) {
		return $memory; }
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Plugin-owned persistent cache has no WordPress content API.
	$row = $wpdb->get_row( $wpdb->prepare( "SELECT body, fetched_at, revision FROM {$wpdb->prefix}gkbr_cache WHERE cache_key = %s", $key ), ARRAY_A );
	if ( ! $row ) {
		return null; }
	$body   = json_decode( $row['body'], true );
	$result = is_array( $body ) ? array(
		'payload'  => $body,
		'time'     => (int) $row['fetched_at'],
		'revision' => $row['revision'],
	) : null;
	if ( $result ) {
		wp_cache_set( $key, $result, 'gkbr', 300 ); }
	return $result;
}

function gkbr_cache_put( string $key, array $payload, string $revision ): void {
	global $wpdb;
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Upsert into plugin-owned response cache; object-cache entry invalidated below.
	$wpdb->replace(
		$wpdb->prefix . 'gkbr_cache',
		array(
			'cache_key'  => $key,
			'body'       => wp_json_encode( $payload ),
			'fetched_at' => time(),
			'revision'   => $revision,
		),
		array( '%s', '%s', '%d', '%s' )
	);
	wp_cache_delete( $key, 'gkbr' );
}

function gkbr_cache_forget( string $key ): void {
	global $wpdb;
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Invalidate one source-revoked cache response, never imported originals.
	$wpdb->delete( $wpdb->prefix . 'gkbr_cache', array( 'cache_key' => $key ), array( '%s' ) );
	wp_cache_delete( $key, 'gkbr' );
}

/** Bound uncached outbound requests from both public JSON and media endpoints. */
function gkbr_outbound_budget_available(): bool {
	$bucket   = 'gkbr_requests_' . (int) floor( time() / 60 );
	$requests = (int) get_transient( $bucket );
	if ( $requests >= 60 ) {
		return false; }
	set_transient( $bucket, $requests + 1, 120 );
	return true;
}

/** Catalogs are checked daily. Immutable chapter bodies retain their last good copy indefinitely. */
function gkbr_api_get( string $path, array $query = array(), bool $refresh = false, bool $allow_stale = true ) {
	$query = gkbr_api_query( $path, $query );
	if ( ! gkbr_settings()['consent'] ) {
		return new WP_Error( 'gkbr_consent', __( 'Connect Bible Desktop in the reader settings first.', 'georg-kloster-bible-reader' ) );
	}
	if ( (int) get_option( 'gkbr_cache_schema' ) !== 1 ) {
		gkbr_cache_install(); }
	$key = gkbr_cache_key( $path, $query );
	if ( get_transient( 'gkbr_removed_' . $key ) ) {
		return new WP_Error( 'gkbr_removed', __( 'This material is no longer available from the source.', 'georg-kloster-bible-reader' ) ); }
	$cached     = gkbr_cache_get( $key );
	$revision   = gkbr_resource_revision( $path );
	$chapter    = (bool) preg_match( '#^translations/[^/]+/(?:books|verse-locations)#', $path );
	$catalog    = in_array( $path, array( 'translations', 'dictionaries', 'commentary-modules' ), true );
	$ephemeral  = 'search/verses' === $path || ( str_ends_with( $path, '/entries' ) && ! empty( $query['q'] ) );
	$lifetime   = $chapter ? YEAR_IN_SECONDS : ( $catalog ? DAY_IN_SECONDS : 90 * DAY_IN_SECONDS );
	$empty_list = (bool) preg_match( '#^(?:translations/[^/]+/verse-locations|dictionaries/[^/]+/entries)$#', $path );
	if ( $cached && $empty_list && array() === ( $cached['payload']['data'] ?? null ) ) {
		$lifetime = DAY_IN_SECONDS;
	}
	if ( ! $refresh && $cached && time() - $cached['time'] < $lifetime && $cached['revision'] === $revision ) {
		return $cached['payload'];
	}
	$cooldown = get_transient( 'gkbr_api_cooldown' );
	if ( $cooldown ) {
		return $cached && $allow_stale ? $cached['payload'] : new WP_Error( 'gkbr_busy', __( 'Bible Desktop is temporarily unavailable. Please try again later.', 'georg-kloster-bible-reader' ) );
	}
	// A shared outbound budget also protects public endpoints against cache misses.
	if ( ! gkbr_outbound_budget_available() ) {
		return $cached && $allow_stale ? $cached['payload'] : new WP_Error( 'gkbr_busy', __( 'Please try again in a minute.', 'georg-kloster-bible-reader' ) );
	}
	$response = wp_safe_remote_get(
		add_query_arg( $query, GKBR_API . $path ),
		array(
			'timeout'             => 15,
			'redirection'         => 0,
			'sslverify'           => true,
			'limit_response_size' => 8 * MB_IN_BYTES,
			'headers'             => array( 'Accept' => 'application/json' ),
			'user-agent'          => 'Georg-Kloster-Bible-Reader/' . GKBR_VERSION,
		)
	);
	$status   = is_wp_error( $response ) ? 0 : wp_remote_retrieve_response_code( $response );
	$payload  = 200 === $status ? json_decode( wp_remote_retrieve_body( $response ), true ) : null;
	if ( 404 === $status || 409 === $status || 403 === $status ) {
		// An explicitly removed or corrupt public resource must not be revived from cache.
		set_transient( 'gkbr_removed_' . $key, 1, DAY_IN_SECONDS );
		gkbr_cache_forget( $key );
		return new WP_Error( 'gkbr_removed', __( 'This material is no longer available from the source.', 'georg-kloster-bible-reader' ) );
	}
	if ( 200 !== $status || ! gkbr_valid_payload( $path, $payload ) ) {
		$retry = 429 === $status ? (int) wp_remote_retrieve_header( $response, 'retry-after' ) : 60;
		set_transient( 'gkbr_api_cooldown', 1, min( 3600, max( 60, $retry ) ) );
		return $cached && $allow_stale ? $cached['payload'] : new WP_Error( 'gkbr_api', __( 'Could not load this material. Please try again later.', 'georg-kloster-bible-reader' ) );
	}
	// A valid empty lookup is worth caching briefly; never persist an empty chapter or catalog.
	if ( ! $ephemeral && ( array() !== $payload['data'] || $empty_list ) && ( ! isset( $payload['data']['verses'] ) || array() !== $payload['data']['verses'] ) ) {
		gkbr_cache_put( $key, $payload, $revision );
	}
	return $payload;
}

/** A malformed 200 response must not replace a readable cached chapter. */
function gkbr_valid_payload( string $path, $payload ): bool {
	if ( ! is_array( $payload ) || ! isset( $payload['data'] ) || ! is_array( $payload['data'] ) ) {
		return false; }
	$data = $payload['data'];
	if ( preg_match( '#^translations/([^/]+)/books/([^/]+)/chapters/([0-9]+)$#', $path, $parts ) ) {
		if ( ( $data['translation']['code'] ?? '' ) !== rawurldecode( $parts[1] ) || ( $data['book']['slug'] ?? '' ) !== rawurldecode( $parts[2] ) || (int) ( $data['chapter']['number'] ?? 0 ) !== (int) $parts[3] || ! isset( $data['verses'] ) || ! is_array( $data['verses'] ) || ! array_is_list( $data['verses'] ) ) {
			return false; }
		foreach ( $data['verses'] as $verse ) {
			if ( ! is_array( $verse ) || (int) ( $verse['id'] ?? 0 ) < 1 || (int) ( $verse['number'] ?? 0 ) < 1 || ! is_string( $verse['plain_text'] ?? null ) ) {
				return false; }
		}
	}
	if ( preg_match( '#^translations/[^/]+/books$#', $path ) && ( ! isset( $data['books'] ) || ! is_array( $data['books'] ) || ! array_is_list( $data['books'] ) ) ) {
		return false; }
	if ( in_array( $path, array( 'translations', 'commentary-modules', 'dictionaries' ), true ) ) {
		if ( ! array_is_list( $data ) ) {
			return false; }
		foreach ( $data as $row ) {
			if ( ! is_array( $row ) || ! is_string( $row['code'] ?? null ) || ! is_string( $row['name'] ?? null ) ) {
				return false; }
		}
	}
	return true;
}

function gkbr_resource_revision( string $path ): string {
	$versions   = get_option( 'gkbr_resource_versions', array() );
	$generation = (string) get_option( 'gkbr_cache_generation', 'initial' );
	if ( preg_match( '#^translations/([^/]+)/#', $path, $match ) ) {
		return hash( 'sha256', $generation . ':' . ( $versions[ 'translation:' . rawurldecode( $match[1] ) ] ?? '' ) );
	}
	if ( preg_match( '#^dictionaries/([^/]+)/#', $path, $match ) ) {
		return hash( 'sha256', $generation . ':' . ( $versions[ 'dictionary:' . rawurldecode( $match[1] ) ] ?? '' ) );
	}
	return hash( 'sha256', $generation );
}

/** Serialize WP-Cron batches. Fetch at most two chapters per tick. */
function gkbr_prefetch(): void {
	$settings = gkbr_settings();
	if ( ! $settings['consent'] ) {
		return; }
	$lock = get_option( 'gkbr_prefetch_lock' );
	if ( $lock && (int) $lock > time() - 120 ) {
		return; }
	if ( $lock ) {
		delete_option( 'gkbr_prefetch_lock' ); }
	if ( ! add_option( 'gkbr_prefetch_lock', time(), '', false ) ) {
		return; }
	try {
		$job = get_option( 'gkbr_prefetch_job', array() );
		if ( ( $job['status'] ?? '' ) !== 'running' ) {
			return; }
		if ( ! empty( $job['planning'] ) ) {
			$code = $job['planning'][0];
			if ( ! in_array( $code, $settings['translations'], true ) ) {
				array_shift( $job['planning'] );
			} else {
				$result = gkbr_api_get( 'translations/' . rawurlencode( $code ) . '/books', array(), ! empty( $job['refresh'] ), false );
				if ( is_wp_error( $result ) ) {
					$job['error']  = $result->get_error_message();
					$job['status'] = 'paused';
				} else {
					foreach ( $result['data']['books'] as $book ) {
						for ( $chapter = 1; $chapter <= min( 200, (int) $book['chapters_count'] ); $chapter++ ) {
							$job['queue'][] = array(
								'translation' => $code,
								'book'        => $book['slug'],
								'chapter'     => $chapter,
							);
							++$job['total'];
						}
					}
					array_shift( $job['planning'] );
				}
			}
		}
		for ( $i = 0; $i < 2 && ! empty( $job['queue'] ); $i++ ) {
			if ( 'running' !== $job['status'] ) {
				break; }
			$item = $job['queue'][0];
			if ( ! in_array( $item['translation'], $settings['translations'], true ) ) {
				array_shift( $job['queue'] );
				$job['total'] = max( $job['done'], $job['total'] - 1 );
				continue; }
			$path   = 'translations/' . rawurlencode( $item['translation'] ) . '/books/' . rawurlencode( $item['book'] ) . '/chapters/' . $item['chapter'];
			$result = gkbr_api_get( $path, array(), ! empty( $job['refresh'] ), false );
			if ( is_wp_error( $result ) || empty( $result['data']['verses'] ) ) {
				$job['error']  = is_wp_error( $result ) ? $result->get_error_message() : __( 'No chapter text was returned.', 'georg-kloster-bible-reader' );
				$job['status'] = 'paused';
				break;
			}
			array_shift( $job['queue'] );
			++$job['done'];
		}
		if ( empty( $job['queue'] ) && empty( $job['planning'] ) ) {
			$job['status'] = 'complete'; }
		$current_job      = get_option( 'gkbr_prefetch_job', array() );
		$current_settings = gkbr_settings();
		if ( ( $current_job['id'] ?? '' ) !== ( $job['id'] ?? '' ) || 'running' !== ( $current_job['status'] ?? '' ) || ! $current_settings['consent'] ) {
			return; }
		update_option( 'gkbr_prefetch_job', $job, false );
		if ( 'running' === $job['status'] && ! wp_next_scheduled( 'gkbr_prefetch' ) ) {
			wp_schedule_single_event( time() + 20, 'gkbr_prefetch' ); }
	} finally {
		delete_option( 'gkbr_prefetch_lock' ); }
}
