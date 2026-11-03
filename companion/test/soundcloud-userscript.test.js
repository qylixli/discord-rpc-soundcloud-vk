'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'userscripts', 'soundcloud.user.js'), 'utf8');

// Простая подставная «страница» с теми же селекторами, что на soundcloud.com.
// Это проверяет логику разбора, но не сами селекторы на живом сайте.
function fakeDoc({ playing = true, bg, label = 'My Song', artist = 'The Artist', elapsed = '1:05', duration = '3:20', href = 'https://soundcloud.com/the-artist/my-song?in=x' } = {}) {
    const els = {
        '.playControls__play': { classList: { contains: (c) => playing && c === 'playing' } },
        '.playbackSoundBadge__avatar .image__lightOutline span': {
            getAttribute: (n) => (n === 'aria-label' ? label : null),
            style: { backgroundImage: bg === undefined ? 'url("https://i1.sndcdn.com/artworks-abc-0-t50x50.jpg")' : bg },
        },
        '.playbackSoundBadge__lightLink': { textContent: ` ${artist} ` },
        '.playbackSoundBadge__titleLink': { href, getAttribute: () => null, textContent: label },
        '.playbackTimeline__timePassed span:last-child': { textContent: elapsed },
        '.playbackTimeline__duration span:last-child': { textContent: duration },
    };
    return { querySelector: (sel) => els[sel] || null };
}

function load(doc) {
    const posted = [];
    let tick = null;
    const ctx = {
        console,
        setInterval: (f) => {
            tick = f;
        },
        GM_xmlhttpRequest: (o) => posted.push(JSON.parse(o.data)),
        window: { addEventListener() {} },
        document: doc || fakeDoc(),
        Math,
        Number,
        String,
        Date,
    };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx);
    return { ctx, posted, tick: () => tick() };
}

test('parseTime', () => {
    const { parseTime } = load().ctx.SCRPC;
    assert.equal(parseTime('0:05'), 5);
    assert.equal(parseTime('3:07'), 187);
    assert.equal(parseTime(' 12:34 '), 754);
    assert.equal(parseTime('1:02:03'), 3723);
    assert.equal(parseTime('-2:10'), -130);
    for (const bad of ['', 'abc', '12', '1:2:3:4', null, undefined, 5, '1:xx']) {
        assert.equal(parseTime(bad), null, String(bad));
    }
});

test('играет: всё считывается, обложка увеличивается, источник и ссылка без параметров', () => {
    const r = load(fakeDoc());
    r.tick();
    assert.equal(r.posted.length, 1);
    const p = r.posted[0];
    assert.equal(p.playing, true);
    assert.equal(p.title, 'My Song');
    assert.equal(p.artist, 'The Artist');
    assert.equal(p.artwork, 'https://i1.sndcdn.com/artworks-abc-0-t500x500.jpg');
    assert.equal(p.url, 'https://soundcloud.com/the-artist/my-song');
    assert.equal(p.elapsed, 65);
    assert.equal(p.duration, 200);
    assert.ok(p.source);
});

test('пауза: статус не отправляется, а после воспроизведения уходит один playing:false', () => {
    let playing = true;
    const doc = fakeDoc();
    const orig = doc.querySelector;
    doc.querySelector = (sel) =>
        sel === '.playControls__play' ? { classList: { contains: (c) => playing && c === 'playing' } } : orig(sel);
    const r = load(doc);
    r.tick();
    playing = false;
    r.tick();
    r.tick();
    assert.deepEqual(r.posted.map((p) => p.playing), [true, false]);
});

test('«осталось» со знаком минус превращается в полную длительность', () => {
    const r = load(fakeDoc({ elapsed: '1:00', duration: '-2:30' }));
    r.tick();
    assert.equal(r.posted[0].duration, 210);
});

test('плеера ещё нет: ничего не отправляется', () => {
    const r = load({ querySelector: () => null });
    r.tick();
    assert.equal(r.posted.length, 0);
});

test('нет обложки: пустая строка', () => {
    const a = load(fakeDoc({ bg: '' }));
    a.tick();
    assert.equal(a.posted[0].artwork, '');
    const b = load(fakeDoc({ bg: 'none' }));
    b.tick();
    assert.equal(b.posted[0].artwork, '');
});
