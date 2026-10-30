# The Overdramatic Movie Theater Snack Sneaker

A tiny, theatrical stealth game about smuggling one packet of local banana chips past a cinema ticket checker. The game rules and timing challenge are written in C; Emscripten compiles them to WebAssembly for the browser. The lobby illustration is drawn in SVG and the interface uses HTML/CSS, so the published game needs no external art files or runtime services.

## Play locally

Install the [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html), then run this from a bash-compatible shell in the repository:

```sh
emcc src/game.c -O2 -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=createSnackSneaker \
  -s EXPORTED_FUNCTIONS='["_main","_game_reset","_game_start","_game_choose_hide","_game_choose_walk","_game_back","_game_tick","_game_act","_game_get_screen","_game_get_ending","_game_get_hide","_game_get_walk","_game_get_stage","_game_get_last_stage","_game_get_last_quality","_game_get_suspicion","_game_get_crinkles","_game_get_score","_game_get_cursor","_game_get_target","_game_get_window"]' \
  -s EXPORTED_RUNTIME_METHODS='["cwrap"]' -s ALLOW_MEMORY_GROWTH=1 -o web/game.js
python -m http.server 8000 -d web
```

Open `http://localhost:8000`. The generated `web/game.js` and `web/game.wasm` are build outputs and should not be committed.

## Publish with GitHub Pages

Push this repository to GitHub. For a quick publish without a build step, set **Settings → Pages → Build and deployment → Source** to **Deploy from a branch**, select your default branch and `/(root)`. The root page forwards visitors to the game in `web/`, which remains playable if the WebAssembly build is not present.

For the C/WebAssembly build, set the Pages source to **GitHub Actions** instead. The included workflow compiles the C engine and deploys the web files on every push to `main`; it can also be started manually from the Actions tab.

## How to play

Pick one hiding spot, choose a walk, then press **Space** or the button when the moving ivory needle enters the green quiet-beat window. Time three steps to reach the seat. Guard suspicion and packet crinkle both carry across the run; either one getting too high means the snacks are confiscated.
