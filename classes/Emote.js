import axios from 'axios';
import { WebSocketListener } from "./WebSocketListener.js";

const delay = ms => new Promise(res => setTimeout(res, ms));

/*
"emote_set.update": function(data) {
	if(allowedSevenTVEmoteSets.indexOf(data.id) === -1 && localStorage.getItem("setting_enable7TVPersonalEmoteSets") === "false") {
		return;
	}

	if("pushed" in data) {
		for(const objectData of data.pushed) {
			const emoteData = objectData.value.data;
			const urls = emoteData.host.files;

			chatEmotes.addEmote(new Emote({
				service: "7tv",
				setID: data.id,
				animated: emoteData.animated,
				urls: {
					high: `https:${emoteData.host.url}/4x.###`,
					low: `https:${emoteData.host.url}/1x.###`
				},
				emoteID: emoteData.id,
				emoteName: (objectData.value.name || emoteData.name),
				isZeroWidth: ((emoteData.flags & 256) === 256),
				global: false
			}));
		}
	}
	if("pulled" in data) {
		for(const objectData of data.pulled) {
			console.log(objectData);
			const emoteData = objectData.old_value;
			chatEmotes.deleteEmote(emoteData.id, data.id);
		}
	}
}
*/

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
		let before = global.emotes.length;

		await this.#getGlobalEmotes();
		await this.#getChannelEmotes();

		let after = global.emotes.length;

		global.log("7TV", `Added ${after - before} emotes`);

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
			console.log("waiting to be ready...");
			await delay(1000);
		}
		console.log("ready");

		this.listener.send(JSON.stringify(msg));
	}

	onMessage = async function(data) {
		console.log("onMessage");
		data = JSON.parse(data.toString('utf8'));

		switch(data.op) {
			case 0: // basic data
				if(data.d.type != "emote_set.update") {
					console.log("not emote_set.update");
					return;
				}

				data = data.d.body;
				if(this.emoteSetIDs.indexOf(data.id) === -1) {
					console.log(this.emoteSetIDs);
					console.log(data.id);
					return;
				}

				if("pushed" in data) {
					console.log("push");
					for(const objectData of data.pushed) {
						const emoteData = objectData.value.data;
						global.emotes.add(new Emote("7TV", emoteData.id, (objectData.value.name || emoteData.name)));
					}
				}
				if("pulled" in data) {
					console.log("pull");
					for(const objectData of data.pulled) {
						const emoteData = objectData.old_value;
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