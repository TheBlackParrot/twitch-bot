import { promises as fs } from 'fs';
import axios from 'axios';
import { EventSource } from 'eventsource';

const foobarSchema = JSON.parse(await fs.readFile('./static/foobarSchema.json'));
var foobarTagSchema = {};
for(const key in foobarSchema) {
	foobarTagSchema[foobarSchema[key].tag] = key;
}

function formatFoobarTagResponse(data, tag) {
	if(!(tag in foobarSchema)) {
		return data;
	}

	switch(foobarSchema[tag].type) {
		case "string":
			return data;
			break;

		case "year":
			return new Date(data).getUTCFullYear();
			break;

		case "timestamp":
			return new Date(data).getTime();
			break;

		case "number":
			return parseInt(data);
			break;

		case "float":
			return parseFloat(data);
			break;

		default:
			return data;
	}
}

export class Foobar2000 {
	constructor(playlistName = "Library Viewer Selection") {
		this.playlistName = playlistName
		this.library = {};

		this.state = {
			activeItemIndex: 0,
			playlistId: "",
			playing: false,
			elapsed: 0
		};

		this.history = [];

		this.initLibrary();
	}

	get length() {
		const keys = Object.keys(this.library);
		return keys.length;
	}

	async getLibraryState() {
		const rootResponse = await axios.get(`http://${global.settings.foobar.address}/api/playlists`).catch((err) => {});

		if(!rootResponse) {
			global.log("FOOBAR2K", "No response from foobar2000", false, ['redBright']);
			return [];
		}
		
		let wantedPlaylist = {};
		for(const playlist of rootResponse.data.playlists) {
			if(playlist.title == this.playlistName) {
				wantedPlaylist = playlist;
				break;
			}
		}

		let columns = [];
		for(const key in foobarSchema) {
			columns.push(foobarSchema[key].tag);
		}

		const playlistResponse = await axios.get(`http://${global.settings.foobar.address}/api/playlists/${wantedPlaylist.id}/items/0:${wantedPlaylist.itemCount}?columns=${columns.join(",")}`).catch((err) => {});

		const items = playlistResponse.data.playlistItems.items;
		const output = [];

		for(const itemIdx in items) {
			const item = items[itemIdx];

			var track = {};
			const trackData = item.columns;

			for(const idx in columns) {
				const tag = columns[idx];
				track[foobarTagSchema[tag]] = (trackData[idx] === "?" ? null : formatFoobarTagResponse(trackData[idx], foobarTagSchema[tag]));
			}
			track.id = `${wantedPlaylist.id}:${itemIdx}`;

			output.push(track);
		}

		return output;
	}

	async initLibrary() {
		const items = await this.getLibraryState();

		for(const trackData of items) {
			this.addToLibrary(trackData);
		}

		global.log("FOOBAR2K", `Initialized library with ${this.length.toLocaleString()} tracks`, false, ['whiteBright']);
		await this.exportLibrary();

		await this.loadQueue();

		this.initEventSource();
	}

	addToLibrary(trackData) {
		if(!("requestCode" in trackData)) {
			return;
		}
		if(!trackData.requestCode.trim().length || trackData.requestCode == "?") {
			return;
		}

		if(trackData.requestCode in this.library) {
			const existing = this.library[trackData.requestCode];

			global.log("FOOBAR2K", `Potential conflict (${trackData.requestCode}): ${existing.artist} - ${existing.title} :: ${trackData.artist} - ${trackData.title}`, false, ['yellowBright']);
			return;
		}

		this.library[trackData.requestCode] = trackData;
	}

	async enqueueTrack(requestCode, skipSaving = true) {
		const currentStateItems = await this.getLibraryState();

		const foundItems = currentStateItems.filter((item) => {
			return requestCode == item.requestCode;
		});

		if(!foundItems.length) {
			return false;
		}

		const foundItem = foundItems[0];

		const queueState = await axios.get(`http://${global.settings.foobar.address}/api/playqueue`).catch((err) => {});
		const action = {
			plref: parseInt(foundItem.id.split(":")[0].substr(1)) - 1, // wtf
			itemIndex: parseInt(foundItem.id.split(":")[1]),
			queueIndex: queueState.data.playQueue.length
		};
		await axios.post(`http://${settings.foobar.address}/api/playqueue/add`, action).catch((err) => {
			console.error(err.response.data);
		});

		global.log("FOOBAR2K", `Enqueued track ${foundItem.requestCode} (${foundItem.artist} - ${foundItem.title})`, false, ['whiteBright']);
		foundItem.queuePosition = queueState.data.playQueue.length + 1;

		if(!skipSaving) {
			await this.saveQueue();
		}

		return foundItem;
	}

	async getCurrentTrack() {
		const rootResponse = await axios.get(`http://${global.settings.foobar.address}/api/player`).catch((err) => {});

		if(!("data" in rootResponse)) {
			return null;
		}

		if(!("player" in rootResponse.data)) {
			return null;
		}

		if(!("activeItem" in rootResponse.data.player)) {
			return null;
		}

		const active = rootResponse.data.player.activeItem;

		let columns = [];
		for(const key in foobarSchema) {
			columns.push(foobarSchema[key].tag);
		}

		const entryResponse = await axios.get(`http://${global.settings.foobar.address}/api/playlists/${active.playlistId}/items/${active.index}:1?columns=${columns.join(",")}`).catch((err) => {});

		if(!entryResponse) {
			return null;
		}

		if(!("data" in entryResponse)) {
			return null;
		}

		var track = {};
		const trackData = entryResponse.data.playlistItems.items[0].columns;

		for(const idx in columns) {
			const tag = columns[idx];
			track[foobarTagSchema[tag]] = (trackData[idx] === "?" ? null : formatFoobarTagResponse(trackData[idx], foobarTagSchema[tag]));
		}

		if("comment" in track) {
			if(track.comment) {
				if(track.comment.length == 22 && track.comment.split(" ").length == 1) {
					// spotify code
					track.spotifyURL = `https://open.spotify.com/track/${track.comment}`;
				}
			}
		}

		return track;
	}

	async exportLibrary() {
		const library = this.library;
		if(!Object.keys(library).length) {
			await global.log("FOOBAR2K", `Not exporting library to a file, library is empty`, false, ['gray']);
			return;
		}

		await fs.writeFile(global.settings.foobar.exportLocation, JSON.stringify(library, null, '\t'));

		await global.log("FOOBAR2K", `Exported library to ${global.settings.foobar.exportLocation}`, false, ['gray']);
	}

	async clearQueue() {
		await axios.post(`http://${global.settings.foobar.address}/api/playqueue/clear`).catch((err) => {});
		global.log("FOOBAR2K", "Queue was cleared", false, ['whiteBright']);
	}

	async saveQueue() {
		const response = await axios.get(`http://${global.settings.foobar.address}/api/playqueue?columns=${foobarSchema["requestCode"].tag}`).catch((err) => {});

		if(!response) {
			global.log("FOOBAR2K", `Could not save queue, no response from foobar2000`, false, ['redBright']);
			return;
		}

		let queue = [];
		if("data" in response) {
			if("playQueue" in response.data) {
				for(let idx in response.data.playQueue) {
					const requestCode = response.data.playQueue[idx].columns[0];
					if(requestCode != "?") {
						queue.push(requestCode);
					}
				}
			}
		}

		await fs.writeFile("./data/foobarQueue.json", JSON.stringify(queue, null, '\t'));
		global.log("FOOBAR2K", `Saved ${queue.length} queue entries`, false, ['gray']);
	}

	async loadQueue() {
		var queueEntries = [];

		try {
			queueEntries = JSON.parse(await fs.readFile('./data/foobarQueue.json'));
		} catch(err) {
			global.log("FOOBAR2K", "Could not load persistent queue data", false, ['yellowBright']);
			return;
		}

		await this.clearQueue();

		for(const requestCode of queueEntries) {
			await this.enqueueTrack(requestCode);
		}

		global.log("FOOBAR2K", "Loaded persistent queue data", false, ['gray']);
	}

	initEventSource() {
		this.events = new EventSource(`http://${global.settings.foobar.address}/api/query/updates?player=true&trcolumns=${foobarSchema["requestCode"].tag}`);
		this.events.addEventListener('message', this.onEventMessage.bind(this));
	}

	onEventMessage(message) {
		const data = JSON.parse(message.data);
		if(!Object.keys(data).length) {
			return;
		}

		const player = data.player;
		const active = player.activeItem;

		this.state.playing = (player.playbackState === "playing" ? true : false);
		this.state.elapsed = parseInt(active.position * 1000);

		if(this.state.activeItemIndex !== active.index || this.state.playlistId !== active.playlistId) {
			if(!active.columns.length) {
				return;
			}

			let requestCode = active.columns[0];

			if(requestCode == "?") {
				return;
			}

			if(requestCode in this.library) {
				const trackData = this.library[requestCode];
				console.log(trackData);
			}
		}
	}
}