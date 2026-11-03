'use strict';

const http = require('node:http');
const { MAX_BODY, validateUpdate } = require('./validate');

// Локальный HTTP-сервер для userscript-ов. Слушать нужно только 127.0.0.1 (это делает index.js).
// Защита от чужих сайтов в браузере:
//  - заголовок Host должен быть 127.0.0.1:порт или localhost:порт (против DNS rebinding);
//  - если есть Origin, он должен быть moz-extension://... (страница сайта не может подделать Origin).

function createServer({ controller, log = () => {} }) {
    const server = http.createServer((req, res) => {
        const reply = (code, body, extra = {}) => {
            const payload = body === undefined ? '' : JSON.stringify(body);
            res.writeHead(code, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
                ...extra,
            });
            res.end(payload);
        };

        const address = server.address();
        const port = address && typeof address === 'object' ? address.port : 0;
        const host = req.headers.host;
        if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return reply(403, { error: 'bad host' });

        const origin = req.headers.origin;
        // свои: расширение (moz-extension://), либо юзерскрипт Tampermonkey со страницы SoundCloud или VK
        // с собственным заголовком (чужой сайт не может его выставить без разрешённого preflight)
        const isExt = origin === undefined || /^moz-extension:\/\//.test(origin);
        const isScript = typeof origin === 'string' && /^https:\/\/([a-z0-9-]+\.)*(soundcloud\.com|vk\.com|vk\.ru)$/.test(origin);
        if (!isExt && !isScript) return reply(403, { error: 'bad origin' });
        if (isScript && req.method !== 'OPTIONS' && req.headers['x-scrpc'] !== '1') return reply(403, { error: 'bad origin' });

        const cors = origin
            ? {
                  'Access-Control-Allow-Origin': origin,
                  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                  'Access-Control-Allow-Headers': 'content-type, x-scrpc',
                  Vary: 'Origin',
              }
            : {};

        if (req.method === 'OPTIONS') return reply(204, undefined, cors);
        if (req.method === 'GET' && req.url === '/health') return reply(200, { ok: true }, cors);
        if (!(req.method === 'POST' && req.url === '/update')) return reply(404, { error: 'not found' }, cors);

        let size = 0;
        let tooBig = false;
        const chunks = [];
        req.on('data', (chunk) => {
            if (tooBig) return;
            size += chunk.length;
            if (size > MAX_BODY) {
                tooBig = true;
                reply(413, { error: 'too large' }, { ...cors, Connection: 'close' });
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (tooBig) return;
            let parsed;
            try {
                parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
                return reply(400, { error: 'bad json' }, cors);
            }
            const state = validateUpdate(parsed);
            if (!state) return reply(400, { error: 'bad payload' }, cors);

            controller.update(state);
            controller.tick().catch((e) => log(`Ошибка обновления: ${e && e.message ? e.message : e}`));
            reply(204, undefined, cors);
        });
    });

    return server;
}

module.exports = { createServer };
