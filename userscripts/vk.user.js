// ==UserScript==
// @name         VK Music → Discord RPC
// @namespace    soundcloud-discord-rpc
// @version      1.0.0
// @description  Показывает в Discord, что вы слушаете в VK Музыке (через локальную программу на 127.0.0.1)
// @match        https://vk.com/*
// @match        https://*.vk.com/*
// @match        https://vk.ru/*
// @match        https://*.vk.ru/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// ==/UserScript==

// Как это работает: у страницы VK есть свой аудиоплеер (объект getAudioPlayer()/ap). Он знает текущий
// трек (массив: [3] название, [4] исполнитель, [14] обложки, [5] длительность), играет ли он сейчас
// и на какой секунде. Скрипт раз в секунду спрашивает у него это и шлёт на 127.0.0.1 (вашу программу).
// Если что-то не работает, откройте консоль (F12 → Консоль) на vk.com и найдите строки "[VK→Discord]".

(function () {
    'use strict';

    var ENDPOINT = 'http://127.0.0.1:47612/update';
    var SOURCE = 'vk-' + Math.random().toString(36).slice(2, 10);
    var W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    var wasPlaying = false;
    var lastMode = '';
    var started = Date.now();
    var warnedNoPlayer = false;
    var timer = { key: '', played: 0, last: Date.now() }; // запасной подсчёт времени

    function log() {
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[VK→Discord]');
            console.info.apply(console, args);
        } catch (e) {}
    }

    function mode(name) {
        if (name !== lastMode) {
            lastMode = name;
            log(name);
        }
    }

    // VK отдаёт строки с HTML-сущностями (&amp; и т.п.)
    function decode(s) {
        if (typeof s !== 'string' || !s) return '';
        try {
            var t = document.createElement('textarea');
            t.innerHTML = s;
            return String(t.value).trim();
        } catch (e) {
            return s.trim();
        }
    }

    function getPlayer() {
        try {
            if (typeof W.getAudioPlayer === 'function') {
                var p = W.getAudioPlayer();
                if (p) return p;
            }
        } catch (e) {}
        try {
            if (W.ap) return W.ap;
        } catch (e) {}
        return null;
    }

    function currentAudio(p) {
        var a = null;
        try {
            if (typeof p.getCurrentAudio === 'function') a = p.getCurrentAudio();
        } catch (e) {}
        if (!a) {
            try {
                a = p._currentAudio;
            } catch (e) {}
        }
        return a && a.length > 4 ? a : null;
    }

    function isPlaying(p) {
        try {
            if (typeof p.isPlaying === 'function') return !!p.isPlaying();
        } catch (e) {}
        try {
            return !!p._isPlaying;
        } catch (e) {}
        return false;
    }

    function pickCover(a) {
        var raw = '';
        try {
            raw = typeof a[14] === 'string' ? a[14] : '';
        } catch (e) {}
        var list = raw.split(',').filter(function (u) {
            return u;
        });
        var url = list.length ? list[list.length - 1] : ''; // последняя — самая крупная
        if (url.indexOf('//') === 0) url = 'https:' + url;
        return /^https:\/\//.test(url) ? url : '';
    }

    function duration(a) {
        var d = Number(a[5]);
        if (d > 0) return d;
        try {
            var extra = a[15];
            if (extra && Number(extra.duration) > 0) return Number(extra.duration);
        } catch (e) {}
        return 0;
    }

    // Секунда, на которой сейчас трек. Сначала спрашиваем у плеера (доля 0..1), если не вышло, считаем сами.
    function elapsedSeconds(p, key, dur, playing) {
        var now = Date.now();
        if (key !== timer.key) timer = { key: key, played: 0, last: now };
        else if (playing) timer.played += Math.min(now - timer.last, 2000) / 1000;
        timer.last = now;

        var fraction = NaN;
        try {
            if (typeof p.getCurrentProgress === 'function') fraction = Number(p.getCurrentProgress());
        } catch (e) {}
        if (isFinite(fraction) && fraction >= 0 && fraction <= 1) {
            timer.played = fraction * dur; // подстраиваем запасной таймер под настоящее значение
            return { value: timer.played, how: 'player' };
        }

        if (timer.played > dur) timer.played = timer.played % dur; // трек зациклен
        return { value: timer.played, how: 'timer' };
    }

    function read() {
        var p = getPlayer();
        if (!p) {
            if (!warnedNoPlayer && Date.now() - started > 15000) {
                warnedNoPlayer = true;
                log('плеер VK на странице не найден (getAudioPlayer/ap). Откройте любую музыку и напишите об этом.');
            }
            return null;
        }
        var a = currentAudio(p);
        if (!a) return { playing: false };

        var playing = isPlaying(p);
        var title = decode(a[3]);
        var sub = '';
        try {
            sub = typeof a[16] === 'string' ? decode(a[16]) : '';
        } catch (e) {}
        if (sub) title += ' (' + sub + ')';
        var artist = decode(a[4]);
        var dur = duration(a);

        var owner = String(a[1]);
        var id = String(a[0]);
        var key = owner + '_' + id;
        var el = dur > 0 ? elapsedSeconds(p, key, dur, playing) : { value: 0, how: 'none' };

        return {
            playing: playing && !!title && !!artist && dur > 0,
            title: title,
            artist: artist,
            artwork: pickCover(a),
            url: /^-?\d+_\d+$/.test(key) ? 'https://vk.com/audio' + key : '',
            elapsed: Math.max(0, Math.min(el.value, dur)),
            duration: dur,
            how: el.how,
        };
    }

    function send(payload) {
        payload.source = SOURCE;
        try {
            GM_xmlhttpRequest({
                method: 'POST',
                url: ENDPOINT,
                headers: { 'Content-Type': 'application/json', 'X-SCRPC': '1' },
                data: JSON.stringify(payload),
                onerror: function () {}, // программа не запущена — не страшно
            });
        } catch (e) {}
    }

    function tick() {
        var info = null;
        try {
            info = read();
        } catch (e) {
            info = null;
        }

        if (info && info.playing) {
            wasPlaying = true;
            mode('играет (время: ' + (info.how === 'player' ? 'из плеера' : 'считаю сам') + ')');
            send({
                playing: true,
                title: info.title,
                artist: info.artist,
                artwork: info.artwork,
                url: info.url,
                elapsed: info.elapsed,
                duration: info.duration,
            });
        } else if (wasPlaying) {
            wasPlaying = false;
            mode('не играет');
            send({ playing: false });
        }
    }

    setInterval(tick, 1000);
    window.addEventListener('pagehide', function () {
        if (wasPlaying) {
            wasPlaying = false;
            send({ playing: false });
        }
    });
})();
