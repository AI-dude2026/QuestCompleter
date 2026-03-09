# Quest Completer for Vencord

## ⚠️ WARNING
**Use this plugin at your own risk.** 
Automating Discord quests or spoofing game presence goes against Discord's Terms of Service. While Vencord itself is a client mod (which is also technically against ToS but practically tolerated), manipulating API endpoints to farm quest rewards involves automated, fake API traffic. 

There is always a risk that Discord may notice unusual API behavior and issue a ban or suspension for "botting" or interacting with their services artificially. So far, bans for doing this are extremely rare, but you must assume the risk yourself.

---

### Features
- Adds a **Spoof** button directly inside your Discord Quests tab.
- Fakes application streaming, game execution, and video watching entirely in the background.
- Accurate progress tracking directly on the Spoof button UI.
- Cancel/Stop button to cleanly abort background tasks without restarting Discord.

## Installation

This plugin requires you to be running Vencord from source so that you can compile custom Userplugins.

1. Ensure you have cloned the Vencord repository (e.g. `git clone https://github.com/Vendicated/Vencord.git`).
2. Inside your `Vencord` repo, ensure the `src/userplugins` folder exists.
3. Move this `vencord-quest-completer` folder *into* your `src/userplugins` directory.
   - Example path: `C:\Users\YourName\Vencord\src\userplugins\vencord-quest-completer\`
4. Open your command line / terminal inside your main `Vencord` directory.
5. Compile Vencord:
   ```cmd
   pnpm build
   ```
6. If this is your first time injecting Vencord, run:
   ```cmd
   pnpm inject
   ```
7. Fully restart Discord (or press `Ctrl+R` to reload the client).
8. Go to **Settings > Plugins > QuestCompleter** and ensure it is toggled ON.
9. Open your **Gift Inventory** (Quests tab) and you're good to go!
