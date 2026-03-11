// @ts-ignore
import definePlugin from "@utils/types";


const PLUGIN_VERSION = "1.2.1";
const UPDATE_URL = "https://raw.githubusercontent.com/AI-dude2026/QuestCompleter/main/index.tsx";


const SUPPORTED_TASKS = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"];
const TASK_PRIORITY = ["WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY"];

let ApplicationStreamingStore: any;
let RunningGameStore: any;
let QuestsStore: any;
let ChannelStore: any;
let GuildChannelStore: any;
let FluxDispatcher: any;
let api: any;
let isApp: boolean;
let activeSpoofs = new Map<string, AbortController>();
let initialized = false;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function getTaskConfig(quest: any) {
    return quest.config.taskConfig ?? quest.config.taskConfigV2;
}

function initStores(): boolean {
    if (initialized) { console.log("[QC] initStores: already initialized, skipping"); return true; }
    console.log("[QC] initStores: starting store discovery...");
    try {
        const wpRequire = (window as any).webpackChunkdiscord_app.push([[Symbol()], {}, (r: any) => r]);
        (window as any).webpackChunkdiscord_app.pop();
        const mods = Object.values(wpRequire.c) as any[];
        console.log("[QC] initStores: got", mods.length, "webpack modules");

        ApplicationStreamingStore = mods.find(x =>
            x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata
        )?.exports?.Z;

        if (!ApplicationStreamingStore) {
            console.log("[QC] initStores: using exports.A variant");
            ApplicationStreamingStore = mods.find(x =>
                x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata
            )?.exports?.A;
            RunningGameStore = mods.find(x => x?.exports?.Ay?.getRunningGames)?.exports?.Ay;
            QuestsStore = mods.find(x => x?.exports?.A?.__proto__?.getQuest)?.exports?.A;
            ChannelStore = mods.find(x => x?.exports?.A?.__proto__?.getAllThreadsForParent)?.exports?.A;
            GuildChannelStore = mods.find(x => x?.exports?.Ay?.getSFWDefaultChannel)?.exports?.Ay;
            FluxDispatcher = mods.find(x => x?.exports?.h?.__proto__?.flushWaitQueue)?.exports?.h;
            api = mods.find(x => x?.exports?.Bo?.get)?.exports?.Bo;
        } else {
            console.log("[QC] initStores: using exports.Z variant");
            RunningGameStore = mods.find(x => x?.exports?.ZP?.getRunningGames)?.exports?.ZP;
            QuestsStore = mods.find(x => x?.exports?.Z?.__proto__?.getQuest)?.exports?.Z;
            ChannelStore = mods.find(x => x?.exports?.Z?.__proto__?.getAllThreadsForParent)?.exports?.Z;
            GuildChannelStore = mods.find(x => x?.exports?.ZP?.getSFWDefaultChannel)?.exports?.ZP;
            FluxDispatcher = mods.find(x => x?.exports?.Z?.__proto__?.flushWaitQueue)?.exports?.Z;
            api = mods.find(x => x?.exports?.tn?.get)?.exports?.tn;
        }

        console.log("[QC] initStores: ApplicationStreamingStore?", !!ApplicationStreamingStore);
        console.log("[QC] initStores: RunningGameStore?", !!RunningGameStore);
        console.log("[QC] initStores: QuestsStore?", !!QuestsStore);
        console.log("[QC] initStores: FluxDispatcher?", !!FluxDispatcher);
        console.log("[QC] initStores: api?", !!api);

        if (!QuestsStore || !FluxDispatcher || !api) {
            console.error("[QC] initStores: FAILED – missing required store(s)");
            return false;
        }

        isApp = typeof (window as any).DiscordNative !== "undefined";
        initialized = true;
        console.log("[QC] initStores: done. isApp =", isApp);
        return true;
    } catch (e) {
        console.error("[QC] initStores: exception:", e);
        return false;
    }
}

function getEligibleQuests() {
    if (!QuestsStore?.quests) { console.log("[QC] getEligibleQuests: QuestsStore or quests not ready"); return []; }
    const all = [...QuestsStore.quests.values()];
    console.log("[QC] getEligibleQuests: total quests in store:", all.length);
    const eligible = all.filter((x: any) =>
        x.userStatus?.enrolledAt &&
        !x.userStatus?.completedAt &&
        new Date(x.config.expiresAt).getTime() > Date.now() &&
        SUPPORTED_TASKS.some((y: string) => Object.keys(getTaskConfig(x).tasks).includes(y))
    ).sort((a: any, b: any) => {
        const ta = TASK_PRIORITY.findIndex(t => getTaskConfig(a).tasks[t] != null);
        const tb = TASK_PRIORITY.findIndex(t => getTaskConfig(b).tasks[t] != null);
        return (ta === -1 ? 99 : ta) - (tb === -1 ? 99 : tb);
    });
    console.log("[QC] getEligibleQuests: eligible quests:", eligible.map((q: any) => q.config?.messages?.questName));
    return eligible;
}

function completeQuest(questId: string, btn: HTMLButtonElement) {
    console.log("[QC] completeQuest: starting for quest ID", questId);
    if (!initStores()) {
        console.error("[QC] completeQuest: store init failed");
        btn.innerText = "Error: Init Failed";
        btn.style.backgroundColor = "#ED4245";
        return;
    }

    const quests = [...QuestsStore.quests.values()].filter((x: any) =>
        x.userStatus?.enrolledAt &&
        !x.userStatus?.completedAt &&
        new Date(x.config.expiresAt).getTime() > Date.now() &&
        SUPPORTED_TASKS.some((y: string) => Object.keys(getTaskConfig(x).tasks).includes(y))
    );

    const quest = quests.find((q: any) => q.id === questId);
    if (!quest) {
        console.warn("[QC] completeQuest: quest not found or uncompletable:", questId);
        btn.innerText = "Error: Not Completable";
        btn.style.backgroundColor = "#ED4245";
        return;
    }
    console.log("[QC] completeQuest: found quest:", quest.config?.messages?.questName);

    const pid = Math.floor(Math.random() * 30000) + 1000;
    const applicationId = quest.config.application.id;
    const applicationName = quest.config.application.name;
    const questName = quest.config.messages.questName;
    const taskConfig = getTaskConfig(quest);
    const taskName = SUPPORTED_TASKS.find(x => taskConfig.tasks[x] != null)!;
    const secondsNeeded = taskConfig.tasks[taskName].target;
    let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

    const controller = new AbortController();
    activeSpoofs.set(questId, controller);
    const signal = controller.signal;

    btn.innerText = "Stop";
    btn.style.backgroundColor = "#ED4245";
    btn.style.color = "white";
    btn.dataset.mode = "stop";

    const finish = (text: string, color: string, textColor = "black") => {
        btn.innerText = text;
        btn.style.backgroundColor = color;
        btn.style.color = textColor;
        btn.dataset.mode = "spoof";
        activeSpoofs.delete(questId);
    };

    if (taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
        const maxFuture = 10, speed = 7, interval = 1;
        const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
        let completed = false;

        (async () => {
            try {
                while (!signal.aborted) {
                    const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
                    const diff = maxAllowed - secondsDone;
                    const timestamp = secondsDone + speed;

                    if (diff >= speed) {
                        const res = await api.post({
                            url: `/quests/${quest.id}/video-progress`,
                            body: { timestamp: Math.min(secondsNeeded, timestamp + Math.random()) }
                        });
                        completed = res.body.completed_at != null;
                        secondsDone = Math.min(secondsNeeded, timestamp);
                    }

                    const pct = Math.floor(Math.min((secondsDone / secondsNeeded) * 100, 100));
                    btn.innerText = `Spoofing Video: ${pct}%`;

                    if (timestamp >= secondsNeeded) break;
                    await sleep(interval * 1000);
                }

                if (signal.aborted) {
                    console.log(`Stopped spoofing video: ${questName}`);
                    finish("Stopped", "#ED4245", "white");
                    return;
                }

                if (!completed) {
                    await api.post({
                        url: `/quests/${quest.id}/video-progress`,
                        body: { timestamp: secondsNeeded }
                    });
                }

                console.log(`Completed: ${questName}`);
                finish("Done!", "#57F287");
            } catch (e) {
                console.error(`Error completing "${questName}":`, e);
                finish("Error", "#ED4245", "white");
            }
        })();

        console.log(`Spoofing video: ${questName}`);

    } else if (taskName === "PLAY_ON_DESKTOP") {
        if (!isApp) {
            console.warn(`${questName} requires the desktop app – skipping`);
            btn.innerText = "Requires Desktop App";
            btn.style.backgroundColor = "#ED4245";
            btn.style.color = "white";
            return;
        }

        api.get({ url: `/applications/public?application_ids=${applicationId}` })
            .then((res: any) => {
                const appData = res.body?.[0];

                if (!appData) {
                    console.warn(`No app data returned for "${questName}" – skipping`);
                    btn.innerText = "API Error";
                    btn.style.backgroundColor = "#ED4245";
                    btn.style.color = "white";
                    return;
                }

                const win32Exe = appData.executables?.find((x: any) => x.os === "win32");
                const anyExe = appData.executables?.[0];
                const exeName = (win32Exe ?? anyExe)?.name?.replace(">", "") ?? `${appData.name}.exe`;

                const fakeGame = {
                    cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
                    exeName,
                    exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
                    hidden: false,
                    isLauncher: false,
                    id: applicationId,
                    name: appData.name,
                    pid,
                    pidPath: [pid],
                    processName: appData.name,
                    start: Date.now(),
                };

                const realGames = RunningGameStore.getRunningGames();
                const realGetRunningGames = RunningGameStore.getRunningGames;
                const realGetGameForPID = RunningGameStore.getGameForPID;

                const cleanup = () => {
                    RunningGameStore.getRunningGames = realGetRunningGames;
                    RunningGameStore.getGameForPID = realGetGameForPID;
                    FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                    FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                };

                signal.addEventListener("abort", () => {
                    cleanup();
                    console.log(`Stopped game spoof for: ${questName}`);
                    finish("Stopped", "#ED4245", "white");
                });

                RunningGameStore.getRunningGames = () => [fakeGame];
                RunningGameStore.getGameForPID = (p: number) => (p === fakeGame.pid ? fakeGame : undefined);
                FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: [fakeGame] });

                const fn = (data: any) => {
                    if (signal.aborted) return;
                    try {
                        let progress = 0;
                        if (quest.config.configVersion === 1) {
                            progress = data.userStatus.streamProgressSeconds;
                        } else if (data.userStatus.progress?.PLAY_ON_DESKTOP) {
                            progress = Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
                        }

                        console.log(`[${questName}] Progress: ${progress}/${secondsNeeded}`);
                        const pct = Math.floor(Math.min((progress / Math.max(secondsNeeded, 1)) * 100, 100));
                        btn.innerText = `Spoofing Play: ${pct}%`;

                        if (progress >= secondsNeeded) {
                            console.log(`Completed: ${questName}`);
                            cleanup();
                            finish("Done!", "#57F287");
                        }
                    } catch (e) {
                        console.error(`Error in heartbeat handler for "${questName}":`, e);
                        cleanup();
                        finish("Error", "#ED4245", "white");
                    }
                };

                FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                console.log(`Spoofed game: ${applicationName} – ~${Math.ceil((secondsNeeded - secondsDone) / 60)} min left`);
            })
            .catch((e: any) => {
                console.error(`Failed to fetch app data for "${questName}":`, e);
                finish("API Error", "#ED4245", "white");
            });

    } else if (taskName === "STREAM_ON_DESKTOP") {
        if (!isApp) {
            console.warn(`${questName} requires the desktop app – skipping`);
            btn.innerText = "Requires Desktop App";
            btn.style.backgroundColor = "#ED4245";
            btn.style.color = "white";
            return;
        }

        const realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;

        const cleanup = () => {
            ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
            FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
        };

        signal.addEventListener("abort", () => {
            cleanup();
            console.log(`Stopped stream spoof for: ${questName}`);
            finish("Stopped", "#ED4245", "white");
        });

        ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
            id: applicationId,
            pid,
            sourceName: null
        });

        const fn = (data: any) => {
            if (signal.aborted) return;
            try {
                let progress = 0;
                if (quest.config.configVersion === 1) {
                    progress = data.userStatus.streamProgressSeconds;
                } else if (data.userStatus.progress?.STREAM_ON_DESKTOP) {
                    progress = Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);
                }

                console.log(`[${questName}] Progress: ${progress}/${secondsNeeded}`);
                const pct = Math.floor(Math.min((progress / Math.max(secondsNeeded, 1)) * 100, 100));
                btn.innerText = `Spoofing Stream: ${pct}%`;

                if (progress >= secondsNeeded) {
                    console.log(`Completed: ${questName}`);
                    cleanup();
                    finish("Done!", "#57F287");
                }
            } catch (e) {
                console.error(`Error in heartbeat handler for "${questName}":`, e);
                cleanup();
                finish("Error", "#ED4245", "white");
            }
        };

        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
        btn.innerText = "Spoofing... (Needs VC)";
        console.log(`Spoofed stream: ${applicationName} – ~${Math.ceil((secondsNeeded - secondsDone) / 60)} min left (need 1+ in VC)`);

    } else if (taskName === "PLAY_ACTIVITY") {
        const channelId =
            ChannelStore.getSortedPrivateChannels()[0]?.id ??
            (Object.values(GuildChannelStore.getAllGuilds()) as any[])
                .find((x: any) => x?.VOCAL?.length > 0)?.VOCAL[0]?.channel?.id;

        if (!channelId) {
            console.warn("No suitable channel found for PLAY_ACTIVITY – skipping");
            btn.innerText = "No VC Found";
            btn.style.backgroundColor = "#ED4245";
            btn.style.color = "white";
            return;
        }

        const streamKey = `call:${channelId}:1`;

        (async () => {
            try {
                console.log(`Activity: ${questName}`);
                while (!signal.aborted) {
                    const res = await api.post({
                        url: `/quests/${quest.id}/heartbeat`,
                        body: { stream_key: streamKey, terminal: false }
                    });
                    const progress = res.body.progress.PLAY_ACTIVITY.value;
                    console.log(`[${questName}] Progress: ${progress}/${secondsNeeded}`);
                    const pct = Math.floor(Math.min((progress / Math.max(secondsNeeded, 1)) * 100, 100));
                    btn.innerText = `Activity: ${pct}%`;

                    if (progress >= secondsNeeded) {
                        await api.post({
                            url: `/quests/${quest.id}/heartbeat`,
                            body: { stream_key: streamKey, terminal: true }
                        });
                        break;
                    }

                    await sleep(20000);
                }

                if (signal.aborted) {
                    console.log(`Stopped activity spoof for: ${questName}`);
                    finish("Stopped", "#ED4245", "white");
                    return;
                }

                console.log(`Completed: ${questName}`);
                finish("Done!", "#57F287");
            } catch (e) {
                console.error(`Error completing "${questName}":`, e);
                finish("Error", "#ED4245", "white");
            }
        })();
    }
}


let observer: MutationObserver | null = null;
let injectInterval: ReturnType<typeof setInterval> | null = null;
let globalBtn: HTMLButtonElement | null = null;
let poll: ReturnType<typeof setInterval> | null = null;

function ensureGlobalButton() {

    if (globalBtn && document.body.contains(globalBtn)) return;

    console.log("[QC] ensureGlobalButton: creating fixed-position Spoof All Quests button");

    const btn = document.createElement("button");
    btn.className = "vencord-spoof-all-btn";
    btn.innerText = "⚡ Spoof All Quests";
    btn.style.cssText = [
        "position:fixed",
        "bottom:80px",
        "right:20px",
        "z-index:99999",
        "background:#5865F2",
        "color:white",
        "border:none",
        "border-radius:8px",
        "padding:10px 20px",
        "cursor:pointer",
        "font-weight:bold",
        "font-size:14px",
        "box-shadow:0 4px 15px rgba(0,0,0,0.5)",
        "pointer-events:all",
        "transition:background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease",
        "white-space:nowrap",
        "user-select:none",
        "letter-spacing:0.5px",
    ].join(";");

    btn.onmouseenter = () => {
        if (isDragging) return;
        btn.style.transform = "scale(1.08)";
        btn.style.boxShadow = "0 6px 24px rgba(88,101,242,0.7)";
        btn.style.filter = "brightness(1.2)";
    };
    btn.onmouseleave = () => {
        if (isDragging) return;
        btn.style.transform = "scale(1)";
        btn.style.boxShadow = "0 4px 15px rgba(0,0,0,0.5)";
        btn.style.filter = "brightness(1)";
    };


    let isDragging = false;
    let dragged = false;
    let dragOffsetX = 0, dragOffsetY = 0;

    btn.addEventListener("mousedown", (e) => {
        isDragging = true;
        dragged = false;
        dragOffsetX = e.clientX - btn.getBoundingClientRect().left;
        dragOffsetY = e.clientY - btn.getBoundingClientRect().top;
        btn.style.transition = "none";
        btn.style.cursor = "grabbing";
        btn.style.transform = "scale(1.05)";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        dragged = true;
        const x = e.clientX - dragOffsetX;
        const y = e.clientY - dragOffsetY;
        btn.style.right = "auto";
        btn.style.bottom = "auto";
        btn.style.left = Math.max(0, Math.min(x, window.innerWidth - btn.offsetWidth)) + "px";
        btn.style.top = Math.max(0, Math.min(y, window.innerHeight - btn.offsetHeight)) + "px";
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        btn.style.transition = "background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease";
        btn.style.cursor = "pointer";
        btn.style.transform = "scale(1)";
        btn.style.boxShadow = "0 4px 15px rgba(0,0,0,0.5)";
    });

    btn.onclick = (e) => {
        if (dragged) { dragged = false; return; }
        e.preventDefault();
        e.stopPropagation();

        if (!initStores()) {
            btn.innerText = "Init Failed – Reload Discord";
            btn.style.background = "#ED4245";
            return;
        }

        if (activeSpoofs.size > 0) {
            if (poll) { clearInterval(poll); poll = null; }
            activeSpoofs.forEach(ctrl => ctrl.abort());
            activeSpoofs.clear();
            btn.innerText = "⚡ Spoof All Quests";
            btn.style.background = "#5865F2";
            btn.style.color = "white";
            return;
        }

        const quests = getEligibleQuests();

        if (quests.length === 0) {
            const origText = btn.innerText;
            const origBg = btn.style.background;
            btn.innerText = "⚠ Accept a quest first!";
            btn.style.background = "#ED4245";
            setTimeout(() => {
                btn.innerText = origText;
                btn.style.background = origBg;
            }, 2500);
            return;
        }

        quests.forEach((q: any, i: number) => {
            if (activeSpoofs.has(q.id)) return;
            const ghost = document.createElement("button") as HTMLButtonElement;
            ghost.dataset.mode = "spoof";
            setTimeout(() => completeQuest(q.id, ghost), i * 300);
        });

        btn.innerText = `⏹ Stop (${quests.length} quest${quests.length > 1 ? "s" : ""})`;
        btn.style.background = "#ED4245";

        if (poll) clearInterval(poll);
        poll = setInterval(() => {
            if (quests.every((q: any) => !activeSpoofs.has(q.id))) {
                clearInterval(poll!); poll = null;
                btn.innerText = "✅ All Done!";
                btn.style.background = "#57F287";
                btn.style.color = "black";
                setTimeout(() => {
                    btn.innerText = "⚡ Spoof All Quests";
                    btn.style.background = "#5865F2";
                    btn.style.color = "white";
                }, 3000);
            }
        }, 1000);
    };

    document.body.appendChild(btn);
    globalBtn = btn;
    console.log("[QC] ensureGlobalButton: button injected into body (fixed position)");
}

function injectButtons() {
    if (!initStores()) return;
    ensureGlobalButton();
}



function showUpdateBanner(remoteVersion: string, newContent: string, pluginPath: string) {
    const existing = document.getElementById("vencord-qc-update-banner");
    if (existing) return;

    const banner = document.createElement("div");
    banner.id = "vencord-qc-update-banner";
    banner.style.cssText = [
        "position:fixed",
        "top:16px",
        "left:50%",
        "transform:translateX(-50%)",
        "z-index:100000",
        "background:#23272a",
        "border:2px solid #57F287",
        "color:#fff",
        "border-radius:12px",
        "padding:14px 20px",
        "font-size:14px",
        "font-weight:600",
        "box-shadow:0 6px 30px rgba(0,0,0,0.6)",
        "display:flex",
        "gap:12px",
        "align-items:center",
        "cursor:default",
        "user-select:none",
        "font-family:sans-serif",
    ].join(";");


    let bDragging = false, bDX = 0, bDY = 0;
    banner.addEventListener("mousedown", (e) => {
        if ((e.target as HTMLElement).tagName === "BUTTON") return;
        bDragging = true;
        bDX = e.clientX - banner.getBoundingClientRect().left;
        bDY = e.clientY - banner.getBoundingClientRect().top;
        banner.style.transition = "none";
        banner.style.cursor = "grabbing";
        e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
        if (!bDragging) return;
        banner.style.left = Math.max(0, e.clientX - bDX) + "px";
        banner.style.top = Math.max(0, e.clientY - bDY) + "px";
        banner.style.transform = "none";
    });
    document.addEventListener("mouseup", () => {
        if (!bDragging) return;
        bDragging = false;
        banner.style.cursor = "default";
    });

    const icon = document.createElement("span");
    icon.innerText = "⬆️";
    icon.style.fontSize = "20px";

    const msg = document.createElement("span");
    msg.innerHTML = `<span style="color:#57F287">QuestCompleter</span> v${remoteVersion} is available! <span style="color:#aaa;font-size:12px">(current: v${PLUGIN_VERSION})</span>`;

    const updateBtn = document.createElement("button");
    updateBtn.innerText = "Update & Reload";
    updateBtn.style.cssText = "background:#57F287;color:#000;border:none;border-radius:7px;padding:7px 16px;cursor:pointer;font-weight:bold;font-size:13px;flex-shrink:0;";

    const dismissBtn = document.createElement("button");
    dismissBtn.innerText = "✕";
    dismissBtn.style.cssText = "background:transparent;border:none;color:#aaa;cursor:pointer;font-size:18px;padding:0 4px;flex-shrink:0;";
    dismissBtn.title = "Dismiss";

    updateBtn.onmouseenter = () => { updateBtn.style.filter = "brightness(1.15)"; };
    updateBtn.onmouseleave = () => { updateBtn.style.filter = "brightness(1)"; };

    updateBtn.onclick = async () => {
        updateBtn.innerText = "Updating...";
        updateBtn.disabled = true;
        try {

            const fs = (0, eval)("require")("fs");
            fs.writeFileSync(pluginPath, newContent, "utf-8");
            updateBtn.innerText = "✅ Done! Reload Discord";
            updateBtn.style.background = "#5865F2";
            updateBtn.style.color = "white";

            setTimeout(() => location.reload(), 2000);
        } catch (err) {
            console.error("[QC] Auto-update write failed:", err);
            updateBtn.innerText = "❌ Write failed – see console";
            updateBtn.style.background = "#ED4245";
            updateBtn.style.color = "white";
        }
    };

    dismissBtn.onclick = () => banner.remove();

    banner.append(icon, msg, updateBtn, dismissBtn);
    document.body.appendChild(banner);
    console.log("[QC] Update banner shown for v" + remoteVersion);
}

async function checkForUpdates() {
    try {
        console.log("[QC] Checking for updates... (current: v" + PLUGIN_VERSION + ")");
        const res = await fetch(UPDATE_URL + "?t=" + Date.now(), { cache: "no-store" });
        if (!res.ok) { console.warn("[QC] Update check failed: HTTP", res.status); return; }
        const text = await res.text();

        const match = text.match(/const PLUGIN_VERSION = "([^"]+)"/);
        if (!match) { console.warn("[QC] Could not parse remote version"); return; }
        const remoteVersion = match[1];

        if (remoteVersion === PLUGIN_VERSION) {
            console.log("[QC] Already up to date (v" + PLUGIN_VERSION + ")");
            return;
        }

        console.log(`[QC] Update found: v${PLUGIN_VERSION} -> v${remoteVersion}`);


        let pluginPath = "";
        try {
            const path = (0, eval)("require")("path");
            const os = (0, eval)("require")("os");
            const fs = (0, eval)("require")("fs");
            const candidates = [
                path.join(os.homedir(), "QuestCompleter", "index.tsx"),
                path.join(((window as any).process?.env?.APPDATA) ?? "", "Vencord", "src", "userplugins", "QuestCompleter", "index.tsx"),
                path.join(((window as any).process?.env?.APPDATA) ?? "", "Vencord", "userplugins", "QuestCompleter", "index.tsx"),
                path.join(os.homedir(), ".config", "Vencord", "src", "userplugins", "QuestCompleter", "index.tsx"),
            ];
            for (const c of candidates) {
                if (fs.existsSync(c)) { pluginPath = c; break; }
            }
            if (!pluginPath) console.warn("[QC] Plugin file path not found in known locations, banner will show but write may fail");
        } catch {
            console.warn("[QC] Could not resolve plugin path (no fs access?)");
        }

        showUpdateBanner(remoteVersion, text, pluginPath);
    } catch (e) {
        console.warn("[QC] Update check exception:", e);
    }
}

export default definePlugin({
    name: "QuestCompleter",
    description: "Adds a 'Spoof All Quests' button next to the orbs counter to automatically complete all accepted quests in priority order.",
    authors: [{ name: "AI dude", id: 1209031711242059847n }],

    start() {


        setTimeout(() => checkForUpdates(), 5000);

        injectButtons();
        setTimeout(() => injectButtons(), 500);
        setTimeout(() => injectButtons(), 1500);


        injectInterval = setInterval(() => ensureGlobalButton(), 1000);

        observer = new MutationObserver(() => ensureGlobalButton());
        observer.observe(document.body, { childList: true, subtree: false });
    },


    stop() {
        console.log("[QC] stop: plugin stopping");
        observer?.disconnect();
        observer = null;
        if (injectInterval) { clearInterval(injectInterval); injectInterval = null; }
        if (poll) { clearInterval(poll); poll = null; }
        globalBtn?.remove();
        globalBtn = null;
        document.querySelectorAll(".vencord-spoof-all-btn").forEach(b => b.remove());
        activeSpoofs.forEach(ctrl => ctrl.abort());
        activeSpoofs.clear();
        console.log("[QC] stop: cleared spoofs and removed button");

        initialized = false;
        ApplicationStreamingStore = undefined;
        RunningGameStore = undefined;
        QuestsStore = undefined;
        ChannelStore = undefined;
        GuildChannelStore = undefined;
        FluxDispatcher = undefined;
        api = undefined;
        console.log("[QC] stop: stores reset");
    }
});
