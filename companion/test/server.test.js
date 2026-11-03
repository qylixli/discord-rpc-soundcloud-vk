'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../server');

async function start() {
    const updates = [];
    let ticks = 0;
    const controller = {
        update: (s) => updates.push(s),
        tick: async () => {
            ticks++;
        },
    };
    const server = createServer({ controller });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    return { server, port, updates, ticks: () => ticks };
}

function request(port, { method = 'POST', path = '/update', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
        const req = http.request(
            { host: '127.0.0.1', port, method, path, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers } },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
            },
        );
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

const payload = {
    playing: true,
    title: 'Song',
    artist: 'Artist',
    artwork: 'https://i1.sndcdn.com/a.jpg',
    url: 'https://soundcloud.com/a/b',
    elapsed: 3,
    duration: 100,
};

test('запрос от расширения принимается и попадает в контроллер', async () => {
    const s = await start();
    try {
        const r = await request(s.port, { headers: { Origin: 'moz-extension://abc-123' }, body: payload });
        assert.equal(r.status, 204);
        assert.equal(r.headers['access-control-allow-origin'], 'moz-extension://abc-123');
        assert.equal(s.updates.length, 1);
        assert.equal(s.updates[0].title, 'Song');
        assert.equal(s.ticks(), 1);
    } finally {
        s.server.close();
    }
});

test('запрос без Origin (например, curl) принимается', async () => {
    const s = await start();
    try {
        const r = await request(s.port, { body: { playing: false } });
        assert.equal(r.status, 204);
        assert.deepEqual(s.updates, [{ playing: false, source: '' }]);
    } finally {
        s.server.close();
    }
});

test('запрос со страницы сайта (чужой Origin) отклоняется', async () => {
    const s = await start();
    try {
        for (const origin of ['https://evil.example', 'https://soundcloud.com.evil.example', 'null']) {
            const r = await request(s.port, { headers: { Origin: origin }, body: payload });
            assert.equal(r.status, 403, origin);
        }
        assert.equal(s.updates.length, 0);
    } finally {
        s.server.close();
    }
});

test('неверный Host (DNS rebinding) отклоняется', async () => {
    const s = await start();
    try {
        const r = await request(s.port, { headers: { Host: 'evil.example' }, body: payload });
        assert.equal(r.status, 403);
        assert.equal(s.updates.length, 0);
    } finally {
        s.server.close();
    }
});

test('плохой JSON, плохие данные, слишком большое тело', async () => {
    const s = await start();
    try {
        assert.equal((await request(s.port, { body: '{oops' })).status, 400);
        assert.equal((await request(s.port, { body: { playing: true, title: '' } })).status, 400);

        const big = await request(s.port, { body: JSON.stringify({ playing: true, title: 'x'.repeat(20000) }) }).catch((e) => e);
        // сервер отвечает 413 и закрывает соединение; клиент может увидеть либо 413, либо обрыв
        assert.ok(big.status === 413 || big.code === 'ECONNRESET' || big.code === 'EPIPE', String(big.status || big.code));
        assert.equal(s.updates.length, 0);
    } finally {
        s.server.close();
    }
});

test('/health, preflight и неизвестные пути', async () => {
    const s = await start();
    try {
        assert.equal((await request(s.port, { method: 'GET', path: '/health' })).status, 200);
        const pre = await request(s.port, { method: 'OPTIONS', headers: { Origin: 'moz-extension://x' } });
        assert.equal(pre.status, 204);
        assert.equal((await request(s.port, { method: 'GET', path: '/nope' })).status, 404);
        assert.equal((await request(s.port, { method: 'GET', path: '/update' })).status, 404);
    } finally {
        s.server.close();
    }
});

test('юзерскрипт со страницы SoundCloud: только с заголовком X-SCRPC', async () => {
    const s = await start();
    try {
        const no = await request(s.port, { headers: { Origin: 'https://soundcloud.com' }, body: payload });
        assert.equal(no.status, 403);
        const yes = await request(s.port, { headers: { Origin: 'https://soundcloud.com', 'X-SCRPC': '1' }, body: payload });
        assert.equal(yes.status, 204);
        assert.equal(s.updates.length, 1);
    } finally {
        s.server.close();
    }
});

test('юзерскрипт со страницы VK и поддоменов принимается, похожие домены нет', async () => {
    const s = await start();
    try {
        for (const origin of ['https://vk.com', 'https://m.vk.com', 'https://vk.ru', 'https://music.vk.com']) {
            const r = await request(s.port, { headers: { Origin: origin, 'X-SCRPC': '1' }, body: payload });
            assert.equal(r.status, 204, origin);
        }
        for (const origin of ['https://vk.com.evil.example', 'https://evilvk.com', 'http://vk.com']) {
            const r = await request(s.port, { headers: { Origin: origin, 'X-SCRPC': '1' }, body: payload });
            assert.equal(r.status, 403, origin);
        }
    } finally {
        s.server.close();
    }
});
