'use strict';

// Решает, когда и что отправлять в Discord.
// Discord ограничивает частоту обновлений, поэтому шлём только при смене трека,
// паузе/возобновлении, перемотке и «залипании» времени, а не каждую секунду.

const STALE_MS = 6000; // нет вестей от расширения дольше этого, значит ничего не играет
const DRIFT_MS = 2500; // на сколько должно разойтись время, чтобы считать это перемоткой
const MIN_SET_GAP_MS = 2000; // минимум между двумя обновлениями активности

function pad(s) {
    // Discord требует минимум 2 символа в строках details/state
    return s.length < 2 ? s + '⠀⠀' : s;
}

function short(s) {
    const chars = Array.from(s);
    return chars.length > 128 ? chars.slice(0, 125).join('') + '...' : s;
}

function buildActivity(want, config) {
    const s = want.state;
    const activity = {
        type: 2, // Listening: «Слушает»
        details: pad(short(s.title)),
        state: pad(short(s.artist)),
        startTimestamp: want.startTs,
        endTimestamp: want.endTs,
        instance: false,
    };

    if (s.artwork) activity.largeImageKey = s.artwork;

    // как в оригинальном soundcloud-rpc: в статусе показать исполнителя или название приложения
    const service = serviceName(s.url);
    if (config.statusDisplay === 'app') {
        activity.name = service;
        activity.statusDisplayType = 0;
    } else {
        activity.name = s.artist;
        activity.statusDisplayType = 1;
    }

    if (config.showButton && s.url) {
        activity.buttons = [{ label: `Listen on ${service}`, url: s.url }];
    }

    return activity;
}

// По ссылке на трек понимаем, какой это сервис (для подписи кнопки и названия в статусе).
function serviceName(url) {
    try {
        const host = new URL(url).hostname;
        if (host === 'vk.com' || host.endsWith('.vk.com') || host === 'vk.ru' || host.endsWith('.vk.ru')) return 'VK Music';
    } catch {
        // нет ссылки
    }
    return 'SoundCloud';
}

class Controller {
    constructor({ presence, config = {}, now = Date.now, log = () => {} }) {
        this.presence = presence;
        this.config = config;
        this.now = now;
        this.log = log;
        this.sources = new Map(); // последнее состояние от каждой вкладки: source → { ...state, receivedAt }
        this.activeKey = null; // вкладка, которую сейчас показываем
        this.sent = null; // что сейчас показано в Discord: { key, startTs }
        this.lastSetAt = 0;
        this.busy = false;
    }

    fresh(s) {
        return !!s && s.playing && this.now() - s.receivedAt <= STALE_MS;
    }

    /**
     * state: результат validateUpdate (не null).
     * Вкладок может быть несколько (например, SoundCloud и VK). Правило: пока текущая вкладка играет,
     * показываем её; если другая вкладка только что начала играть, переключаемся на неё.
     */
    update(state) {
        const now = this.now();
        const key = state.source || '';
        const prev = this.sources.get(key);
        this.sources.set(key, { ...state, receivedAt: now });

        for (const [k, s] of this.sources) {
            if (now - s.receivedAt > 60000) this.sources.delete(k); // закрытые вкладки
        }

        if (!state.playing) return;
        const active = this.sources.get(this.activeKey);
        const justStarted = !this.fresh(prev);
        if (!this.fresh(active) || (key !== this.activeKey && justStarted)) this.activeKey = key;
    }

    /** Discord переподключился, и старая активность пропала, значит надо отправить заново */
    forget() {
        this.sent = null;
    }

    pickActive() {
        let s = this.sources.get(this.activeKey);
        if (this.fresh(s)) return s;
        // текущая вкладка замолчала: берём любую другую играющую (самую свежую)
        s = null;
        for (const [k, c] of this.sources) {
            if (this.fresh(c) && (!s || c.receivedAt > s.receivedAt)) {
                s = c;
                this.activeKey = k;
            }
        }
        return s;
    }

    desired() {
        const s = this.pickActive();
        if (!s) return null;

        const startTs = s.receivedAt - Math.round(s.elapsed * 1000);
        return {
            key: `${s.url}|${s.artist}|${s.title}`,
            startTs,
            endTs: startTs + Math.round(s.duration * 1000),
            state: s,
        };
    }

    async tick() {
        if (this.busy) return;
        this.busy = true;
        try {
            const want = this.desired();

            if (!want) {
                if (this.sent) {
                    const ok = await this.presence.clearActivity();
                    if (ok) {
                        this.sent = null;
                        this.log('Ничего не играет: активность убрана');
                    }
                }
                return;
            }

            const cur = this.sent;
            const changed = !cur || cur.key !== want.key || Math.abs(cur.startTs - want.startTs) > DRIFT_MS;
            if (!changed) return;

            // не чаще раза в MIN_SET_GAP_MS меняем уже показанную активность
            if (cur && this.now() - this.lastSetAt < MIN_SET_GAP_MS) return;

            const ok = await this.presence.setActivity(buildActivity(want, this.config));
            if (ok) {
                this.sent = { key: want.key, startTs: want.startTs };
                this.lastSetAt = this.now();
                this.log(`Играет: ${want.state.artist} — ${want.state.title}`);
            }
        } finally {
            this.busy = false;
        }
    }
}

module.exports = { Controller, buildActivity, STALE_MS, DRIFT_MS, MIN_SET_GAP_MS };
