'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Controller } = require('./controller');
const { createServer } = require('./server');
const { DiscordPresence } = require('./presence');

const PORT = 47612; // должен совпадать с ENDPOINT в extension/background.js
const HOST = '127.0.0.1';

const DEFAULTS = { clientId: '', statusDisplay: 'artist', showButton: false };

function log(message) {
    const t = new Date().toLocaleTimeString();
    console.log(`[${t}] ${message}`);
}

function loadConfig() {
    const file = path.join(__dirname, 'config.json');
    if (!fs.existsSync(file)) {
        console.error('Нет файла companion/config.json.');
        console.error('Запустите install.bat (он спросит Application ID) или скопируйте config.example.json в config.json и впишите ID вручную (см. README.md).');
        process.exit(1);
    }
    try {
        return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (e) {
        console.error(`config.json повреждён: ${e.message}`);
        process.exit(1);
    }
}

const config = loadConfig();
if (!/^\d{17,20}$/.test(String(config.clientId))) {
    console.error('В config.json не указан clientId (Application ID из Discord Developer Portal, 17–20 цифр). См. README.md.');
    process.exit(1);
}

const presence = new DiscordPresence({ clientId: String(config.clientId), log });
const controller = new Controller({ presence, config, log });
presence.onDisconnect = () => controller.forget();

const server = createServer({ controller, log });
server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`Порт ${PORT} занят. Скорее всего, программа уже запущена в другом окне.`);
    } else {
        console.error(`Ошибка сервера: ${e.message}`);
    }
    process.exit(1);
});
server.listen(PORT, HOST, () => log(`Жду данные от браузера (userscript) на ${HOST}:${PORT}`));

setInterval(() => {
    controller.tick().catch((e) => log(`Ошибка: ${e && e.message ? e.message : e}`));
}, 1000);

async function shutdown() {
    try {
        await presence.clearActivity();
        await presence.destroy();
    } finally {
        process.exit(0);
    }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
