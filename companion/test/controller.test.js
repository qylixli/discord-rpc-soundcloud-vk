'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Controller, buildActivity, STALE_MS, MIN_SET_GAP_MS } = require('../controller');

function setup(config = {}) {
    const clock = { t: 1_000_000 };
    const calls = [];
    const presence = {
        ok: true,
        async setActivity(a) {
            calls.push(['set', a]);
            return this.ok;
        },
        async clearActivity() {
            calls.push(['clear']);
            return true;
        },
    };
    const c = new Controller({ presence, config, now: () => clock.t });
    return { c, clock, calls, presence };
}

const track = (over = {}) => ({
    playing: true,
    title: 'Song',
    artist: 'Artist',
    artwork: 'https://i1.sndcdn.com/a-t500x500.jpg',
    url: 'https://soundcloud.com/artist/song',
    elapsed: 10,
    duration: 200,
    ...over,
});

test('пока ничего не играло, в Discord ничего не уходит', async () => {
    const { c, calls } = setup();
    await c.tick();
    assert.equal(calls.length, 0);
});

test('играет: Listening, трек/артист/обложка и таймстемпы (прогресс «время / конец»)', async () => {
    const { c, clock, calls } = setup();
    c.update(track());
    await c.tick();

    assert.equal(calls.length, 1);
    const a = calls[0][1];
    assert.equal(a.type, 2);
    assert.equal(a.details, 'Song');
    assert.equal(a.state, 'Artist');
    assert.equal(a.largeImageKey, 'https://i1.sndcdn.com/a-t500x500.jpg');
    assert.equal(a.startTimestamp, clock.t - 10_000);
    assert.equal(a.endTimestamp, clock.t - 10_000 + 200_000);
});

test('обычный ход времени не вызывает лишних обновлений', async () => {
    const { c, clock, calls } = setup();
    c.update(track());
    await c.tick();
    for (let i = 1; i <= 30; i++) {
        clock.t += 1000;
        c.update(track({ elapsed: 10 + i }));
        await c.tick();
    }
    assert.equal(calls.length, 1);
});

test('перемотка вперёд обновляет прогресс (не раньше минимального интервала)', async () => {
    const { c, clock, calls } = setup();
    c.update(track());
    await c.tick();

    clock.t += 1000;
    c.update(track({ elapsed: 120 })); // прыжок на ~100 с
    await c.tick();
    assert.equal(calls.length, 1, 'слишком рано, ждём интервал');

    clock.t += MIN_SET_GAP_MS;
    c.update(track({ elapsed: 123 }));
    await c.tick();
    assert.equal(calls.length, 2);
    assert.equal(calls[1][1].startTimestamp, clock.t - 123_000);
});

test('смена трека обновляет активность, быстрая смена ждёт интервал', async () => {
    const { c, clock, calls } = setup();
    c.update(track());
    await c.tick();

    clock.t += 500;
    c.update(track({ title: 'Other', url: 'https://soundcloud.com/artist/other', elapsed: 0 }));
    await c.tick();
    assert.equal(calls.length, 1);

    clock.t += MIN_SET_GAP_MS;
    c.update(track({ title: 'Other', url: 'https://soundcloud.com/artist/other', elapsed: 2 }));
    await c.tick();
    assert.equal(calls.length, 2);
    assert.equal(calls[1][1].details, 'Other');
});

test('пауза: активность убирается один раз', async () => {
    const { c, clock, calls } = setup();
    c.update(track());
    await c.tick();

    clock.t += 1000;
    c.update({ playing: false });
    await c.tick();
    await c.tick();
    await c.tick();

    assert.deepEqual(calls.map((x) => x[0]), ['set', 'clear']);
});

test('после паузы возобновление снова показывает активность сразу', async () => {
    const { c, clock, calls } = setup();
    c.update(track());
    await c.tick();
    clock.t += 500;
    c.update({ playing: false });
    await c.tick();

    clock.t += 500;
    c.update(track({ elapsed: 15 }));
    await c.tick();
    assert.deepEqual(calls.map((x) => x[0]), ['set', 'clear', 'set']);
});

test('расширение замолчало (закрыли Firefox / вкладку): активность убирается', async () => {
    const { c, clock, calls } = setup();
    c.update(track());
    await c.tick();

    clock.t += STALE_MS + 1000;
    await c.tick();
    assert.deepEqual(calls.map((x) => x[0]), ['set', 'clear']);
});

test('если Discord недоступен, отправка повторяется на следующем тике', async () => {
    const { c, calls, presence } = setup();
    presence.ok = false;
    c.update(track());
    await c.tick();
    await c.tick();
    assert.equal(calls.length, 2);

    presence.ok = true;
    await c.tick();
    assert.equal(calls.length, 3);
    await c.tick();
    assert.equal(calls.length, 3, 'после успеха больше не шлём');
});

test('после переподключения Discord активность отправляется заново', async () => {
    const { c, calls } = setup();
    c.update(track());
    await c.tick();
    c.forget();
    await c.tick();
    assert.equal(calls.length, 2);
});

test('параметры: исполнитель/приложение в статусе и кнопка', () => {
    const want = {
        startTs: 1000,
        endTs: 2000,
        state: { title: 'T', artist: 'A', artwork: '', url: 'https://soundcloud.com/a/t' },
    };

    const artist = buildActivity(want, { statusDisplay: 'artist', showButton: false });
    assert.equal(artist.name, 'A');
    assert.equal(artist.statusDisplayType, 1);
    assert.equal('buttons' in artist, false);
    assert.equal('largeImageKey' in artist, false);

    const app = buildActivity(want, { statusDisplay: 'app', showButton: true });
    assert.equal(app.name, 'SoundCloud');
    assert.equal(app.statusDisplayType, 0);
    assert.deepEqual(app.buttons, [{ label: 'Listen on SoundCloud', url: 'https://soundcloud.com/a/t' }]);
});

test('короткие и длинные строки приводятся к требованиям Discord', () => {
    const want = {
        startTs: 1,
        endTs: 2,
        state: { title: 'x', artist: 'y'.repeat(300), artwork: '', url: '' },
    };
    const a = buildActivity(want, {});
    assert.ok(a.details.length >= 2);
    assert.ok(Array.from(a.state).length <= 128);
});

test('пауза от другой вкладки не гасит играющую', async () => {
    const { c, calls } = setup();
    c.update(track({ source: 'A' }));
    await c.tick();
    c.update({ playing: false, source: 'B' });
    await c.tick();
    assert.deepEqual(calls.map((x) => x[0]), ['set']);
    c.update({ playing: false, source: 'A' });
    await c.tick();
    assert.deepEqual(calls.map((x) => x[0]), ['set', 'clear']);
});

test('два сервиса: играющий не перебивается, новый запуск переключает, пауза возвращает первый', async () => {
    const { c, clock, calls } = setup();
    const sc = (over = {}) => track({ source: 'SC', ...over });
    const vk = (over = {}) =>
        track({ source: 'VK', title: 'VK song', artist: 'VK artist', url: 'https://vk.com/audio1_2', ...over });

    // играет SoundCloud
    c.update(sc());
    await c.tick();
    assert.equal(calls.length, 1);

    // VK молчит (пауза) — ничего не меняется
    clock.t += 1000;
    c.update(sc({ elapsed: 11 }));
    c.update({ playing: false, source: 'VK' });
    await c.tick();
    assert.equal(calls.length, 1);

    // пользователь запустил VK, и показываем VK
    clock.t += MIN_SET_GAP_MS;
    c.update(sc({ elapsed: 13 }));
    c.update(vk({ elapsed: 0 }));
    await c.tick();
    assert.equal(calls.length, 2);
    assert.equal(calls[1][1].details, 'VK song');

    // оба продолжают слать данные каждую секунду — переключений туда-сюда нет
    for (let i = 1; i <= 10; i++) {
        clock.t += 1000;
        c.update(sc({ elapsed: 13 + i }));
        c.update(vk({ elapsed: i }));
        await c.tick();
    }
    assert.equal(calls.length, 2);

    // VK поставили на паузу — возвращаемся к играющему SoundCloud
    clock.t += MIN_SET_GAP_MS;
    c.update(sc({ elapsed: 30 }));
    c.update({ playing: false, source: 'VK' });
    await c.tick();
    assert.equal(calls.length, 3);
    assert.equal(calls[2][1].details, 'Song');

    // и SoundCloud тоже остановили — статус убирается
    clock.t += 1000;
    c.update({ playing: false, source: 'SC' });
    await c.tick();
    assert.equal(calls[3][0], 'clear');
});

test('подпись кнопки и название в статусе зависят от сервиса', () => {
    const base = { startTs: 1, endTs: 2 };
    const vk = { ...base, state: { title: 'T', artist: 'A', artwork: '', url: 'https://vk.com/audio1_2' } };
    const b = buildActivity(vk, { statusDisplay: 'app', showButton: true });
    assert.equal(b.name, 'VK Music');
    assert.deepEqual(b.buttons, [{ label: 'Listen on VK Music', url: 'https://vk.com/audio1_2' }]);
});
