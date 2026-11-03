'use strict';

// Всё, что приходит от расширения, считается недоверенным и проходит проверку здесь.

const MAX_BODY = 8 * 1024;

function cleanString(value, max) {
    if (typeof value !== 'string') return '';
    return Array.from(value)
        .filter((ch) => {
            const c = ch.codePointAt(0);
            return c >= 32 && c !== 127 && !(c >= 0x80 && c <= 0x9f);
        })
        .slice(0, max)
        .join('')
        .trim();
}

// Разрешённые сайты: ссылки на трек и обложки принимаются только отсюда.
const TRACK_HOSTS = ['soundcloud.com', 'vk.com', 'vk.ru'];
const ARTWORK_HOSTS = [
    'sndcdn.com', // SoundCloud
    'userapi.com', 'vk.com', 'vk.ru', 'vk-cdn.net', 'vkuserphotos.com', 'mycdn.me', 'vkuseraudio.net', // VK
];

function hostMatches(hostname, base) {
    return hostname === base || hostname.endsWith('.' + base);
}

function cleanHttpsUrl(value, baseHosts) {
    const hosts = Array.isArray(baseHosts) ? baseHosts : [baseHosts];
    const raw = cleanString(value, 2048);
    if (!raw) return '';
    try {
        const url = new URL(raw);
        if (url.protocol !== 'https:') return '';
        if (url.username || url.password) return '';
        if (!hosts.some((h) => hostMatches(url.hostname, h))) return '';
        return url.toString();
    } catch {
        return '';
    }
}

/**
 * Возвращает:
 *   null                          — данные некорректны
 *   { playing: false }            — ничего не играет
 *   { playing: true, title, artist, artwork, url, elapsed, duration }  (время в секундах)
 */
function validateUpdate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

    const source = cleanString(body.source, 40);

    if (body.playing === false) return { playing: false, source };
    if (body.playing !== true) return null;

    const title = cleanString(body.title, 300);
    const artist = cleanString(body.artist, 200);
    if (!title || !artist) return null;

    const duration = body.duration;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 86400) return null;

    let elapsed = body.elapsed;
    if (typeof elapsed !== 'number' || !Number.isFinite(elapsed)) elapsed = 0;
    elapsed = Math.min(Math.max(elapsed, 0), duration);

    return {
        playing: true,
        source,
        title,
        artist,
        artwork: cleanHttpsUrl(body.artwork, ARTWORK_HOSTS),
        url: cleanHttpsUrl(body.url, TRACK_HOSTS),
        elapsed,
        duration,
    };
}

module.exports = { MAX_BODY, cleanString, cleanHttpsUrl, validateUpdate };
