'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'userscripts', 'vk.user.js'), 'utf8');

// Запускаем скрипт на подставных «странице VK» и «плеере VK». Это проверяет нашу логику разбора,
// но не то, что настоящий плеер VK отвечает именно так (его на живом сайте я проверить не мог).
function run({ player, time = { t: 1_000_000 } } = {}) {
    const posted = [];
    let tick = null;
    const ctx = {
        console: { info() {} },
        Math,
        Number,
        String,
        Array,
        Date: { now: () => time.t },
        setInterval: (f) => {
            tick = f;
        },
        GM_xmlhttpRequest: (o) => posted.push(JSON.parse(o.data)),
        unsafeWindow: { getAudioPlayer: () => player },
        window: { addEventListener() {} },
        document: {
            createElement: () => {
                const el = {
                    set innerHTML(v) {
                        this.value = String(v).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&#39;/g, "'");
                    },
                };
                return el;
            },
        },
    };
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx);
    return { tick: () => tick(), posted, time };
}

const audio = (over = {}) => {
    const a = [];
    a[0] = '456789';
    a[1] = '-2001234';
    a[3] = 'Song &amp; Co';
    a[4] = 'Some Artist';
    a[5] = 215;
    a[14] = 'https://sun9-1.userapi.com/small.jpg,https://sun9-1.userapi.com/big.jpg';
    a[16] = '';
    Object.assign(a, over);
    return a;
};

test('играет: название, исполнитель, обложка (крупная), ссылка и время из плеера', () => {
    const player = { getCurrentAudio: () => audio(), isPlaying: () => true, getCurrentProgress: () => 0.5 };
    const r = run({ player });
    r.tick();
    assert.equal(r.posted.length, 1);
    const p = r.posted[0];
    assert.equal(p.playing, true);
    assert.equal(p.title, 'Song & Co');
    assert.equal(p.artist, 'Some Artist');
    assert.equal(p.artwork, 'https://sun9-1.userapi.com/big.jpg');
    assert.equal(p.url, 'https://vk.com/audio-2001234_456789');
    assert.equal(p.duration, 215);
    assert.equal(p.elapsed, 107.5);
    assert.match(p.source, /^vk-/);
});

test('подзаголовок (ремикс) добавляется к названию', () => {
    const player = { getCurrentAudio: () => audio({ 16: 'Remix' }), isPlaying: () => true, getCurrentProgress: () => 0 };
    const r = run({ player });
    r.tick();
    assert.equal(r.posted[0].title, 'Song & Co (Remix)');
});

test('нет getCurrentProgress: время считается самим скриптом и стоит на паузе', () => {
    let playing = true;
    const player = { _currentAudio: audio(), _isPlaying: true };
    Object.defineProperty(player, '_isPlaying', { get: () => playing });
    const time = { t: 1_000_000 };
    const r = run({ player, time });

    r.tick(); // 0 c
    time.t += 1000;
    r.tick(); // 1 c
    time.t += 1000;
    r.tick(); // 2 c
    assert.equal(r.posted.length, 3);
    assert.equal(r.posted[0].elapsed, 0);
    assert.equal(Math.round(r.posted[2].elapsed), 2);

    playing = false;
    time.t += 1000;
    r.tick();
    assert.deepEqual(r.posted[3].playing, false);

    playing = true;
    time.t += 5000; // пауза длилась 5 секунд — они не должны попасть в прогресс
    r.tick();
    assert.ok(r.posted[4].elapsed <= 5, String(r.posted[4].elapsed));
});

test('пауза и «ничего не выбрано»: playing:false отправляется один раз', () => {
    let playing = true;
    const player = { getCurrentAudio: () => audio(), isPlaying: () => playing, getCurrentProgress: () => 0.1 };
    const r = run({ player });
    r.tick();
    playing = false;
    r.tick();
    r.tick();
    r.tick();
    assert.deepEqual(r.posted.map((p) => p.playing), [true, false]);
});

test('плеера на странице нет: ничего не отправляется и ничего не падает', () => {
    const r = run({ player: null });
    r.tick();
    r.tick();
    assert.equal(r.posted.length, 0);
});

test('плеер есть, но трек не выбран: тишина', () => {
    const r = run({ player: { getCurrentAudio: () => null, _currentAudio: null, isPlaying: () => false } });
    r.tick();
    assert.equal(r.posted.length, 0);
});

test('мусорные данные плеера не ломают скрипт', () => {
    const bad = { getCurrentAudio: () => ['x'], isPlaying: () => true };
    const r = run({ player: bad });
    r.tick();
    assert.equal(r.posted.length, 0);

    const noDur = { getCurrentAudio: () => audio({ 5: 0 }), isPlaying: () => true };
    const r2 = run({ player: noDur });
    r2.tick();
    assert.equal(r2.posted.length, 0, 'без длительности статус не показываем');

    const weirdKey = { getCurrentAudio: () => audio({ 0: 'abc' }), isPlaying: () => true, getCurrentProgress: () => 0 };
    const r3 = run({ player: weirdKey });
    r3.tick();
    assert.equal(r3.posted[0].url, '');
});
