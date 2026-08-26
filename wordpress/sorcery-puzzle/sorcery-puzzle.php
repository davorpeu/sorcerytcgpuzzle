<?php
/**
 * Plugin Name: Sorcery Puzzle
 * Description: Embeds the Sorcery TCG puzzle app via the [sorcery_puzzle] shortcode and stores puzzles site-wide through a REST API. Shortcode attributes: src (URL to a puzzle JSON), puzzle (stored puzzle id), daily="1".
 * Version: 0.4.0
 * Author: davorpeu
 */

if (!defined('ABSPATH')) {
    exit;
}

define('SORCERY_PUZZLE_CPT', 'sorcery_puzzle');
define('SORCERY_PUZZLE_REST_NS', 'sorcery-puzzle/v1');

/**
 * Editors and admins (edit_others_posts) may create/update/delete puzzles;
 * everyone else gets a play-only app. Filterable per site.
 */
function sorcery_puzzle_can_edit()
{
    return apply_filters(
        'sorcery_puzzle_can_edit',
        current_user_can('edit_others_posts')
    );
}

/**
 * A puzzle is released once its puzzle_date meta is set and that date has
 * arrived (site timezone). Undated puzzles are drafts: only editors see
 * them. Editors bypass all visibility filtering.
 */
function sorcery_puzzle_today()
{
    return current_time('Y-m-d');
}

function sorcery_puzzle_released($post)
{
    $date = get_post_meta($post->ID, 'puzzle_date', true);
    return $date && $date <= sorcery_puzzle_today();
}

function sorcery_puzzle_visible_posts()
{
    $posts = sorcery_puzzle_all_posts();
    if (sorcery_puzzle_can_edit()) {
        return $posts;
    }
    return array_values(array_filter($posts, 'sorcery_puzzle_released'));
}

/**
 * Puzzles are stored as a hidden custom post type: the puzzle JSON in
 * post_content, the name in post_title, the release date in the
 * puzzle_date meta.
 */
add_action('init', function () {
    register_post_type(SORCERY_PUZZLE_CPT, array(
        'label'               => 'Sorcery Puzzles',
        'public'              => false,
        'show_ui'             => false,
        'exclude_from_search' => true,
        'supports'            => array('title'),
    ));
});

function sorcery_puzzle_get_post($id)
{
    $post = get_post((int) $id);
    if (
        !$post
        || $post->post_type !== SORCERY_PUZZLE_CPT
        || $post->post_status !== 'publish'
    ) {
        return null;
    }
    return $post;
}

function sorcery_puzzle_summary($post)
{
    $date = get_post_meta($post->ID, 'puzzle_date', true);
    return array(
        'id'      => (string) $post->ID,
        'name'    => $post->post_title,
        'date'    => $date ? $date : null,
        'savedAt' => get_post_modified_time('c', true, $post),
    );
}

/**
 * Card images are stored once in the Media Library and referenced by
 * attachment id, rather than inlined as base64 in every puzzle. This keeps
 * the database small, lets the browser cache each image across puzzles, and
 * deduplicates identical art. Raster types only; SVG (demo cards) stays
 * inline, which is harmless.
 */
function sorcery_puzzle_image_exts()
{
    return array(
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
        'image/gif'  => 'gif',
    );
}

/**
 * Store a data: URL as a Media Library attachment, reusing an existing one
 * when the same bytes were stored before. Returns an attachment id, or 0 if
 * the input isn't an image data URL we handle (callers then leave it inline).
 */
function sorcery_puzzle_intern_image($src)
{
    if (!is_string($src) || strpos($src, 'data:') !== 0) {
        return 0;
    }
    if (!preg_match('#^data:([^;,]+)[^,]*,(.*)$#s', $src, $m)) {
        return 0;
    }

    $mime = strtolower(trim($m[1]));
    $exts = sorcery_puzzle_image_exts();
    if (!isset($exts[$mime])) {
        return 0;
    }

    $header = substr($src, 0, strpos($src, ','));
    $bytes  = stripos($header, 'base64') !== false
        ? base64_decode($m[2])
        : rawurldecode($m[2]);
    if (empty($bytes)) {
        return 0;
    }

    $hash = hash('sha256', $bytes);

    // Dedup: have we stored these exact bytes before?
    $existing = get_posts(array(
        'post_type'   => 'attachment',
        'post_status' => 'inherit',
        'numberposts' => 1,
        'fields'      => 'ids',
        'meta_key'    => '_sorcery_img_hash',
        'meta_value'  => $hash,
    ));
    if ($existing) {
        return (int) $existing[0];
    }

    $filename = 'sorcery-' . substr($hash, 0, 16) . '.' . $exts[$mime];
    $upload   = wp_upload_bits($filename, null, $bytes);
    if (!empty($upload['error'])) {
        return 0;
    }

    $attach_id = wp_insert_attachment(array(
        'post_mime_type' => $mime,
        'post_title'     => $filename,
        'post_status'    => 'inherit',
    ), $upload['file']);
    if (is_wp_error($attach_id) || !$attach_id) {
        return 0;
    }

    require_once ABSPATH . 'wp-admin/includes/image.php';
    wp_update_attachment_metadata(
        $attach_id,
        wp_generate_attachment_metadata($attach_id, $upload['file'])
    );
    update_post_meta($attach_id, '_sorcery_img_hash', $hash);
    // Marks this attachment as ours so a future cleanup pass can find
    // images no puzzle references any more.
    update_post_meta($attach_id, '_sorcery_managed', 1);

    return (int) $attach_id;
}

/**
 * Replace each card's inline data: image with an attachment-id reference,
 * for storage. Idempotent: cards already carrying an imgId (or a plain URL)
 * are left alone, so re-saving never duplicates a file. On any intern
 * failure the original data URL is kept, so no image is ever lost.
 */
function sorcery_puzzle_pack_images(&$data)
{
    if (empty($data['cards']) || !is_array($data['cards'])) {
        return;
    }
    foreach ($data['cards'] as &$card) {
        if (
            is_array($card)
            && !empty($card['img'])
            && strpos($card['img'], 'data:') === 0
        ) {
            $id = sorcery_puzzle_intern_image($card['img']);
            if ($id) {
                $card['imgId'] = $id;
                unset($card['img']);
            }
        }
    }
    unset($card);
}

/**
 * Resolve each card's stored attachment reference back to its current URL,
 * for output. The app only ever sees img as a plain URL string.
 */
function sorcery_puzzle_unpack_images(&$data)
{
    if (empty($data['cards']) || !is_array($data['cards'])) {
        return;
    }
    foreach ($data['cards'] as &$card) {
        if (is_array($card) && !empty($card['imgId'])) {
            $url = wp_get_attachment_url((int) $card['imgId']);
            if ($url) {
                $card['img'] = $url;
            }
        }
    }
    unset($card);
}

function sorcery_puzzle_full($post)
{
    $data = json_decode($post->post_content, true);
    if (!is_array($data)) {
        return new WP_Error(
            'sorcery_puzzle_corrupt',
            'Stored puzzle data is not valid JSON.',
            array('status' => 500)
        );
    }
    // The post is the source of truth for identity and metadata.
    $summary = sorcery_puzzle_summary($post);
    $data['id']   = $summary['id'];
    $data['name'] = $summary['name'];
    $data['date'] = $summary['date'];
    // Card images are stored as Media Library references; resolve each back
    // to its current URL so the app always receives a plain img string.
    sorcery_puzzle_unpack_images($data);
    return $data;
}

function sorcery_puzzle_all_posts()
{
    return get_posts(array(
        'post_type'   => SORCERY_PUZZLE_CPT,
        'post_status' => 'publish',
        'numberposts' => -1,
        'orderby'     => 'modified',
        'order'       => 'DESC',
    ));
}

add_action('rest_api_init', function () {
    register_rest_route(SORCERY_PUZZLE_REST_NS, '/puzzles', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'sorcery_puzzle_rest_list',
            'permission_callback' => '__return_true',
        ),
        array(
            'methods'             => 'POST',
            'callback'            => 'sorcery_puzzle_rest_save',
            'permission_callback' => 'sorcery_puzzle_can_edit',
        ),
    ));
    register_rest_route(SORCERY_PUZZLE_REST_NS, '/puzzles/(?P<id>\d+)', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'sorcery_puzzle_rest_get',
            'permission_callback' => '__return_true',
        ),
        array(
            'methods'             => 'DELETE',
            'callback'            => 'sorcery_puzzle_rest_delete',
            'permission_callback' => 'sorcery_puzzle_can_edit',
        ),
    ));
    register_rest_route(SORCERY_PUZZLE_REST_NS, '/daily', array(
        'methods'             => 'GET',
        'callback'            => 'sorcery_puzzle_rest_daily',
        'permission_callback' => '__return_true',
    ));
});

function sorcery_puzzle_rest_list()
{
    return array_map('sorcery_puzzle_summary', sorcery_puzzle_visible_posts());
}

function sorcery_puzzle_rest_get($req)
{
    $post = sorcery_puzzle_get_post($req['id']);
    // Unreleased puzzles 404 like missing ones so their existence
    // isn't leaked to players probing ids.
    if (!$post || (!sorcery_puzzle_released($post) && !sorcery_puzzle_can_edit())) {
        return new WP_Error(
            'sorcery_puzzle_not_found',
            'Puzzle not found.',
            array('status' => 404)
        );
    }
    return sorcery_puzzle_full($post);
}

function sorcery_puzzle_rest_save($req)
{
    $data = $req->get_json_params();
    if (!is_array($data) || !isset($data['cards'], $data['initial'])) {
        return new WP_Error(
            'sorcery_puzzle_invalid',
            'Body must be a puzzle JSON object with cards and initial zones.',
            array('status' => 400)
        );
    }

    $name = sanitize_text_field($data['name'] ?? '');
    $name = $name !== '' ? $name : 'Untitled puzzle';
    $date = (string) ($data['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        $date = '';
    }
    $data['name'] = $name;
    $data['date'] = $date ? $date : null;

    // Move any inline card images into the Media Library, leaving only
    // small attachment references in the puzzle JSON we store.
    sorcery_puzzle_pack_images($data);

    $postarr = array(
        'post_type'    => SORCERY_PUZZLE_CPT,
        'post_status'  => 'publish',
        'post_title'   => $name,
        'post_content' => wp_slash(wp_json_encode($data)),
    );
    // A numeric id that matches an existing puzzle post means update;
    // anything else (including localStorage-era random ids) creates new.
    if (
        isset($data['id'])
        && ctype_digit((string) $data['id'])
        && sorcery_puzzle_get_post($data['id'])
    ) {
        $postarr['ID'] = (int) $data['id'];
    }

    $id = wp_insert_post($postarr, true);
    if (is_wp_error($id)) {
        $id->add_data(array('status' => 500));
        return $id;
    }
    update_post_meta($id, 'puzzle_date', $date);

    return sorcery_puzzle_summary(get_post($id));
}

function sorcery_puzzle_rest_delete($req)
{
    $post = sorcery_puzzle_get_post($req['id']);
    if (!$post) {
        return new WP_Error(
            'sorcery_puzzle_not_found',
            'Puzzle not found.',
            array('status' => 404)
        );
    }
    wp_delete_post($post->ID, true);
    return array('deleted' => true, 'id' => (string) $post->ID);
}

/**
 * The current puzzle: the released puzzle with the latest date (site
 * timezone), tie-broken by highest post ID. Mirrors the client-side
 * localStorage fallback in store.js loadDaily().
 */
function sorcery_puzzle_rest_daily()
{
    $released = array_values(array_filter(
        sorcery_puzzle_all_posts(),
        'sorcery_puzzle_released'
    ));
    if (!$released) {
        return new WP_Error(
            'sorcery_puzzle_no_puzzles',
            'No puzzle has been released yet.',
            array('status' => 404)
        );
    }

    usort($released, function ($a, $b) {
        $da = get_post_meta($a->ID, 'puzzle_date', true);
        $db = get_post_meta($b->ID, 'puzzle_date', true);
        if ($da !== $db) {
            return strcmp($db, $da);
        }
        return $b->ID - $a->ID;
    });
    return sorcery_puzzle_full($released[0]);
}

/**
 * One-time migration for puzzles saved before images were externalized:
 * re-packs every stored puzzle so inline base64 images move into the Media
 * Library. Idempotent and deduplicating, so it's safe to run more than once.
 * Run via WP-CLI: wp eval 'sorcery_puzzle_migrate_inline_images();'
 * Returns the number of puzzles whose stored content changed.
 */
function sorcery_puzzle_migrate_inline_images()
{
    $changed = 0;
    foreach (sorcery_puzzle_all_posts() as $post) {
        $data = json_decode($post->post_content, true);
        if (!is_array($data)) {
            continue;
        }
        sorcery_puzzle_pack_images($data);
        $content = wp_json_encode($data);
        if ($content !== $post->post_content) {
            wp_update_post(array(
                'ID'           => $post->ID,
                'post_content' => wp_slash($content),
            ));
            $changed++;
        }
    }
    return $changed;
}

function sorcery_puzzle_shortcode($atts)
{
    $atts = shortcode_atts(
        array(
            'src'    => '',
            'puzzle' => '',
            'daily'  => '',
        ),
        $atts,
        'sorcery_puzzle'
    );

    // Styles are bundled inside the JS and injected at runtime,
    // so only the script needs to be enqueued. The file's mtime versions
    // the URL so browsers pick up every rebuild instead of a cached copy.
    $bundle = plugin_dir_path(__FILE__) . 'dist/sorcery-puzzle.js';
    wp_enqueue_script(
        'sorcery-puzzle',
        plugins_url('dist/sorcery-puzzle.js', __FILE__),
        array(),
        file_exists($bundle) ? (string) filemtime($bundle) : '0.4.0',
        true
    );

    $can_edit = sorcery_puzzle_can_edit();

    $attrs  = ' data-editor="' . ($can_edit ? '1' : '0') . '"';
    $attrs .= ' data-api="' . esc_attr(esc_url_raw(rest_url(SORCERY_PUZZLE_REST_NS))) . '"';
    if ($can_edit) {
        // Lets the app authenticate its REST writes as the logged-in editor.
        $attrs .= ' data-nonce="' . esc_attr(wp_create_nonce('wp_rest')) . '"';
    }
    if ($atts['src']) {
        $attrs .= ' data-src="' . esc_attr($atts['src']) . '"';
    }
    if ($atts['puzzle']) {
        $attrs .= ' data-puzzle="' . esc_attr($atts['puzzle']) . '"';
    }
    if ($atts['daily']) {
        $attrs .= ' data-daily="1"';
    }

    return '<div id="sorcery-puzzle-root"' . $attrs . '></div>';
}
add_shortcode('sorcery_puzzle', 'sorcery_puzzle_shortcode');
