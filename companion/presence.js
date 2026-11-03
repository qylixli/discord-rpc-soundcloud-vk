'use strict';

const RETRY_MS = 5000;

// Обёртка над @xhayper/discord-rpc (та же библиотека, что в soundcloud-rpc).
// Библиотека подключается лениво, чтобы остальной код тестировался без неё.
class DiscordPresence {
    constructor({ clientId, log = () => {} }) {
        this.clientId = clientId;
        this.log = log;
        this.client = null;
        this.connecting = false;
        this.lastAttempt = 0;
        this.warned = false;
        this.onDisconnect = () => {};
    }

    get connected() {
        return !!(this.client && this.client.isConnected && this.client.user);
    }

    async ensureConnected() {
        if (this.connected) return true;
        if (this.connecting) return false;
        if (Date.now() - this.lastAttempt < RETRY_MS) return false;

        this.connecting = true;
        this.lastAttempt = Date.now();
        try {
            const { Client } = require('@xhayper/discord-rpc');
            const client = new Client({ clientId: this.clientId });
            client.on('disconnected', () => {
                if (this.client === client) this.client = null;
                this.warned = false;
                this.log('Discord отключился');
                this.onDisconnect();
            });
            await client.login();
            this.client = client;
            this.warned = false;
            this.log('Подключено к Discord');
            return this.connected;
        } catch (e) {
            if (!this.warned) {
                this.log(`Не удалось подключиться к Discord (запущено ли приложение Discord на компьютере?): ${e && e.message ? e.message : e}`);
                this.warned = true;
            }
            return false;
        } finally {
            this.connecting = false;
        }
    }

    async setActivity(activity) {
        if (!(await this.ensureConnected())) return false;
        try {
            await this.client.user.setActivity(activity);
            return true;
        } catch (e) {
            this.log(`Discord не принял активность: ${e && e.message ? e.message : e}`);
            return false;
        }
    }

    async clearActivity() {
        if (!this.connected) return true; // нечего убирать
        try {
            await this.client.user.clearActivity();
            return true;
        } catch (e) {
            this.log(`Не удалось убрать активность: ${e && e.message ? e.message : e}`);
            return false;
        }
    }

    async destroy() {
        try {
            if (this.client) await this.client.destroy();
        } catch {
            // уже закрыто
        }
        this.client = null;
    }
}

module.exports = { DiscordPresence };
