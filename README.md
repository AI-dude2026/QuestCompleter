# Quest Completer for Vencord

> **⚠️ WARNING: Use this plugin at your own risk.** > Automating Discord quests or spoofing game presence goes against Discord's Terms of Service. While Vencord itself is a client mod (which is also technically against ToS but practically tolerated), manipulating API endpoints to farm quest rewards involves automated, fake API traffic. 
> 
> There is always a risk that Discord may notice unusual API behavior and issue a ban or suspension for "botting" or interacting with their services artificially. So far, bans for doing this are extremely rare, but you must assume the risk yourself.

---

## Features

* **Global "⚡ Spoof All Quests" button** — a single draggable floating button that handles all accepted quests at once.
* **Draggable UI** — click and drag the button anywhere on screen; it stays put between interactions.
* **Priority-based quest ordering** — quests are completed in a smart order: Video → Mobile Video → Desktop Play → Stream → Activity.
* **Multi-quest support** — spoof every accepted quest simultaneously with staggered starts.
* **All 5 task types supported:**
  * `WATCH_VIDEO` — fakes video watch progress via `/quests/{id}/video-progress`.
  * `WATCH_VIDEO_ON_MOBILE` — same as above, treated identically.
  * `PLAY_ON_DESKTOP` — spoofs a fake running game process via `RunningGameStore`.
  * `STREAM_ON_DESKTOP` — fakes an active stream via `ApplicationStreamingStore`.
  * `PLAY_ACTIVITY` — sends heartbeats for activity-based quests (requires a voice channel).
* **Live progress display** — the button shows real-time percentage (e.g. `Spoofing Video: 73%`) as spoofing runs.
* **Stop / Cancel** — click the button while spoofing is active to instantly abort all running tasks cleanly.
* **Auto-updater** — on startup the plugin fetches the latest version from GitHub. If a newer version is found, a draggable update banner appears with a one-click **Update & Reload** button that writes the new file and reloads Discord automatically.
* **Clean teardown** — disabling the plugin via Vencord settings aborts all active spoofs, removes the button, and resets all internal state.

---

## Installation

This plugin requires you to be running Vencord from source so that you can compile custom Userplugins.

1.  Ensure you have cloned the Vencord repository (e.g. `git clone https://github.com/Vendicated/Vencord.git`).
2.  Inside your `Vencord` repo, ensure the `src/userplugins` folder exists.
3.  Move this `vencord-quest-completer` folder *into* your `src/userplugins` directory.
    * Example path: `C:\Users\YourName\Vencord\src\userplugins\vencord-quest-completer\`
4.  Open your command line / terminal inside your main `Vencord` directory.
5.  Compile Vencord:
    ```cmd
    pnpm build
    ```
6.  If this is your first time injecting Vencord, run:
    ```cmd
    pnpm inject
    ```
7.  Fully restart Discord (or press `Ctrl+R` to reload the client).
8.  Go to **Settings > Plugins > QuestCompleter** and ensure it is toggled ON.
9.  Open your **Gift Inventory** (Quests tab) and you're good to go!

---

## Acknowledgments & Credits

The core logic and API endpoints used in this plugin are based on the original standalone script created by **[aamiaa](https://gist.github.com/aamiaa)**. 
Huge thanks to them! You can find their original, regularly updated Gist here: [Complete Recent Discord Quest](https://gist.github.com/aamiaa/204cd9d42013ded9faf646fae7f89fbb).

---

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE) - see the LICENSE file for details.
