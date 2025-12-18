import { promises as fs } from 'fs';
import { WebSocketServer } from 'ws';

const filetypes = ['wav', 'ogg', 'mp3'];

class SoundCache {
	constructor() {
		this.cache = {};
	}

	async get(name) {
		let path = `${global.settings.sounds.directory}/${name}`;

		try {
			const files = await fs.readdir(path);
			return await this.getIndividualFile(`${name}/${files[Math.floor(Math.random() * files.length)].split(".").slice(0, -1).join(".")}`);
		} catch {
			return await this.getIndividualFile(name);
		}
	}

	async getIndividualFile(name) {
		if(name in this.cache) {
			return this.cache[name];
		}

		global.log("SOUNDS", `"${name}" hasn't been cached yet, caching it`, false, ['gray']);

		let data = null;
		let type = null;

		for(const filetype of filetypes) {
			let path = `${global.settings.sounds.directory}/${name}.${filetype}`;

			data = null;
			type = null;

			try {
				data = await fs.readFile(path);
				type = `audio/${filetype}`;
			} catch {
				// ignored
			}

			if(data != null) {
				break;
			}
		}

		if(data == null) {
			return null;
		}

		this.cache[name] = {
			data: data,
			type: type,
			realName: name
		};
		return this.cache[name];
	}
}

export class SoundServer {
	constructor() {
		this.cache = new SoundCache();

		this.server = new WebSocketServer({
			host: global.settings.sounds.server.address,
			port: global.settings.sounds.server.port
		});

		let instance = this;
		this.clients = [];

		this.server.on('connection', (client) => {
			instance.clients.push(client);
			instance.onOpen();

			client.on('close', instance.onClose.bind(this));
			client.on('message', instance.onMessage.bind(this));
		});
	}

	onOpen = function() {
		global.log("SOUNDS", "Client connected to sound server", false, ['greenBright']);
	}

	onClose = function() {
		global.log("SOUNDS", "Client disconnected from sound server", false, ['redBright']);
	}

	onMessage = async function(data) {
		const which = data.toString();

		global.log("SOUNDS", `Client wants sound ${which}`, false, ['gray']);
		await this.broadcastAudioData(which);
	}

	broadcast(event, data) {
		for(const client of this.clients) {
			if(client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify({ event: event, data: data }));
			}
		}
	}

	broadcastAudioData = async function(which) {
		const sound = await this.cache.get(which);
		
		if(sound == null) {
			return;
		}

		this.broadcast("data", {
			name: sound.realName,
			audio: sound.data.toString('base64')
		});
	}

	play = async function(which, volume = 1, pitch = [1, 1]) {
		const sound = await this.cache.get(which);
		
		if(sound == null) {
			return;
		}

		this.broadcast("sound", {
			type: sound.type,
			name: sound.realName,
			volume: volume,
			pitchRange: pitch
		});
	}
}