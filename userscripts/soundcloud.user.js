// ==UserScript==
// @name         SoundCloud → Discord RPC
// @namespace    soundcloud-discord-rpc
// @version      1.0.0
// @description  Показывает в Discord, что вы слушаете на SoundCloud (через локальную программу на 127.0.0.1)
// @match        https://soundcloud.com/*
// @match        https://www.soundcloud.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

var SCRPC = (function () {
 var module = undefined;
 var root = {};
// Чтение состояния плеера SoundCloud со страницы.
// Селекторы взяты из soundcloud-rpc (audioMonitorService.ts), там они уже проверены на живом сайте.
// Файл работает и как content script (глобал SCRPC), и как модуль Node.js (для тестов).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SCRPC = factory();
    }
})(root, function () {
    'use strict';

    /** "1:23" -> 83, "1:02:03" -> 3723, "-2:10" -> -130, всё остальное -> null */
    function parseTime(text) {
        if (typeof text !== 'string') return null;
        var m = /^(-)?(\d{1,2}(?::\d{1,2}){1,2})$/.exec(text.trim());
        if (!m) return null;
        var seconds = 0;
        var parts = m[2].split(':');
        for (var i = 0; i < parts.length; i++) seconds = seconds * 60 + Number(parts[i]);
        return m[1] ? -seconds : seconds;
    }

    function text(el) {
        return el && el.textContent ? String(el.textContent).trim() : '';
    }

    /**
     * Возвращает { playing, title, artist, artwork, url, elapsed, duration } (время в секундах).
     * Если плеер на странице ещё не появился, поля пустые, а duration = 0.
     */
    function readPlayer(doc) {
        var playButton = doc.querySelector('.playControls__play');
        var artEl = doc.querySelector('.playbackSoundBadge__avatar .image__lightOutline span');
        var artistEl = doc.querySelector('.playbackSoundBadge__lightLink');
        var titleLink = doc.querySelector('.playbackSoundBadge__titleLink');
        var elapsedEl = doc.querySelector('.playbackTimeline__timePassed span:last-child');
        var durationEl = doc.querySelector('.playbackTimeline__duration span:last-child');

        var title =
            (artEl && artEl.getAttribute('aria-label')) ||
            (titleLink && titleLink.getAttribute('title')) ||
            text(titleLink) ||
            '';

        // обложка лежит в background-image; просим версию 500x500 вместо мелкой
        var bg = artEl && artEl.style ? artEl.style.backgroundImage : '';
        var m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(bg || '');
        var artwork = m ? m[1].replace(/-t\d+x\d+\./, '-t500x500.') : '';

        var url = titleLink && titleLink.href ? String(titleLink.href).split('?')[0] : '';

        var elapsedRaw = parseTime(text(elapsedEl));
        var elapsed = elapsedRaw === null ? 0 : Math.max(0, elapsedRaw);

        // в некоторых режимах SoundCloud показывает «осталось» со знаком минус
        var durationRaw = parseTime(text(durationEl));
        var duration = durationRaw === null ? 0 : durationRaw < 0 ? elapsed + Math.abs(durationRaw) : durationRaw;

        return {
            playing: !!playButton && playButton.classList.contains('playing'),
            title: String(title).trim(),
            artist: text(artistEl),
            artwork: artwork,
            url: url,
            elapsed: elapsed,
            duration: duration,
        };
    }

    return { parseTime: parseTime, readPlayer: readPlayer };
});

 return root.SCRPC;
})();

(function () {
    'use strict';
    var ENDPOINT = 'http://127.0.0.1:47612/update';
    var SOURCE = Math.random().toString(36).slice(2, 12);
    var wasPlaying = false;

    function send(payload) {
        payload.source = SOURCE;
        GM_xmlhttpRequest({
            method: 'POST',
            url: ENDPOINT,
            headers: { 'Content-Type': 'application/json', 'X-SCRPC': '1' },
            data: JSON.stringify(payload),
            onerror: function () {}, // программа не запущена — не страшно
        });
    }

    function tick() {
        var info = null;
        try { info = SCRPC.readPlayer(document); } catch (e) {}
        var playing = !!(info && info.playing && info.title && info.artist && info.duration > 0);
        if (playing) {
            wasPlaying = true;
            send({ playing: true, title: info.title, artist: info.artist, artwork: info.artwork,
                   url: info.url, elapsed: info.elapsed, duration: info.duration });
        } else if (wasPlaying) {
            wasPlaying = false;
            send({ playing: false });
        }
    }

    setInterval(tick, 1000);
    window.addEventListener('pagehide', function () {
        if (wasPlaying) { wasPlaying = false; send({ playing: false }); }
    });
})();
