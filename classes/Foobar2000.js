import { promises as fs } from 'fs';
import axios from 'axios';

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

		case "date":
			return new Date(data).getUTCFullYear();
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

		this.initLibrary();
	}

	get length() {
		const keys = Object.keys(this.library);
		return keys.length;
	}

	async getLibraryState() {
		const rootResponse = await axios.get(`http://${global.settings.foobar.address}/api/playlists`).catch((err) => {});
		
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

	async enqueueTrack(requestCode) {
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
}