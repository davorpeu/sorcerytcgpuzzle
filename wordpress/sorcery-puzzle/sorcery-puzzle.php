<?php
/**
 * Plugin Name: Sorcery Puzzle
 * Description: Embeds the Sorcery TCG puzzle app via the [sorcery_puzzle] shortcode and stores puzzles site-wide through a REST API. Shortcode attributes: src (URL to a puzzle JSON), puzzle (stored puzzle id), daily="1".
 * Version: 0.3.0
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
        file_exists($bundle) ? (string) filemtime($bundle) : '0.3.0',
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
