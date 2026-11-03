'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateUpdate, cleanString, cleanHttpsUrl } = require('../validate');

const good = {
    playing: true,
    title: 'Song',
    artist: 'Artist',
    artwork: 'https://i1.sndcdn.com/artworks-abc-0-t500x500.jpg',
    url: 'https://soundcloud.com/artist/song',
    elapsed: 12,
    duration: 200,
};

test('корректные данные проходят', () => {
    assert.deepEqual(validateUpdate(good), { ...good, source: '' });
});

test('playing:false → просто «ничего не играет»', () => {
    assert.deepEqual(validateUpdate({ playing: false, title: 'x' }), { playing: false, source: '' });
});

test('мусор отклоняется', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { playing: 'yes' }]) {
        assert.equal(validateUpdate(bad), null);
    }
});

test('нужны название, артист и длительность > 0', () => {
    assert.equal(validateUpdate({ ...good, title: '' }), null);
    assert.equal(validateUpdate({ ...good, artist: '   ' }), null);
    assert.equal(validateUpdate({ ...good, duration: 0 }), null);
    assert.equal(validateUpdate({ ...good, duration: -5 }), null);
    assert.equal(validateUpdate({ ...good, duration: '200' }), null);
    assert.equal(validateUpdate({ ...good, duration: 999999 }), null);
    assert.equal(validateUpdate({ ...good, duration: Infinity }), null);
});

test('elapsed ограничивается диапазоном 0..duration', () => {
    assert.equal(validateUpdate({ ...good, elapsed: -10 }).elapsed, 0);
    assert.equal(validateUpdate({ ...good, elapsed: 5000 }).elapsed, 200);
    assert.equal(validateUpdate({ ...good, elapsed: 'abc' }).elapsed, 0);
    assert.equal(validateUpdate({ ...good, elapsed: NaN }).elapsed, 0);
});

test('управляющие символы вычищаются, длина ограничивается', () => {
    assert.equal(cleanString('a\u0000b\u0007c\n', 50), 'abc');
    assert.equal(cleanString('x'.repeat(500), 300).length, 300);
    assert.equal(cleanString(42, 10), '');
});

test('обложка только https и только sndcdn.com, иначе пусто', () => {
    assert.equal(validateUpdate({ ...good, artwork: 'http://i1.sndcdn.com/a.jpg' }).artwork, '');
    assert.equal(validateUpdate({ ...good, artwork: 'https://evil.example/a.jpg' }).artwork, '');
    assert.equal(validateUpdate({ ...good, artwork: 'https://sndcdn.com.evil.example/a.jpg' }).artwork, '');
    assert.equal(validateUpdate({ ...good, artwork: 'https://user:pw@i1.sndcdn.com/a.jpg' }).artwork, '');
    assert.equal(validateUpdate({ ...good, artwork: 'javascript:alert(1)' }).artwork, '');
});

test('ссылка на трек только https и soundcloud.com', () => {
    assert.equal(validateUpdate({ ...good, url: 'https://evil.example/x' }).url, '');
    assert.equal(validateUpdate({ ...good, url: 'https://notsoundcloud.com/x' }).url, '');
    assert.equal(cleanHttpsUrl('https://www.soundcloud.com/a/b', 'soundcloud.com'), 'https://www.soundcloud.com/a/b');
});

test('VK: ссылка на трек и обложки с доменов VK проходят, чужие нет', () => {
    const vk = {
        ...good,
        url: 'https://vk.com/audio-2001234_456789',
        artwork: 'https://sun9-12.userapi.com/impg/abc/cover.jpg',
    };
    const r = validateUpdate(vk);
    assert.equal(r.url, 'https://vk.com/audio-2001234_456789');
    assert.equal(r.artwork, 'https://sun9-12.userapi.com/impg/abc/cover.jpg');
    assert.equal(validateUpdate({ ...vk, url: 'https://vk.com.evil.example/a' }).url, '');
    assert.equal(validateUpdate({ ...vk, artwork: 'https://userapi.com.evil.example/a.jpg' }).artwork, '');
    assert.equal(validateUpdate({ ...vk, artwork: 'http://sun9-12.userapi.com/a.jpg' }).artwork, '');
});
