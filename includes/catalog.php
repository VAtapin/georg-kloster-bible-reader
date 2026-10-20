<?php
/** Shared application language families and edition coverage. @package GeorgKlosterBibleReader */
if ( ! defined( 'ABSPATH' ) ) {
	exit; }

function gkbr_language_groups(): array {
	static $families;
	if ( null === $families ) {
		$families = json_decode( file_get_contents( GKBR_DIR . 'assets/language-groups.json' ), true );
	}
	return is_array( $families ) ? $families : array();
}

function gkbr_group_labels(): array {
	return array(
		'slavic'        => __( 'Slavic', 'georg-kloster-bible-reader' ),
		'germanic'      => __( 'Germanic', 'georg-kloster-bible-reader' ),
		'romance'       => __( 'Romance and Latin', 'georg-kloster-bible-reader' ),
		'indo'          => __( 'Other Indo-European', 'georg-kloster-bible-reader' ),
		'atlantic'      => __( 'Atlantic-Congo', 'georg-kloster-bible-reader' ),
		'nilotic'       => __( 'Nilotic', 'georg-kloster-bible-reader' ),
		'sino'          => __( 'Sino-Tibetan', 'georg-kloster-bible-reader' ),
		'austronesian'  => __( 'Austronesian', 'georg-kloster-bible-reader' ),
		'afro'          => __( 'Afro-Asiatic', 'georg-kloster-bible-reader' ),
		'austroasiatic' => __( 'Austroasiatic', 'georg-kloster-bible-reader' ),
		'mande'         => __( 'Mande', 'georg-kloster-bible-reader' ),
		'kru'           => __( 'Kru', 'georg-kloster-bible-reader' ),
		'papuan'        => __( 'Trans-New Guinea', 'georg-kloster-bible-reader' ),
		'otomanguean'   => __( 'Oto-Manguean', 'georg-kloster-bible-reader' ),
		'mayan'         => __( 'Mayan', 'georg-kloster-bible-reader' ),
		'arawakan'      => __( 'Arawakan', 'georg-kloster-bible-reader' ),
		'dravidian'     => __( 'Dravidian', 'georg-kloster-bible-reader' ),
		'other'         => __( 'Other / unspecified group', 'georg-kloster-bible-reader' ),
	);
}

function gkbr_edition_kind( array $edition ): string {
	if ( ! empty( $edition['has_old_testament'] ) && ! empty( $edition['has_new_testament'] ) ) {
		return 'bible'; }
	if ( empty( $edition['has_old_testament'] ) && ! empty( $edition['has_new_testament'] ) ) {
		return 'nt'; }
	return 'other';
}

function gkbr_catalog_controls( array $catalog, array $selected ): void {
	$families  = gkbr_language_groups();
	$labels    = gkbr_group_labels();
	$groups    = array();
	$languages = array();
	foreach ( $catalog as $row ) {
		$code               = $row['language']['code'] ?? '';
		$group              = $families[ $code ] ?? 'other';
		$groups[ $group ]   = $labels[ $group ];
		$languages[ $code ] = array(
			'name'  => $row['language']['native_name'] ?? $row['language']['name'] ?? $code,
			'group' => $group,
		);
	}
	asort( $groups );
	uasort( $languages, static fn( $a, $b ) => strcmp( $a['name'], $b['name'] ) );
	$kinds = array(
		'bible' => __( 'Bible', 'georg-kloster-bible-reader' ),
		'nt'    => __( 'New Testament', 'georg-kloster-bible-reader' ),
		'other' => __( 'Other editions', 'georg-kloster-bible-reader' ),
	);
	?>
	<div class="gkbr-catalog-filters" style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0">
		<label><?php esc_html_e( 'Language group', 'georg-kloster-bible-reader' ); ?><br>
		<select id="gkbr-group"><option value=""><?php esc_html_e( 'All groups', 'georg-kloster-bible-reader' ); ?></option>
		<?php
		foreach ( $groups as $key => $label ) :
			?>
			<option value="<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></label>
		<label><?php esc_html_e( 'Language', 'georg-kloster-bible-reader' ); ?><br>
		<select id="gkbr-language"><option value=""><?php esc_html_e( 'All languages', 'georg-kloster-bible-reader' ); ?></option>
		<?php
		foreach ( $languages as $key => $row ) :
			?>
			<option value="<?php echo esc_attr( $key ); ?>" data-group="<?php echo esc_attr( $row['group'] ); ?>"><?php echo esc_html( $row['name'] ); ?></option><?php endforeach; ?></select></label>
		<label><?php esc_html_e( 'Filter translations', 'georg-kloster-bible-reader' ); ?><br><input id="gkbr-filter" type="search"></label>
	</div>
	<div style="max-height:420px;overflow:auto">
	<?php foreach ( $kinds as $kind => $label ) : ?>
		<section data-gkbr-kind="<?php echo esc_attr( $kind ); ?>"><h3><?php echo esc_html( $label ); ?></h3>
		<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:10px">
		<?php
		foreach ( $catalog as $row ) :
			if ( gkbr_edition_kind( $row ) !== $kind ) {
				continue; }
			$code = $row['language']['code'] ?? '';
			?>
			<label data-gkbr-choice data-group="<?php echo esc_attr( $families[ $code ] ?? 'other' ); ?>" data-language="<?php echo esc_attr( $code ); ?>" style="padding:12px;border:1px solid #c3d2df;border-radius:10px;background:white;overflow-wrap:anywhere">
				<input type="checkbox" name="translations[]" value="<?php echo esc_attr( $row['code'] ); ?>" <?php checked( in_array( $row['code'], $selected, true ) ); ?>>
				<strong><?php echo esc_html( $row['name'] ); ?></strong><br>
				<small><?php echo esc_html( ( $row['language']['native_name'] ?? $row['language']['name'] ?? $code ) . ' · ' . ( $row['short_name'] ?? $row['code'] ) ); ?></small>
			</label>
		<?php endforeach; ?></div></section>
	<?php endforeach; ?></div>
	<?php
}
