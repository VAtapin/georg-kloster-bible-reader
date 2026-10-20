<?php
/** Connection and background download settings. @package GeorgKlosterBibleReader */
if ( ! defined( 'ABSPATH' ) ) {
	exit; }

function gkbr_activation_redirect(): void {
	$key = 'gkbr_activation_' . get_current_user_id();
	if ( ! get_transient( $key ) ) {
		return; }
	delete_transient( $key );
	// Never interrupt bulk activation, network activation, AJAX, or command-line tools.
    // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only detection of WordPress bulk activation; no submitted data is saved.
	if ( ! current_user_can( 'manage_options' ) || wp_doing_ajax() || is_network_admin() || defined( 'WP_CLI' ) || isset( $_GET['activate-multi'] ) ) {
		return; }
	wp_safe_redirect( admin_url( 'admin.php?page=gkbr-settings' ) );
	exit;
}

function gkbr_admin_menu(): void {
	add_menu_page( 'Georg Kloster Bible Reader', 'Georg Kloster Bible Reader', 'manage_options', 'gkbr-settings', 'gkbr_settings_page', 'dashicons-book-alt', 26 );
}

function gkbr_legal_url( string $slug ): string {
	$language = strtolower( substr( determine_locale(), 0, 2 ) );
	if ( ! in_array( $language, array( 'ru', 'de', 'uk', 'pl', 'en' ), true ) ) {
		$language = 'en'; }
	return add_query_arg( 'lang', $language, 'https://bible-desktop.com/pages/' . $slug );
}

function gkbr_settings_page(): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		return; }
	$settings = gkbr_settings();
	$catalog  = $settings['consent'] ? gkbr_catalog() : array();
	$job      = get_option( 'gkbr_prefetch_job', array() );
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Georg Kloster Bible Reader', 'georg-kloster-bible-reader' ); ?></h1>
		<p><?php esc_html_e( 'Which Bible translations would you like to connect?', 'georg-kloster-bible-reader' ); ?></p>
		<p><?php esc_html_e( 'Bible Desktop supplies public Bible texts, commentary, dictionaries, and maps. Requests are sent by this WordPress server and include its IP address, requested references, and search words. Visitor IP addresses, accounts, bookmarks, and reading history are not sent to Bible Desktop.', 'georg-kloster-bible-reader' ); ?></p>
		<p><a href="<?php echo esc_url( gkbr_legal_url( 'api-terms' ) ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'API terms', 'georg-kloster-bible-reader' ); ?></a> · <a href="<?php echo esc_url( gkbr_legal_url( 'api-privacy' ) ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'API privacy policy', 'georg-kloster-bible-reader' ); ?></a></p>
		<?php if ( is_wp_error( $catalog ) ) : ?>
			<div class="notice notice-error"><p><?php echo esc_html( $catalog->get_error_message() ); ?></p></div>
		<?php endif; ?>
		<?php
		$notice = get_transient( 'gkbr_notice_' . get_current_user_id() );
		if ( $notice ) :
			delete_transient( 'gkbr_notice_' . get_current_user_id() );
			?>
			<div class="notice notice-info"><p><?php echo esc_html( $notice ); ?></p></div>
				<?php endif; ?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="gkbr_settings">
			<?php wp_nonce_field( 'gkbr_settings' ); ?>
			<p><label><input type="checkbox" name="consent" value="1" <?php checked( $settings['consent'] ); ?>> <?php esc_html_e( 'I agree to connect this site to Bible Desktop under the API terms and privacy policy.', 'georg-kloster-bible-reader' ); ?></label></p>
			<?php if ( $settings['consent'] && ! is_wp_error( $catalog ) ) : ?>
				<?php gkbr_catalog_controls( $catalog, $settings['translations'] ); ?>
				<p><label for="gkbr-default"><?php esc_html_e( 'Default translation', 'georg-kloster-bible-reader' ); ?></label>
					<select id="gkbr-default" name="default"><option value=""><?php esc_html_e( 'First selected translation', 'georg-kloster-bible-reader' ); ?></option>
					<?php
					foreach ( $catalog as $row ) :
						?>
						<option value="<?php echo esc_attr( $row['code'] ); ?>" <?php selected( $settings['default'], $row['code'] ); ?>><?php echo esc_html( $row['name'] ); ?></option><?php endforeach; ?>
					</select>
				</p>
			<?php endif; ?>
			<p><label for="gkbr-locale"><?php esc_html_e( 'Reader interface language', 'georg-kloster-bible-reader' ); ?></label>
				<select id="gkbr-locale" name="locale">
					<?php
					foreach ( array(
						''      => __( 'WordPress language', 'georg-kloster-bible-reader' ),
						'en_US' => 'English',
						'ru_RU' => 'Русский',
						'de_DE' => 'Deutsch',
					) as $code => $name ) :
						?>
											<option value="<?php echo esc_attr( $code ); ?>" <?php selected( $settings['locale'], $code ); ?>><?php echo esc_html( $name ); ?></option><?php endforeach; ?>
				</select>
			</p>
			<p><?php esc_html_e( 'Chapters are cached for one year; study texts for 90 days. Catalogs are checked daily. Cached content is retained during outages. Changed content revisions refresh chapters on demand. Manual refresh replaces each response only after a successful download. WordPress scheduled tasks need site visits or a configured cron runner.', 'georg-kloster-bible-reader' ); ?></p>
			<p><label><input type="checkbox" name="credit" value="1" <?php checked( $settings['credit'] ); ?>> <?php esc_html_e( 'Show an optional Bible Desktop credit link below the reader.', 'georg-kloster-bible-reader' ); ?></label></p>
			<button class="button button-primary" name="operation" value="save"><?php esc_html_e( 'Save and connect', 'georg-kloster-bible-reader' ); ?></button>
			<?php if ( $settings['consent'] ) : ?>
				<button class="button" name="operation" value="catalog"><?php esc_html_e( 'Refresh catalog', 'georg-kloster-bible-reader' ); ?></button>
				<button class="button" name="operation" value="invalidate"><?php esc_html_e( 'Refresh cached content on next use', 'georg-kloster-bible-reader' ); ?></button>
				<button class="button" name="operation" value="download"><?php esc_html_e( 'Download selected Bibles', 'georg-kloster-bible-reader' ); ?></button>
				<button class="button" name="operation" value="refresh"><?php esc_html_e( 'Refresh cached Bibles', 'georg-kloster-bible-reader' ); ?></button>
				<button class="button" name="operation" value="resume"><?php esc_html_e( 'Resume download', 'georg-kloster-bible-reader' ); ?></button>
				<button class="button" name="operation" value="stop"><?php esc_html_e( 'Stop download', 'georg-kloster-bible-reader' ); ?></button>
			<?php endif; ?>
		</form>
		<?php if ( $job ) : ?>
			<?php /* translators: 1: downloaded chapter count, 2: total chapters discovered so far, 3: translated download status. */ ?>
			<p><?php echo esc_html( sprintf( __( 'Download: %1$d of %2$d chapters. Status: %3$s.', 'georg-kloster-bible-reader' ), $job['done'] ?? 0, $job['total'] ?? 0, gkbr_job_label( $job['status'] ?? 'paused' ) ) ); ?></p>
			<?php
			if ( ! empty( $job['error'] ) ) :
				?>
				<p><?php echo esc_html( $job['error'] ); ?></p><?php endif; ?>
		<?php endif; ?>
		<h2><?php esc_html_e( 'Add the reader to your site', 'georg-kloster-bible-reader' ); ?></h2>
		<p><code>[bible_desktop]</code></p>
		<p><code>[bible_desktop bottom="no"]</code></p>
		<p><code>[georg_kloster_passage translation="L1_RST" book="john" chapter="3" from="16" to="21"]</code></p>
		<p><code>[georg_kloster_bible_link book="john" chapter="3" verse="16"]John 3:16[/georg_kloster_bible_link]</code></p>
		<p><?php esc_html_e( 'Use the Bible Reader or Bible Passage blocks in the block editor. Passage books use the API book slug of the selected translation. Links open the reader on the current page.', 'georg-kloster-bible-reader' ); ?></p>
		<h2><?php esc_html_e( 'Existing local modules', 'georg-kloster-bible-reader' ); ?></h2>
		<p><?php esc_html_e( 'Imported modules are preserved. Use [bible_desktop source="local"] for the original local reader. Its import tools remain available under Bible Desktop.', 'georg-kloster-bible-reader' ); ?></p>
	</div>
	<?php
	wp_enqueue_script( 'gkbr-admin', GKBR_URL . 'assets/admin.js', array(), GKBR_VERSION, true );
}

function gkbr_job_label( string $status ): string {
	switch ( $status ) {
		case 'running':
			return __( 'Running', 'georg-kloster-bible-reader' );
		case 'complete':
			return __( 'Complete', 'georg-kloster-bible-reader' );
		case 'stopped':
			return __( 'Stopped', 'georg-kloster-bible-reader' );
		default:
			return __( 'Paused', 'georg-kloster-bible-reader' );
	}
}

function gkbr_save_settings(): void {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You cannot change these settings.', 'georg-kloster-bible-reader' ), '', array( 'response' => 403 ) ); }
	check_admin_referer( 'gkbr_settings' );
	$input               = wp_unslash( $_POST );
	$settings            = gkbr_settings();
	$consent             = gkbr_input( $input, 'consent' ) === '1';
	$settings['consent'] = $consent;
	$settings['credit']  = gkbr_input( $input, 'credit' ) === '1';
	$locale              = gkbr_input( $input, 'locale' );
	$settings['locale']  = in_array( $locale, array( '', 'en_US', 'ru_RU', 'de_DE' ), true ) ? $locale : '';
	// Store explicit consent before making any API call.
	update_option( 'gkbr_settings', $settings, false );
	$operation = gkbr_input( $input, 'operation' );
	if ( $consent && 'invalidate' === $operation ) {
		update_option( 'gkbr_cache_generation', wp_generate_uuid4(), false ); }
	$message = __( 'Settings saved.', 'georg-kloster-bible-reader' );
	if ( ! $consent ) {
		wp_clear_scheduled_hook( 'gkbr_prefetch' ); } else {
		$catalog = gkbr_catalog( 'catalog' === $operation );
		if ( is_wp_error( $catalog ) ) {
			$message = $catalog->get_error_message(); } else {
			$selected                 = isset( $input['translations'] ) && is_array( $input['translations'] ) ? array_filter( $input['translations'], 'is_string' ) : array();
			$settings['translations'] = array_values( array_intersect( array_column( $catalog, 'code' ), $selected ) );
			$default                  = gkbr_input( $input, 'default' );
			$settings['default']      = in_array( $default, $settings['translations'], true ) ? $default : ( $settings['translations'][0] ?? '' );
			update_option( 'gkbr_settings', $settings, false );
			if ( in_array( $operation, array( 'download', 'refresh' ), true ) ) {
				$message = gkbr_start_download( 'refresh' === $operation ); }
			if ( 'resume' === $operation ) {
				$job = get_option( 'gkbr_prefetch_job', array() );
				if ( ! empty( $job['queue'] ) || ! empty( $job['planning'] ) ) {
					$job['status'] = 'running';
					$job['error']  = '';
					update_option( 'gkbr_prefetch_job', $job, false );
					if ( ! wp_next_scheduled( 'gkbr_prefetch' ) ) {
						wp_schedule_single_event( time() + 1, 'gkbr_prefetch' ); }
				}
			}
			}
		}
		if ( 'stop' === $operation || ! $consent ) {
			wp_clear_scheduled_hook( 'gkbr_prefetch' );
			$job = get_option( 'gkbr_prefetch_job', array() );
			if ( $job ) {
				$job['status'] = 'stopped';
				update_option( 'gkbr_prefetch_job', $job, false ); }
		}
		set_transient( 'gkbr_notice_' . get_current_user_id(), $message, 120 );
		wp_safe_redirect( admin_url( 'admin.php?page=gkbr-settings' ) );
		exit;
}

function gkbr_start_download( bool $refresh ): string {
	$settings = gkbr_settings();
	if ( ! $settings['consent'] ) {
		return __( 'The Bible reader is not configured yet.', 'georg-kloster-bible-reader' ); }
	wp_clear_scheduled_hook( 'gkbr_prefetch' );
	update_option(
		'gkbr_prefetch_job',
		array(
			'id'       => wp_generate_uuid4(),
			'planning' => $settings['translations'],
			'queue'    => array(),
			'done'     => 0,
			'total'    => 0,
			'refresh'  => $refresh,
			'status'   => $settings['translations'] ? 'running' : 'complete',
			'error'    => '',
		),
		false
	);
	if ( $settings['translations'] ) {
		wp_schedule_single_event( time() + 1, 'gkbr_prefetch' ); }
	return __( 'Background download queued. Existing cached text remains available.', 'georg-kloster-bible-reader' );
}
