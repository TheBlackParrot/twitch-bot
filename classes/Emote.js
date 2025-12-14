import axios from 'axios';
import { WebSocketListener } from "./WebSocketListener.js";

const delay = ms => new Promise(res => setTimeout(res, ms));

export class EmoteList {
	constructor() {
		this.emotes = [];
	}

	add(emote) {
		this.emotes.push(emote);
	}

	delete(id) {
		let emoteIdx = -1;

		for(let idx = 0; idx < this.emotes.length; idx++) {
			if(this.emotes[idx].id == id) {
				emoteIdx = idx;
				break;
			}
		}

		if(emoteIdx == -1) {
			return false;
		}

		this.emotes.splice(emoteIdx, 1);
		return true;
	}

	update(id, newName) {
		for(const emote of this.emotes) {
			if(emote.id == id) {
				emote.name = newName;
				return true;
			}
		}

		return false;
	}

	getByID(id) {
		for(const emote of this.emotes) {
			if(emote.id == id) {
				return emote;
			}
		}

		return null;
	}

	get names() {
		let out = [];
		// is there an array.map?
		for(const emote of this.emotes) {
			out.push(emote.name);
		}

		return out;
	}

	get length() {
		return this.emotes.length;
	}

	lengthFromService(service) {
		return this.emotes.filter((emote) => { return emote.service == service; }).length;
	}

	getFilteredString(string) {
		let filtered = string.split(" ").filter((word) => {
			for(const emote of this.emotes) {
				if(emote.name == word) {
					return false;
				}
			}

			return true;
		});

		return filtered.join(" ");
	}
}

class Emote {
	constructor(service, id, name) {
		this.name = name;
		this.id = id;
		this.service = service;
	}
}

export class BetterTTV {
	constructor() {
		this.preInitialize();
	}

	async preInitialize() {
		while(global.broadcasterUser == null) {
			global.log("BTTV", "global.broadcasterUser was null, waiting");
			await delay(1000);
		}

		await this.initialize();
	}

	async #getGlobalEmotes() {
		const response = await axios.get("https://api.betterttv.net/3/cached/emotes/global").catch((err) => {
			console.error(err);
			global.log("BTTV", "Unable to fetch global BTTV emotes - BTTV is probably down");
		});

		if(response) {
			if(response.statusText == "OK") {
				const data = response.data;

				for(const emote of data) {
					global.emotes.add(new Emote("BTTV", emote.id, emote.code));
				}
			}
		}
	}

	async #getChannelEmotes() {
		let response = await axios.get(`https://api.betterttv.net/3/cached/users/twitch/${global.broadcasterUser.id}?sigh=${Date.now()}`).catch((err) => {
			console.error(err);
			global.log("BTTV", `Unable to fetch BTTV emotes - BTTV is probably down`);
		});

		if(response) {
			if(response.statusText == "OK") {
				const data = response.data;

				let allEmotes = data.sharedEmotes.concat(data.channelEmotes);

				for(const emote of allEmotes) {
					global.emotes.add(new Emote("BTTV", emote.id, emote.code));
				}
			}
		}
	}

	onMessage = async function(data) {
		data = JSON.parse(data.toString('utf8'));

		let emote = null;

		switch(data.name) {
			case "emote_update":
				if("data" in data) {
					if("emote" in data.data) {
						emote = data.data.emote;
					} else {
						return;
					}
				} else {
					return;
				}

				global.log("BTTV", `Updating emote ${emote.id} to "${emote.code}"`);
				global.emotes.update(emote.id, emote.code);
				break;

			case "emote_delete":
				const oldEmote = global.emotes.getByID(data.data.emoteId);

				global.log("BTTV", `Deleting emote ${data.data.emoteId} ("${oldEmote.name}")`);
				global.emotes.delete(data.data.emoteId);
				break;

			case "emote_create":
				if("data" in data) {
					if("emote" in data.data) {
						emote = data.data.emote;
					} else {
						return;
					}
				} else {
					return;
				}

				global.log("BTTV", `Adding emote ${emote.id} ("${emote.code}")`);
				global.emotes.add(new Emote("BTTV", emote.id, emote.code));
				break;
		}
	}

	join = async function() {
		let msg = {
			name: "join_channel",
			data: {
				name: `twitch:${global.broadcasterUser.id}`
			}
		};

		while(this.listener.readyState != 1) {
			global.log("BTTV", "Waiting for socket to be ready before joining room...");
			await delay(1000);
		}

		this.listener.send(JSON.stringify(msg));
		global.log("BTTV", `Joined channel twitch:${global.broadcasterUser.id}`);
	}

	async initialize() {
		await this.#getGlobalEmotes();
		await this.#getChannelEmotes();

		global.log("BTTV", `Added ${global.emotes.lengthFromService("BTTV")} emotes`);

		this.listener = new WebSocketListener('wss://sockets.betterttv.net/ws', this.onMessage.bind(this), { restartDelay: 60 });
		await this.join();
	}
}

export class FrankerFaceZ {
	constructor() {
		this.preInitialize();
	}

	async preInitialize() {
		while(global.broadcasterUser == null) {
			global.log("FFZ", "global.broadcasterUser was null, waiting");
			await delay(1000);
		}

		await this.initialize();
	}

	async #getGlobalEmotes() {
		const response = await axios.get("https://api.frankerfacez.com/v1/set/global").catch((err) => {
			console.error(err);
			global.log("FFZ", "Unable to fetch global FFZ emotes - FFZ is probably down");
		});

		if(response) {
			if(response.statusText == "OK") {
				const data = response.data;

				for(const setIdx of data.default_sets) {
					const emotes = data.sets[setIdx].emoticons;

					for(const emote of emotes) {
						global.emotes.add(new Emote("FFZ", emote.id, emote.name));
					}
				}
			}
		}
	}

	async #getChannelEmotes() {
		let response = await axios.get(`https://api.frankerfacez.com/v1/room/id/${global.broadcasterUser.id}?sigh=${Date.now()}`).catch((err) => {
			console.error(err);
			global.log("FFZ", `Unable to fetch FFZ emotes - FFZ is probably down`);
		});

		if(response) {
			if(response.statusText == "OK") {
				const data = response.data;

				for(let setIdx in data.sets) {
					const emotes = data.sets[setIdx].emoticons;
					for(const emote of emotes) {
						global.emotes.add(new Emote("FFZ", emote.id, emote.name));
					}
				}
			}
		}
	}

	async initialize() {
		await this.#getGlobalEmotes();
		await this.#getChannelEmotes();

		global.log("FFZ", `Added ${global.emotes.lengthFromService("FFZ")} emotes`);
	}
}

export class SevenTV {
	constructor() {
		this.preInitialize();
		this.emoteSetIDs = [];
	}

	async preInitialize() {
		while(global.broadcasterUser == null) {
			global.log("7TV", "global.broadcasterUser was null, waiting");
			await delay(1000);
		}

		await this.initialize();
	}

	async #getGlobalEmotes() {
		const response = await axios.get("https://7tv.io/v3/emote-sets/global").catch((err) => {
			console.error(err);
			global.log("7TV", "Unable to fetch global 7TV emotes - 7TV is probably down");
		});

		if(response) {
			if(response.statusText == "OK") {
				const data = response.data;

				if(!("emotes" in data)) {
					global.log("7TV", "Unable to fetch global 7TV emotes - this specific error is 7TV's fault as they didn't actually give us any emotes to parse");
					return;
				}

				for(const emote of data.emotes) {
					const emoteData = emote.data;
					global.emotes.add(new Emote("7TV", emoteData.id, (emote.name || emoteData.name)));
				}
			}
		}
	}

	async #getChannelEmotes() {
		let response = await axios.get(`https://7tv.io/v3/users/twitch/${global.broadcasterUser.id}?sigh=${Date.now()}`).catch((err) => {
			console.error(err);
			global.log("7TV", `Unable to fetch 7TV emotes - 7TV is probably down`);
		});

		if(response) {
			if(response.statusText == "OK") {
				const data = response.data;

				if(data.emote_set === null) {
					global.log("7TV", `Unable to fetch channel's 7TV emotes, active emote set is... empty?`);
					return;
				} else if(!("emotes" in data.emote_set)) {
					global.log("7TV", `Unable to fetch channel's 7TV emotes, emotes aren't in the emote set (this is 7TV's fault)`);
					return;
				}

				this.emoteSetIDs.push(data.emote_set.id);

				for(const emote of data.emote_set.emotes) {
					const emoteData = emote.data;
					global.emotes.add(new Emote("7TV", emoteData.id, (emote.name || emoteData.name)));
				}
			} else {
				global.log("7TV", `Unable to fetch channel's 7TV emotes, response from 7TV was not OK`);
				return;
			}
		} else {
			global.log("7TV", `Unable to fetch channel's 7TV emotes, initial fetch completely failed`);
			return;
		}
	}

	async initialize() {
		await this.#getGlobalEmotes();
		await this.#getChannelEmotes();

		global.log("7TV", `Added ${global.emotes.lengthFromService("7TV")} emotes`);

		this.listener = new WebSocketListener('wss://events.7tv.io/v3', this.onMessage.bind(this), { restartDelay: 60 });
		this.subscribe("emote_set.*", global.broadcasterUser.id, this.emoteSetIDs[0]);
	}

	subscribe = async function(type, roomID, objectID) {
		let conditions = {};

		if(objectID) {
			conditions = {
				object_id: objectID
			};
		} else {
			conditions = {
				ctx: 'channel',
				id: roomID,
				platform: 'TWITCH'	
			};
		}

		let msg = {
			op: 35,
			d: {
				type: type,
				condition: conditions
			}
		};

		while(this.listener.readyState != 1) {
			global.log("7TV", "Waiting for socket to be ready before sending subscription...");
			await delay(1000);
		}

		global.log("7TV", `Sent subscription for ${type} in ${roomID}`);

		this.listener.send(JSON.stringify(msg));
	}

	onMessage = async function(data) {
		data = JSON.parse(data.toString('utf8'));

		switch(data.op) {
			case 0: // basic data
				if(data.d.type != "emote_set.update") {
					return;
				}

				data = data.d.body;

				if(this.emoteSetIDs.indexOf(data.id) === -1) {
					return;
				}

				if("pushed" in data) {
					for(const objectData of data.pushed) {
						const emoteData = objectData.value.data;

						global.log("7TV", `Adding emote ${emoteData.id} ("${(objectData.value.name || emoteData.name)}")`);
						global.emotes.add(new Emote("7TV", emoteData.id, (objectData.value.name || emoteData.name)));
					}
				}
				if("pulled" in data) {
					for(const objectData of data.pulled) {
						const emoteData = objectData.old_value;

						global.log("7TV", `Deleting emote ${emoteData.id} ("${emoteData.name}")`);
						global.emotes.delete(emoteData.id);
					}
				}
				break;

			case 4: // gtfo data
				this.listener.socket.close();
				break;
		}
	}
}