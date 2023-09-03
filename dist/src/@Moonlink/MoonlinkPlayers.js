"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MoonlinkPlayer = void 0;
const index_1 = require("../../index");
class MoonlinkPlayer {
    manager;
    infos;
    map;
    payload;
    guildId;
    textChannel;
    voiceChannel;
    autoPlay;
    connected;
    playing;
    paused;
    loop;
    volume;
    queue;
    filters;
    current;
    data;
    node;
    rest;
    constructor(infos, manager, map) {
        this.payload = manager._sPayload;
        this.guildId = infos.guildId;
        this.botId = manager.botId;
        this.textChannel = infos.textChannel;
        this.voiceChannel = infos.voiceChannel;
        this.autoPlay = infos.autoPlay;
        this.connected = infos.connected || null;
        this.playing = infos.playing || null;
        this.paused = infos.paused || null;
        this.loop = infos.loop || null;
        this.volume = infos.volume || 90;
        if (manager.options && manager.options.custom.queue)
            this.queue = new manager.options.custom.queue(manager, this);
        else
            this.queue = new index_1.MoonlinkQueue(manager, this);
        this.current = map.get("current") || {};
        this.current = this.current[this.guildId];
        this.map = map;
        this.data = this.map.get('players') || {};
        this.data = this.data[this.guildId];
        this.node = manager.nodes.get(this.get('node'));
        this.rest = this.node.rest;
        this.manager = manager;
        this.filters = new index_1.MoonlinkFilters(this);
    }
    updatePlayers() {
        let players = this.map.get('players') || {};
        players[this.guildId] = this.data;
        this.map.set('players', players);
    }
    set(key, value) {
        this.data[key] = value;
        this.updatePlayers();
    }
    get(key) {
        this.updatePlayers();
        return this.data[key] || null;
    }
    setTextChannel(channelId) {
        if (!channelId)
            throw new Error('[ @Moonlink/Player ]: "channelId" option is empty');
        if (typeof channelId !== "string")
            throw new Error('[ @Moonlink/Player ]: option "channelId" is different from string');
        this.set('textChannel', channelId);
        this.textChannel = channelId;
        return true;
    }
    setVoiceChannel(channelId) {
        if (!channelId)
            throw new Error('[ @Moonlink/Player ]: "channelId" option is empty');
        if (typeof channelId !== "string")
            throw new Error('[ @Moonlink/Player ]: option "channelId" is different from string');
        this.set('voiceChannel', channelId);
        this.voiceChannel = channelId;
        return true;
    }
    setAutoPlay(mode) {
        if (!mode && typeof mode !== "boolean")
            throw new Error('[ @Moonlink/Player ]: "mode" option is empty or is different from boolean');
        this.set('autoPlay', mode);
        this.autoPlay = mode;
        return mode;
    }
    connect(options) {
        options = options || { setDeaf: false, setMute: false };
        const { setDeaf, setMute } = options;
        this.set("connected", true);
        this.payload(this.guildId, JSON.stringify({
            op: 4,
            d: {
                guild_id: this.guildId,
                channel_id: this.voiceChannel,
                self_mute: setMute,
                self_deaf: setDeaf,
            },
        }));
        return true;
    }
    disconnect() {
        this.set("connected", false);
        this.set("voiceChannel", null);
        this.payload(this.guildId, JSON.stringify({
            op: 4,
            d: {
                guild_id: this.guildId,
                channel_id: null,
                self_mute: false,
                self_deaf: false,
            },
        }));
        return true;
    }
    async restart() {
        if (!this.current && !this.queue.size)
            return;
        if (!this.current)
            this.play();
        await this.manager.attemptConnection(this.guildId);
        await this.rest.update({
            guildId: this.guildId,
            data: {
                encodedTrack: this.current.encoded,
                position: this.current.position,
                volume: this.volume,
            },
        });
    }
    async play() {
        if (!this.queue.size)
            return;
        let queue = this.queue.db.get(`${this.botId}.queue.${this.guildId}`);
        let data = queue.shift();
        if (!data)
            return;
        let current = this.map.get("current") || {};
        current[this.guildId] = {
            ...data,
            thumbnail: data.thumbnail,
            requester: data.requester,
        };
        this.current = current[this.guildId];
        this.map.set("current", current);
        await this.queue.db.set(`${this.botId}.queue.${this.guildId}`, queue);
        await this.rest.update({
            guildId: this.guildId,
            data: {
                encodedTrack: data.encoded,
                volume: this.volume,
            },
        });
    }
    async pause() {
        if (!this.paused)
            return true;
        await this.updatePlaybackStatus(true);
        return true;
    }
    async resume() {
        if (this.playing)
            return true;
        await this.updatePlaybackStatus(false);
        return true;
    }
    async updatePlaybackStatus(paused) {
        await this.rest.update({
            guildId: this.guildId,
            data: { paused },
        });
        this.set("paused", paused);
        this.set("playing", !paused);
    }
    async stop() {
        const clearData = () => {
            delete this.map.get(`players`)[this.guildId];
            this.set("connected", false);
            this.set("voiceChannel", null);
        };
        if (!this.queue.size) {
            await this.rest.update({
                guildId: this.guildId,
                data: { encodedTrack: null },
            });
            clearData();
            return true;
        }
        else {
            clearData();
            return true;
        }
        return false;
    }
    async skip() {
        if (!this.queue.size) {
            this.destroy();
            return false;
        }
        else {
            this.play();
            return true;
        }
    }
    async setVolume(percent) {
        if (typeof percent == "undefined" && typeof percent !== "number")
            throw new Error('[ @Moonlink/Player ]: option "percent" is empty or different from number');
        if (!this.playing)
            throw new Error("[ @Moonlink/Player ]: cannot change volume while player is not playing");
        await this.rest.update({
            guildId: this.guildId,
            data: { volume: percent },
        });
        let players = this.map.get("players") || {};
        players[this.guildId] = {
            ...players[this.guildId],
            volume: percent,
        };
        this.volume = percent;
        this.map.set("players", players);
        return percent;
    }
    setLoop(mode) {
        if (typeof mode !== 'number' || (mode !== null && (mode < 0 || mode > 2))) {
            throw new Error('[ @Moonlink/Player ]: the option "mode" is different from number or the option does not exist');
        }
        this.set("loop", mode);
        return mode;
    }
    async destroy() {
        if (this.connected)
            this.disconnect();
        await this.rest.destroy(this.guildId);
        this.queue.db.delete(`${this.botId}.queue.${this.guildId}`);
        let players = this.map.get("players");
        delete players[this.guildId];
        this.map.set("players", players);
        return true;
    }
    validateNumberParam(param, paramName) {
        if (typeof param !== "number") {
            throw new Error(`[ @Moonlink/Player ]: option "${paramName}" is empty or different from number`);
        }
    }
    async seek(position) {
        this.validateNumberParam(position, "position");
        if (position >= this.current.duration) {
            throw new Error(`[ @Moonlink/Player ]: parameter "position" is greater than the duration of the current track`);
        }
        if (!this.current.isSeekable && this.current.isStream) {
            throw new Error(`[ @Moonlink/Player ]: seek function cannot be applied on live video | or cannot be applied in "isSeekable"`);
        }
        await this.rest.update({
            guildId: this.guildId,
            data: { position },
        });
        return position;
    }
    async skipTo(position) {
        this.validateNumberParam(position, "position");
        if (!this.queue.size) {
            throw new Error(`[ @Moonlink/Player ]: the queue is empty to use this function`);
        }
        let queue = this.queue.db.get(`${this.botId}.queue.${this.guildId}`);
        if (!queue[position - 1]) {
            throw new Error(`[ @Moonlink/Player ]: the indicated position does not exist, make security in your code to avoid errors`);
        }
        let data = queue.splice(position - 1, 1)[0];
        let currents = this.map.get("current") || {};
        currents[this.guildId] = data;
        this.map.set("current", currents);
        this.queue.db.set(`${this.botId}.queue.${this.guildId}`, queue);
        await this.rest.update({
            guildId: this.guildId,
            data: {
                encodedTrack: data.track
                    ? data.track
                    : data.encoded
                        ? data.encoded
                        : data.trackEncoded
                            ? data.trackEncoded
                            : null,
                volume: 90,
            },
        });
        return true;
    }
    async shuffle() {
        if (!this.queue.size) {
            throw new Error(`[ @Moonlink/Player ]: the queue is empty to use this function`);
        }
        let queue = this.queue.all;
        this.shuffleArray(queue);
        this.queue.db.set(`${this.botId}.queue.${this.guildId}`, queue);
        return true;
    }
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
exports.MoonlinkPlayer = MoonlinkPlayer;
//# sourceMappingURL=MoonlinkPlayers.js.map