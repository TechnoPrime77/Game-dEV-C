#include <math.h>

/*
 * The little rules engine behind The Overdramatic Movie Theater Snack Sneaker.
 * Presentation lives in the web layer; all choices, timing, meters and endings
 * are owned here so the game itself runs as C compiled to WebAssembly.
 */

enum Screen { SCREEN_TITLE = 0, SCREEN_HIDE, SCREEN_WALK, SCREEN_RUN, SCREEN_END };
enum Ending { END_NONE = 0, END_WIN, END_CAUGHT };

static int screen = SCREEN_TITLE;
static int ending = END_NONE;
static int hide_choice = -1;
static int walk_choice = -1;
static int stage = 0;
static int last_stage = -1;
static int last_quality = -1;
static int suspicion = 0;
static int crinkles = 0;
static int score = 0;
static float cursor = 0.0f;
static float cursor_direction = 1.0f;
static float target = 56.0f;
static float window_width = 11.0f;

static const float targets[3] = {56.0f, 38.0f, 71.0f};

void game_reset(void) {
    screen = SCREEN_TITLE;
    ending = END_NONE;
    hide_choice = -1;
    walk_choice = -1;
    stage = 0;
    last_stage = -1;
    last_quality = -1;
    suspicion = 0;
    crinkles = 0;
    score = 0;
    cursor = 0.0f;
    cursor_direction = 1.0f;
    target = targets[0];
    window_width = 11.0f;
}

void game_start(void) {
    if (screen == SCREEN_TITLE) screen = SCREEN_HIDE;
}

void game_choose_hide(int choice) {
    if (screen != SCREEN_HIDE || choice < 0 || choice > 2) return;
    hide_choice = choice;
    screen = SCREEN_WALK;
}

void game_choose_walk(int choice) {
    if (screen != SCREEN_WALK || choice < 0 || choice > 2 || hide_choice < 0) return;
    walk_choice = choice;
    stage = 0;
    last_stage = -1;
    last_quality = -1;
    ending = END_NONE;
    score = 0;

    /* A suspicious silhouette starts warmer under the guard's flashlight. */
    const int hide_heat[3] = {5, 15, 4};
    const int walk_heat[3] = {0, 5, 9};
    suspicion = hide_heat[hide_choice] + walk_heat[walk_choice];
    crinkles = 0;

    /* The quietest combinations get a little more room in the timing window. */
    const float hide_window[3] = {1.0f, -1.5f, 0.0f};
    const float walk_window[3] = {3.0f, 0.5f, -2.0f};
    window_width = 10.0f + hide_window[hide_choice] + walk_window[walk_choice];
    if (window_width < 6.0f) window_width = 6.0f;
    if (window_width > 15.0f) window_width = 15.0f;
    target = targets[0];
    cursor = 0.0f;
    cursor_direction = 1.0f;
    screen = SCREEN_RUN;
}

void game_back(void) {
    if (screen == SCREEN_WALK) screen = SCREEN_HIDE;
    else if (screen == SCREEN_RUN) screen = SCREEN_WALK;
}

void game_tick(float seconds) {
    if (screen != SCREEN_RUN || seconds <= 0.0f) return;
    cursor += cursor_direction * 42.0f * seconds;
    if (cursor >= 100.0f) { cursor = 100.0f; cursor_direction = -1.0f; }
    if (cursor <= 0.0f) { cursor = 0.0f; cursor_direction = 1.0f; }
}

/* Returns 0 for a silent perfect step, 1 for a close call, 2 for a miss. */
int game_act(void) {
    if (screen != SCREEN_RUN || stage < 0 || stage >= 3) return -1;

    const float distance = fabsf(cursor - target);
    int quality;
    int heat_gain = 0;
    int noise_gain = 0;

    if (distance <= window_width * 0.34f) {
        quality = 0;
        score += 100;
    } else if (distance <= window_width) {
        quality = 1;
        heat_gain = 4 + (hide_choice == 1 ? 3 : 0);
        noise_gain = (hide_choice == 0 || walk_choice == 2) ? 1 : 0;
        score += 48;
    } else {
        quality = 2;
        const int hide_noise[3] = {2, 0, 1};
        const int walk_noise[3] = {1, 0, 2};
        const float excess = distance - window_width;
        heat_gain = 13 + (int)(excess * 0.42f) + (hide_choice == 1 ? 7 : 0);
        noise_gain = 2 + hide_noise[hide_choice] + walk_noise[walk_choice];
        score += 8;
    }

    suspicion += heat_gain;
    crinkles += noise_gain;
    if (suspicion > 100) suspicion = 100;
    if (crinkles > 10) crinkles = 10;
    last_stage = stage;
    last_quality = quality;

    if (suspicion >= 100 || crinkles >= 8) {
        ending = END_CAUGHT;
        screen = SCREEN_END;
        return quality;
    }

    stage++;
    if (stage >= 3) {
        ending = END_WIN;
        screen = SCREEN_END;
    } else {
        target = targets[stage];
        cursor = cursor > 52.0f ? 100.0f : 0.0f;
        cursor_direction = cursor > 50.0f ? -1.0f : 1.0f;
    }
    return quality;
}

int game_get_screen(void) { return screen; }
int game_get_ending(void) { return ending; }
int game_get_hide(void) { return hide_choice; }
int game_get_walk(void) { return walk_choice; }
int game_get_stage(void) { return stage; }
int game_get_last_stage(void) { return last_stage; }
int game_get_last_quality(void) { return last_quality; }
int game_get_suspicion(void) { return suspicion; }
int game_get_crinkles(void) { return crinkles; }
int game_get_score(void) { return score; }
float game_get_cursor(void) { return cursor; }
float game_get_target(void) { return target; }
float game_get_window(void) { return window_width; }

int main(void) { return 0; }
