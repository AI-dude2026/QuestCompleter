// @ts-ignore
import definePlugin from "@utils/types";

const SUPPORTED_TASKS = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"];

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
    if (initialized) return true;

    try {
        const wpRequire = (window as any).webpackChunkdiscord_app.push([[Symbol()], {}, (r: any) => r]);
        (window as any).webpackChunkdiscord_app.pop();
        const mods = Object.values(wpRequire.c) as any[];

        ApplicationStreamingStore = mods.find(x =>
            x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata
        )?.exports?.Z;

        if (!ApplicationStreamingStore) {
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
            RunningGameStore = mods.find(x => x?.exports?.ZP?.getRunningGames)?.exports?.ZP;
            QuestsStore = mods.find(x => x?.exports?.Z?.__proto__?.getQuest)?.exports?.Z;
            ChannelStore = mods.find(x => x?.exports?.Z?.__proto__?.getAllThreadsForParent)?.exports?.Z;
            GuildChannelStore = mods.find(x => x?.exports?.ZP?.getSFWDefaultChannel)?.exports?.ZP;
            FluxDispatcher = mods.find(x => x?.exports?.Z?.__proto__?.flushWaitQueue)?.exports?.Z;
            api = mods.find(x => x?.exports?.tn?.get)?.exports?.tn;
        }

        if (!QuestsStore || !FluxDispatcher || !api) {
            console.error("Failed to find required stores");
            return false;
        }

        isApp = typeof (window as any).DiscordNative !== "undefined";
        initialized = true;
        console.log("Stores initialized, isApp =", isApp);
        return true;
    } catch (e) {
        console.error("Init failed:", e);
        return false;
    }
}

function completeQuest(questId: string, btn: HTMLButtonElement) {
    if (!initStores()) {
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
        console.warn("Quest not found or uncompletable", questId);
        btn.innerText = "Error: Not Completable";
        btn.style.backgroundColor = "#ED4245";
        return;
    }

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
let isInjecting = false;

function injectButtons() {
    if (isInjecting) return;
    isInjecting = true;
    setTimeout(() => { isInjecting = false; }, 2000);

    if (!initStores()) return;
    if (!QuestsStore?.quests) return;

    const quests = [...QuestsStore.quests.values()].filter((x: any) =>
        x.userStatus?.enrolledAt &&
        !x.userStatus?.completedAt &&
        new Date(x.config.expiresAt).getTime() > Date.now() &&
        SUPPORTED_TASKS.some((y: string) => Object.keys(getTaskConfig(x).tasks).includes(y))
    );

    if (quests.length === 0) return;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    const questNames = quests.map((q: any) => q.config.messages.questName);
    const alreadyInjected = new Set<string>();

    while ((node = walker.nextNode())) {
        const text = node.textContent?.trim();
        if (text && questNames.includes(text)) {
            const matchedQuest = quests.find((q: any) => q.config.messages.questName === text);
            if (!matchedQuest) continue;
            if (alreadyInjected.has(matchedQuest.id)) continue;

            const parentElement = node.parentElement;
            if (!parentElement) continue;

            let container: HTMLElement | null = parentElement;
            let found = false;
            for (let i = 0; i < 15; i++) {
                if (!container) break;
                if (container.querySelector(".vencord-spoof-quest-btn")) {
                    found = true;
                    break;
                }
                container = container.parentElement as HTMLElement | null;
            }
            if (found) { alreadyInjected.add(matchedQuest.id); continue; }

            let widthAncestor: HTMLElement | null = parentElement;
            for (let i = 0; i < 8; i++) {
                if (!widthAncestor || widthAncestor === document.body) break;
                if (widthAncestor.offsetWidth > 400) break;
                widthAncestor = widthAncestor.parentElement;
            }
            if (!widthAncestor || widthAncestor.offsetWidth <= 400 || widthAncestor === document.body) continue;

            const btn = document.createElement("button");
            btn.className = "vencord-spoof-quest-btn";
            btn.innerText = "Spoof";
            btn.title = `Spoof: ${text}`;
            btn.dataset.mode = "spoof";
            btn.dataset.questId = matchedQuest.id;

            btn.style.cssText = [
                "background:#5865F2",
                "color:white",
                "border:none",
                "border-radius:4px",
                "padding:6px 16px",
                "cursor:pointer",
                "font-weight:bold",
                "font-size:13px",
                "position:absolute",
                "top:12px",
                "right:12px",
                "z-index:9999",
                "pointer-events:all",
                "transition:background 0.2s ease",
            ].join(";");

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (btn.dataset.mode === "stop") {
                    const ctrl = activeSpoofs.get(matchedQuest.id);
                    if (ctrl) ctrl.abort();
                    return;
                }

                if (activeSpoofs.has(matchedQuest.id)) return;

                btn.innerText = "...";
                btn.style.background = "#FEE75C";
                btn.style.color = "black";
                btn.dataset.mode = "running";
                completeQuest(matchedQuest.id, btn);
            };

            widthAncestor.style.position = "relative";
            widthAncestor.appendChild(btn);
            alreadyInjected.add(matchedQuest.id);
        }
    }
}

let injectInterval: ReturnType<typeof setInterval> | null = null;

export default definePlugin({
    name: "QuestCompleter",
    description: "Adds a 'Spoof' button to incomplete quests in the Quests tab to automatically fake the game, stream or video requirements using a background process.",
    authors: [{ name: "ai_dude_3249", id: 1209031711242059847n }],


    start() {
        console.log("Starting QuestCompleter plugin...");

        observer = new MutationObserver(() => {

            injectButtons();
        });

        observer.observe(document.body, { childList: true, subtree: true });

        injectInterval = setInterval(() => injectButtons(), 3000);

        setTimeout(() => injectButtons(), 2000);
    },

    stop() {
        console.log("Stopping QuestCompleter plugin...");
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (injectInterval) {
            clearInterval(injectInterval);
            injectInterval = null;
        }

        const existingBtns = document.querySelectorAll(".vencord-spoof-quest-btn");
        existingBtns.forEach(btn => btn.remove());


        activeSpoofs.forEach(ctrl => ctrl.abort());
        activeSpoofs.clear();
    }
});
