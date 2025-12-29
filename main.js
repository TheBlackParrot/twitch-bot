import { promises as fs } from 'fs';
import { Console } from 'node:console';
import { styleText } from 'node:util';
import { exec } from 'node:child_process';
import axios from 'axios';
import { OBSWebSocket } from 'obs-websocket-js';
const obs = new OBSWebSocket();
import { Player } from "cli-sound";
const sound = new Player();

import { RefreshingAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { ChatClient, parseEmotePositions } from '@twurple/chat';
import { EventSubWsListener } from '@twurple/eventsub-ws';

const sessionStart = Date.now();

await fs.writeFile(`./logs/${sessionStart}.log`, '');
const logFileHandle = await fs.open(`./logs/${sessionStart}.log`, 'r+');
const logOutput = await logFileHandle.createWriteStream();
const logWriter = new Console({ stdout: logOutput });
function log(type, data, showTrace = false, style = []) {
	let date = new Date();
	let timestamp = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;

	const header = `[${timestamp}]${type != "" ? ` [${type}]` : ''}`;

	if(typeof(data) != "object") {
		console.log(styleText(style, `${header} ${data}`));
		logWriter.log(`${header} ${data}`);
	} else {
		console.log(header);
		logWriter.log(header);
		console.log(data);
		logWriter.log(data);
	}

	if(showTrace) {
		console.trace();
		logWriter.trace();
	}
}
global.log = log;

import { UserList } from "./classes/User.js";
import { CommandList } from "./classes/Command.js";
import { WebSocketListener } from "./classes/WebSocketListener.js";
import { EmoteList, SevenTV, BetterTTV, FrankerFaceZ } from "./classes/Emote.js";
import { ChannelRedeemList } from "./classes/ChannelRedeem.js";
import { RulerOfTheRedeem } from "./classes/RulerOfTheRedeem.js";
import { Counter } from "./classes/Counter.js";
import { SoundServer } from "./classes/SoundServer.js";
import { CreditRaffle } from "./classes/CreditRaffle.js";
import { Foobar2000 } from "./classes/Foobar2000.js";

fs.mkdir("./logs").catch((err) => {
	// ignored 
});
fs.mkdir("./data/persistence", { recursive: true }).catch((err) => {
	// ignored
});

const settings = JSON.parse(await fs.readFile('./settings.json'));
global.settings = settings;
const clientId = settings.auth.twitch.clientID;
const clientSecret = settings.auth.twitch.clientSecret;
const botTokenData = JSON.parse(await fs.readFile('./data/tokens.738319562.json'));
const streamerTokenData = JSON.parse(await fs.readFile('./data/tokens.43464015.json'));
const authProvider = new RefreshingAuthProvider(
	{
		clientId,
		clientSecret
	}
);

const allowedTTSVoices = JSON.parse(await fs.readFile('./static/allowedTTSVoices.json'));
const weatherConditionCodes = JSON.parse(await fs.readFile('./static/weatherConditionCodes.json'));
const initialRedeemList = JSON.parse(await fs.readFile('./static/redeems.json'));
global.initialRedeemList = initialRedeemList;
const rotatingMessageLines = JSON.parse(await fs.readFile('./static/rotatingMessages.json'));
const soundCommands = JSON.parse(await fs.readFile('./static/soundCommands.json'));
const whitelistedDomains = JSON.parse(await fs.readFile('./static/whitelistedDomains.json'));

const users = new UserList();
const commandList = new CommandList();
const redeemList = new ChannelRedeemList();
global.redeemList = redeemList;
var broadcasterUser = null;
global.broadcasterUser = null;
const counter = new Counter();
global.counter = counter;
const remoteSound = new SoundServer();
global.remoteSound = remoteSound;
const creditRaffle = new CreditRaffle();
const foobar2000 = new Foobar2000("safe");

const apiClient = new ApiClient({
	authProvider
});
global.apiClient = apiClient;

const delay = ms => new Promise(res => setTimeout(res, ms));

var allowBejeweled = false;

// ====== SYSTEM STUFF ======

async function tts(voice, string, rate = 0) {
	let url = new URL('/', settings.tts.URL);
	let data = {
		voice: voice,
		text: string.replaceAll('"', '').replace(/[^\x00-\x7F]/g, ''),
		rate: rate
	};

	await axios.post(url, data).catch((err) => {});
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

// ====== AUTH ======

async function refreshHandler(userId, newTokenData) {
	await fs.writeFile(`./data/tokens.${userId}.json`, JSON.stringify(newTokenData, null, 4));
	log("AUTH", `Refreshed tokens for ${userId}`);
}

authProvider.onRefresh(refreshHandler);
await authProvider.addUserForToken(botTokenData, ['chat', 'user']);
await authProvider.addUserForToken(streamerTokenData, ['channel']);

// ====== SRXD ======

var spinRequestsSocket;

function initSpinRequestsSocket() {
	if(initialCategory == "Spin Rhythm XD") {
		spinRequestsSocket = new WebSocketListener('ws://127.0.0.1:6970/', handleSpinRequestsMessage);
	}
}

const spinRequestsFunctions = {
	RequestsAllowed: function(value) {
		say(broadcasterUser.name, `The queue is now ${value ? "open! duckKill" : "closed! LetMeIn"}`);
	},

	Played: function(data) {
		if(!data.Requester.length) {
			return;
		}

		say(broadcasterUser.name, `@${data.Requester} Your map (${formatSRXDLinkResponse(data, "", true)}) is up next!`);
	}
}

function handleSpinRequestsMessage(data) {
	if(broadcasterUser == null) {
		return;
	}

	data = JSON.parse(data.toString('utf8'));
	
	if(data.EventType in spinRequestsFunctions) {
		spinRequestsFunctions[data.EventType](data.Data);
	}
}

function formatSRXDLinkResponse(chart, prefix = "", skipLink = false) {
	let parts = [`${prefix}"${chart.Title}" by ${chart.Artist}`];
	if(chart.Pack != null) {
		parts.push(`from the ${chart.Pack}`);
	}
	if(chart.Mapper != null) {
		parts.push(`(mapped by ${chart.Mapper})`);
	}
	if(chart.FileReference.substr(0, 10) === "spinshare_" && !skipLink) {
		parts.push(`- https://spinsha.re/song/${chart.FileReference}`);
	}

	return parts.join(" ");
}

async function querySRXD(endpoint, args, opts) {
	let url = new URL(`/${endpoint}${args != '' ? `/${args}` : ''}`, settings.srxd.spinRequestsURL);
	let params = new URLSearchParams(opts);
	url.search = params.toString();

	return await axios.get(url, { validateStatus: () => { return true } }).catch((err) => {});
}

// ====== TRIGGER COMMANDS ======

async function getTargetedUser(channel, target, msg) {
	if(!target || target.length === 0) {
		await reply(channel, msg, "⚠️ Command requires a targeted user");
		return null;
	}

	const userCheck = await apiClient.users.getUserByName(target.replace("@", "").toLowerCase());

	if(!userCheck) {
		await reply(channel, msg, "⚠️ Could not find any users matching that username");
		return null;
	}

	const wantedId = userCheck.id;
	const wantedName = userCheck.displayName;

	return {
		userId: wantedId,
		userDisplayName: wantedName
	};
}

async function getLeaderboardValueFromUserTarget(channel, args, msg, user, key) {
	let wantedId = user.userId;
	let wantedName = user.displayName;

	if(args.length) {
		const userCheck = await apiClient.users.getUserByName(args[0].replace("@", "").toLowerCase());

		if(!userCheck) {
			await reply(channel, msg, "⚠️ Could not find any users matching that username");
			return null;
		}

		wantedId = userCheck.id;
		wantedName = userCheck.displayName;
	}

	const value = await getLeaderboardValue(wantedId, key);
	return {
		value: value,
		userId: wantedId,
		userDisplayName: wantedName
	};
}

// --- !ad ---
commandList.addTrigger("ad", async(channel, args, msg, user) => {
	if(args.length) {
		if(args[0].toLowerCase()[0] == "y") {
			try {
				await apiClient.channels.startChannelCommercial(broadcasterUser.id, settings.twitch.scheduledAdBreakLength);
			} catch(err) {
				console.error(err);
				await reply(channel, msg, "⚠️ Failed to start an ad break");
				return;
			}

			await reply(channel, msg, `🆗 Started a ${settings.twitch.scheduledAdBreakLength} second ad break`);
		}
	}

	await obs.call('SetCurrentProgramScene', {
		sceneName: "Ad Wall"
	});
}, {
	whitelist: ["broadcaster", "mod"],
	aliases: ["runad", "runads", "startads", "startad"],
	cooldown: 900,
	respondWithCooldownMessage: true
});

// --- !addrotr ---
commandList.addTrigger("addrotr", async(channel, args, msg, user) => {
	if(args.length != 2) {
		return;
	}

	const userCheck = await apiClient.users.getUserByName(args[0].replace("@", "").toLowerCase());

	if(!userCheck) {
		await reply(channel, msg, "⚠️ Could not find any users matching that username");
		return;
	}

	await updateLeaderboardValues(userCheck.id, "Ruler of the Redeem", parseInt(args[1]));
	await reply(channel, msg, `🆗 Added ${parseInt(args[1]).toLocaleString()} seconds to Ruler of the Redeem for ${userCheck.name}`);
}, {
	whitelist: ["broadcaster"]
});

// --- !amhere ---
commandList.addTrigger("amhere", async(channel, args, msg, user) => {
	await updateLeaderboardValues(user.userId, "Gamba Credits", 20);
	await reply(channel, msg, '20 Gamba Credits to you! Okayge');
}, {
	userCooldown: 1800,
	respondWithCooldownMessage: true
});

// --- !bitrate ---
commandList.addTrigger("bitrate", async(channel, args, msg, user) => {
	const bytes = (obsBytesSentData[1] - obsBytesSentData[0]) / settings.obs.bitrateInterval;
	await reply(channel, msg, `Stream bitrate: ${((bytes * 8) / 1048576).toFixed(2)} mbps (${Math.floor((bytes * 8) / 1024).toLocaleString()} kbps)`)
}, {
	userCooldown: 10,
	cooldown: 5
});

// --- !cancelraffle ---
commandList.addTrigger("cancelraffle", async(channel, args, msg, user) => {
	if(!creditRaffle.active) {
		await reply(channel, msg, '⚠️ No Gamba Credit raffle is in progress. Use !startraffle to start one.');
		return;
	}
	
	await creditRaffle.cancel();
}, {
	whitelist: ["broadcaster", "mod"],
	cooldown: 3
});

// --- !category ---
commandList.addTrigger("category", async(channel, args, msg, user) => {
	if(!args.length) {
		let channelInfo = await apiClient.channels.getChannelInfoById(broadcasterUser.id);
		await reply(channel, msg, `Category is currently ${channelInfo.gameName}`);
		return;
	}

	let wantedGameName = args.join(" ");
	let gameInfo = await apiClient.games.getGameByName(wantedGameName);
	if(gameInfo == null) {
		await reply(channel, msg, `⚠️ Could not find any categories for "${wantedGameName}"`);
		return;
	}

	await apiClient.channels.updateChannelInfo(broadcasterUser.id, {
		gameId: gameInfo.id
	});

	await reply(channel, msg, `Category should now be ${gameInfo.name}`);
}, {
	aliases: ["game"],
	whitelist: ["broadcaster", "mod"],
	cooldown: 15
});

// --- !credits ---
commandList.addTrigger("credits", async(channel, args, msg, user) => {
	const value = await getLeaderboardValueFromUserTarget(channel, args, msg, user, "Gamba Credits");
	if(value != null) {
		await reply(channel, msg, `${value.userId == user.userId ? "You have" : `${value.userDisplayName} has`} ${value.value.toLocaleString()} Gamba ${value.value != 1 ? "Credits" : "Credit"}`);
	}
}, {
	userCooldown: 5,
	respondWithCooldownMessage: true
});

// --- !csp ---
commandList.addTrigger("csp", async(channel, args, msg, user) => {
	await reply(channel, msg, 'Use this page to change your appearance/theme settings on the chat overlay: https://theblackparrot.me/overlays/chat-customizer');
}, {
	cooldown: 10
});

// --- !discord ---
commandList.addTrigger("discord", async(channel, args, msg, user) => {
	await reply(channel, msg, 'https://discord.gg/gCDJYbzxar');
}, {
	cooldown: 10
});

// --- !dka ---
commandList.addTrigger("dka", async(channel, args, msg, user) => {
	await say(channel, 'Diabetic Ketoacidosis (DKA) is a serious condition in which an insulin-deprived body seeks energy from stored fat. Ketones are caused by the breakdown of fat when there isn’t enough insulin to allow the glucose (sugar) into your cells for energy. When ketones build up, the result is acidosis (too much acid in the blood). If not treated, this can lead to death. More: https://www.breakthrought1d.org/news-and-updates/ketones-diabetic-ketoacidosis/');
}, {
	cooldown: 30
});

// --- !endraffle ---
commandList.addTrigger("endraffle", async(channel, args, msg, user) => {
	if(!creditRaffle.active) {
		await reply(channel, msg, '⚠️ No Gamba Credit raffle is in progress. Use !startraffle to start one.');
		return;
	}
	
	await creditRaffle.end();
}, {
	whitelist: ["broadcaster", "mod"],
	cooldown: 10,
	respondWithCooldownMessage: true
});

// --- !f2kr ---
commandList.addTrigger("f2kr", async(channel, args, msg, user) => {
	if(!args.length) {
		await reply(channel, msg, "For a list of music that can be requested during non-rhythm-game gameplay, see https://theblackparrot.me/foobar2k (press the code on the left to copy a chat command that can be pasted here!)");
		return;
	}

	if(args[0].length != 7 || !(/^[0-9A-F]{7}$/i.test(args[0]))) {
		await reply(channel, msg, `⚠️ Request code must be 7 hexadecimal characters in length.`);
		return;
	}

	const track = await foobar2000.enqueueTrack(args[0].toLowerCase(), false);
	if(track) {
		await reply(channel, msg, `Queued "${track.title}" by ${track.artist} (from "${track.album}") at position #${track.queuePosition}`);
	} else {
		await reply(channel, msg, `⚠️ Could not enqueue track.`);
	}
}, {
	aliases: ["f2kreq", "f2ksr", "rf2k", "srf2k", "reqf2k", "f2krequest", "requestf2k", "fb2kr"],
	userCooldown: 10,
	respondWithCooldownMessage: true
});

// --- !flip ---
commandList.addTrigger("flip", async(channel, args, msg, user) => {
	await reply(channel, msg, `You flip a coin, it lands on ${Math.round(Math.random()) ? "heads" : "tails"}!`);
}, {
	aliases: ["coin", "coinflip", "flipcoin"],
	userCooldown: 5
});

// --- !foobar ---
commandList.addTrigger("foobar", async(channel, args, msg, user) => {
	const track = await foobar2000.getCurrentTrack();
	if(track) {
		await reply(channel, msg, `Current song: "${track.title}" by ${track.artist} (from "${track.album}")${"spotifyURL" in track ? ` -- ${track.spotifyURL}` : ""}`);
	} else {
		await reply(channel, msg, `⚠️ Could not fetch data from foobar2000.`);
	}
}, {
	aliases: ["foobar2k", "fb2k"],
	cooldown: 10
});

// --- !github ---
commandList.addTrigger("github", async(channel, args, msg, user) => {
	await reply(channel, msg, 'https://github.com/TheBlackParrot');
}, {
	aliases: ["mods", "srxdmods", "gh", "code"],
	cooldown: 10
});

// --- !give ---
commandList.addTrigger("give", async(channel, args, msg, user) => {
	const crownHolder = rulerOfTheRedeem.crownHolder;

	if(crownHolder.id != user.userId) {
		await reply(channel, msg, "The crown is not yours to give!");
		return;
	}

	if(!args.length) {
		return;
	}

	const userCheck = await apiClient.users.getUserByName(args[0].replace("@", "").toLowerCase());

	if(!userCheck) {
		await reply(channel, msg, "⚠️ Could not find any users matching that username");
		return;
	}

	if(user.userId == userCheck.id) {
		await reply(channel, msg, "You already have the crown!");
		return;
	}

	await rulerOfTheRedeem.swapHands({ userId: userCheck.id, userName: userCheck.name }); // guh
	await say(channel, `${user.displayName} has given the crown to ${userCheck.displayName}! That's so sweet, awww!`);
}, {
	cooldown: 10,
	respondWithCooldownMessage: true
});

// --- !insulin ---
commandList.addTrigger("insulin", async(channel, args, msg, user) => {
	await say(channel, 'Insulin helps regulate blood-sugar levels throughout the day and night, a key to managing diabetes. People with type 1 diabetes (T1D) rely on insulin therapy to help manage their blood-glucose levels. While insulin therapy keeps people with T1D alive, it is not a cure, nor does it prevent the possibility of T1D’s serious side effects. Learn more: https://www.breakthrought1d.org/t1d-basics/insulin/');
}, {
	cooldown: 30
})

// --- !link ---
commandList.addTrigger("link", async(channel, args, msg, user) => {
	if(currentOBSSceneName.split(" ")[0] == "SRXD") {
		let response = await querySRXD('history', '', { limit: 1 });
		if(!response) {
			await reply(channel, msg, "⚠️ Could not query SpinRequests.");
		} else if("data" in response) {
			if(response.data.length) {
				await reply(channel, msg, formatSRXDLinkResponse(response.data[0], "Current chart: "));
			}
		}
	} else {
		await commandList.get("foobar").trigger(channel, args, msg, user);
	}
}, {
	aliases: ["song", "chart"],
	cooldown: 10
});

// --- !low ---
commandList.addTrigger("low", async(channel, args, msg, user) => {
	// todo: automatically pin this
	await say(channel, 'Parrot\'s having a low blood sugar episode (hypoglycemia), he\'s a type 1 diabetic so this happens sometimes, and it makes his brain go brr. He\'s fixing it right now, and will be back shortly! (If you heard beeping, this is his insulin pump screaming at him to fix it. He\'s not in any danger! (unless he very obviously is)');
}, {
	whitelist: ["broadcaster", "mod", "vip"],
	cooldown: 30
});

// --- !man ---
commandList.addTrigger("man", async(channel, args, msg, user) => {
	counter.increment("man", 1);
	await say(channel, `MANHORSE x${counter.get("man").toLocaleString()}`);
}, {
	whitelist: ["broadcaster", "mod", "vip"],
	cooldown: 10
});

// --- !modadd ---
commandList.addTrigger("modadd", async(channel, args, msg, user) => {
	if(!args.length) {
		return;
	}

	let queryString = args.join(" ").replace("https://spinsha.re/song/", "");
	queryString = queryString.replace("spinshare://chart/", "");

	let addResponse = await querySRXD('add', queryString, { user: user.displayName, service: "twitch" });

	if(!addResponse) {
		await reply(channel, msg, "⚠️ Could not query SpinRequests.");
	} else if("data" in addResponse) {
		if("message" in addResponse.data) { return await reply(channel, msg, `⚠️ Something went wrong: ${addResponse.data.message}`); }
		await reply(channel, msg, `🆗 ${formatSRXDLinkResponse(addResponse.data, "Added ", true)} to the queue.`);
		sound.play("sounds/notif.wav", { volume: 0.9 });
	}
}, {
	whitelist: ["broadcaster", "mod", "vip"],
	respondWithCooldownMessage: true
});

// --- !music ---
commandList.addTrigger("music", async(channel, args, msg, user) => {
	await reply(channel, msg, 'https://music.theblackparrot.me (all music I have copyright control over is stream safe!)');
}, {
	cooldown: 10
});

// --- !note ---
commandList.addTrigger("note", async(channel, args, msg, user) => {
	if(!args.length) {
		return;
	}

	const moreUserInfo = await apiClient.users.getUserById(user.userId);
	if(moreUserInfo == null) {
		await reply(channel, msg, `⚠️ Could not fetch your user information (erm @${broadcasterUser.name})`);
		return;
	}

	await postToWebhook("noteChannel", {
		embeds: [
			{
				color: 16777215,
				author: {
					name: ensureEnglishName(user),
					icon_url: moreUserInfo.profilePictureUrl,
				},
				fields: [
					{
						"name": "",
						"inline": true,
						"value": args.join(" ")
					}
				]
			}
		]
	});

	await reply(channel, msg, "NOTED");
}, {
	whitelist: ["broadcaster", "mod", "vip"],
	cooldown: 3
});

// --- !overlays ---
commandList.addTrigger("overlays", async(channel, args, msg, user) => {
	await reply(channel, msg, 'All of the overlays you see on stream are my own creation, you can also use them if you\'d like! https://theblackparrot.me/overlays');
}, {
	cooldown: 10
});

// --- !prevlink ---
commandList.addTrigger("prevlink", async(channel, args, msg, user) => {
	let response = await querySRXD('history', '', { limit: 2 });

	if(!response) {
		await reply(channel, msg, "⚠️ Could not query SpinRequests.");
	} else if("data" in response) {
		if(response.data.length === 2) {
			await reply(channel, msg, formatSRXDLinkResponse(response.data[1], "Previous chart: "));
		} else {
			await reply(channel, msg, "⚠️ No data");
		}
	}
}, {
	aliases: ["prevsong", "prevchart", "prev", "previous"],
	cooldown: 10
});

// --- !pronouns ---
commandList.addTrigger("pronouns", async(channel, args, msg, user) => {
	await reply(channel, msg, 'I use he/they pronouns, either works! -- Pronoun tags are available through 3rd party extensions: https://pr.alejo.io (also available in FrankerFaceZ!)');
}, {
	cooldown: 10
});

// --- !r ---
commandList.addTrigger("r", async(channel, args, msg, user) => {
	await reply(channel, msg, 'To request maps, in your Internet browser of choice, navigate to https://spinsha.re and search for the map you want to see me play. Copy the numeric ID at the end of the link or the link itself with "!srxd" before it (e.g. "!srxd 12345"). You can also just paste the link! Or try using search terms!');
	await reply(channel, msg, 'Base game and DLC maps can also be requested using their identifiers seen in-game. For a list of these maps, see this link: https://github.com/TheBlackParrot/SpinRequests/wiki');
}, {
	aliases: ["rhelp", "requests", "srxdhelp", "helpsrxd", "reqs", "howto"],
	cooldown: 15
});

// --- !random ---
commandList.addTrigger("random", async(channel, args, msg, user) => {
	var min = 1;
	var max = 10;
	
	if(args.length == 1) {
		max = Math.abs(parseInt(args[0]));
	} else if(args.length == 2) {
		min = Math.abs(parseInt(args[0]));
		max = Math.abs(parseInt(args[1]));
	}

	if(max < min) {
		let oldMin = min;
		let oldMax = max;

		min = oldMax;
		max = oldMin;
	}

	if(max == min) {
		await reply(channel, msg, `...but that's the only option? erm...`);
		return;
	}

	if(max - min <= 1) {
		await reply(channel, msg, `erm, how is there only one side...`);
		return;
	}

	await reply(channel, msg, `You roll a ${(max - min) + 1}-sided die numbered ${min} to ${max}, it lands on ${min + (Math.floor(Math.random() * max))}!`);
}, {
	aliases: ["dice", "roll", "rolldice", "diceroll", "rand", "number", "num"],
	userCooldown: 5
});

// --- !rafjoin ---
commandList.addTrigger("rafjoin", async(channel, args, msg, user) => {
	if(!creditRaffle.active) {
		await reply(channel, msg, "No Gamba Credit raffle is going on right now!");
		return;
	}

	if(!creditRaffle.addUser(user)) {
		await reply(channel, msg, "You've already joined the Gamba Credit raffle!");
		return;
	}

	await remoteSound.play("rafjoin", 0.6, [0.75, 1.1]);
}, {
	userCooldown: 10
});

// --- !ratjoin ---
commandList.addTrigger("ratjoin", async(channel, args, msg, user) => {
	await say(channel, 'ratdancinglikeahumanwhaaathowisthatevenhappening');
});

// --- !request ---
commandList.addTrigger("request", async(channel, args, msg, user) => {
	if(!args.length) {
		commandList.get("r").trigger(channel, args, msg, user);
		return;
	}

	let queryString = args.join(" ").replace("https://spinsha.re/song/", "");
	queryString = queryString.replace("spinshare://chart/", "");

	let response = await querySRXD('query', queryString);

	if(!response) {
		await reply(channel, msg, "⚠️ Could not query SpinRequests.");
	} else if("data" in response) {
		if("message" in response.data) { return await reply(channel, msg, `⚠️ Something went wrong: ${response.data.message}`); }
		if(response.data.HasPlayed) { return await reply(channel, msg, '⚠️ This map has already been played this session!'); }
		if(response.data.InQueue) { return await reply(channel, msg, '⚠️ This map is already in the queue!'); }
		if(response.data.UploadTime != null && response.data.IsCustom) {
			const minimumAgeInSeconds = 43200;

			if(Date.now() / 1000 < response.data.UploadTime + minimumAgeInSeconds) {
				return await reply(channel, msg, `⚠️ This map is too new, it must be at least ${Math.floor(minimumAgeInSeconds / 60 / 60)} hours old. Moderators can manually add the map to the queue if need be.`);
			}
		}

		let addResponse = await querySRXD('add', queryString, { user: user.displayName, service: "twitch" });
		if(!addResponse) {
			await reply(channel, msg, "⚠️ Could not query SpinRequests.");
		} else if("data" in addResponse) {
			if("message" in addResponse.data) { return await reply(channel, msg, `⚠️ Something went wrong: ${addResponse.data.message}`); }
			await reply(channel, msg, `🆗 ${formatSRXDLinkResponse(addResponse.data, "Added ", true)} to the queue.`);
			sound.play("sounds/notif.wav", { volume: 0.9 });
		}
	}
}, {
	aliases: ["srxd", "req", "bsr", "sr", "add", "ssr"],
	userCooldown: 10,
	respondWithCooldownMessage: true
});

// --- !rotr ---
commandList.addTrigger("rotr", async(channel, args, msg, user) => {
	const value = await getLeaderboardValueFromUserTarget(channel, args, msg, user, "Ruler of the Redeem");

	if(value != null) {
		const hours = Math.floor(value.value / 60 / 60);
		const minutes = Math.floor(value.value / 60) % 60;
		const seconds = value.value % 60;

		await reply(channel, msg, `${value.userId == user.userId ? "You have" : `${value.userDisplayName} has`} been Ruler of the Redeem for ${hours}h ${minutes}m ${seconds}s`);
	}
}, {
	userCooldown: 5,
	respondWithCooldownMessage: true
});

// --- !ruler ---
commandList.addTrigger("ruler", async(channel, args, msg, user) => {
	const crownHolder = rulerOfTheRedeem.crownHolder;
	await reply(channel, msg, `${crownHolder.name == null ? "No one" : crownHolder.name} currently holds the crown`);
}, {
	cooldown: 5
});

// --- !smack ---
commandList.addTrigger("smack", async(channel, args, msg, user) => {
	counter.increment("smack", 1);
	await say(channel, `Parrot has hit himself ${counter.get("smack").toLocaleString()} times jermaSlap`);
}, {
	whitelist: ["broadcaster", "mod", "vip"],
	aliases: ["slap", "hit", "selfown"],
	cooldown: 10
});

// --- !snooze ---
commandList.addTrigger("snooze", async(channel, args, msg, user) => {
	try {
		await apiClient.channels.snoozeNextAd(broadcasterUser.id);
	} catch(err) {
		console.error(err);
		await reply(channel, msg, "⚠️ Failed to snooze ads");
		return;
	}

	await reply(channel, msg, "🆗 Snoozed the next scheduled ad break for 5 minutes");
}, {
	whitelist: ["broadcaster", "mod"],
	aliases: ["snoozeads", "delayads", "snoozead", "delayad"],
	cooldown: 30,
	respondWithCooldownMessage: true
});

// --- !so ---
commandList.addTrigger("so", async(channel, args, msg, user) => {
	const targetUser = await getTargetedUser(channel, args[0], msg);
	if(targetUser == null) {
		return;
	}

	try {
		await apiClient.chat.shoutoutUser(broadcasterUser.id, targetUser.userId);
	} catch(err) {
		await reply(channel, msg, `⚠️ Could not shout out ${targetUser.userDisplayName}`);
	}
}, {
	whitelist: ["broadcaster", "mod"],
	aliases: ["shoutout", "sso", "cso"],
	cooldown: 60,
	respondWithCooldownMessage: true
});

// --- !specs ---
commandList.addTrigger("specs", async(channel, args, msg, user) => {
	let parts = {
		"CPU": "AMD Ryzen 5 7600X @ 4.7GHz",
		"RAM": "32GB (2x16GB) Team Group UD5-6000 DDR5-6000",
		"GPU": "AMD Radeon RX 6800XT (Reference)",
		"Motherboard": "ASRock B650M-HDV/M.2",
		"VR stuff": "Valve Index w/ Knuckles Controllers, 2x Tundra Trackers, 2x SlimeVR trackers, 4x SteamVR 2.0 Base Stations"
	};

	let output = [];
	for(const item of parts) {
		output.push(`${item}: ${parts[item]}`);
	}

	await reply(channel, msg, output.join(" || "));
}, {
	aliases: ["specifications", "parts", "pc", "computer", "rig"],
	cooldown: 10
});

// --- !spotify ---
commandList.addTrigger("spotify", async(channel, args, msg, user) => {
	await reply(channel, msg, 'https://open.spotify.com/playlist/0vWRNK92hhY94uluS2QfGx || copyright-safer version: https://open.spotify.com/playlist/5kORwNmoeKMOa4XJiAmf6X');
}, {
	cooldown: 10
});

// --- !startraffle ---
commandList.addTrigger("startraffle", async(channel, args, msg, user) => {
	if(creditRaffle.active) {
		await reply(channel, msg, '⚠️ A Gamba Credit raffle is already in progress. Use !endraffle to end it, or !cancelraffle to cancel it.');
		return;
	}

	await creditRaffle.start();
}, {
	whitelist: ["broadcaster", "mod"],
	cooldown: 10,
	respondWithCooldownMessage: true
});

// --- !steam ---
commandList.addTrigger("steam", async(channel, args, msg, user) => {
	await reply(channel, msg, 'https://steamcommunity.com/id/TheBlackParrot');
}, {
	cooldown: 10
});

// --- !streamonline ---
commandList.addTrigger("streamonline", async(channel, args, msg, user) => {
	triggerTwitchStreamOnlineEvents();
}, {
	whitelist: ["broadcaster"]
});

// --- !t1d ---
commandList.addTrigger("t1d", async(channel, args, msg, user) => {
	await say(channel, 'Type 1 diabetes (T1D) is an autoimmune disease in which insulin-producing beta cells in the pancreas are mistakenly destroyed by the body’s immune system. People with T1D are dependent on injected or pumped insulin to survive. Its causes are not fully known, and there is currently no cure. Learn more: https://www.breakthrought1d.org/t1d-basics/');
}, {
	cooldown: 30
});

// --- !t2d ---
commandList.addTrigger("t2d", async(channel, args, msg, user) => {
	await say(channel, 'Type 2 diabetes (T2D) is a metabolic disorder in which a person’s body still produces insulin but is unable to use it effectively. T2D is often diagnosed later in life and can be due to genetic predisposition or behavior. It can often be managed with diet and exercise or medication. More serious cases may require insulin therapy. Learn more: https://www.breakthrought1d.org/news-and-updates/type-1-diabetes-vs-type-2-diabetes/');
}, {
	cooldown: 30
});

// --- !telegram ---
commandList.addTrigger("telegram", async(channel, args, msg, user) => {
	await replay(channel, msg, 'Telegram Group: https://t.me/+4dg5pw6oiy84N2Jh (mostly used for stream notifications)');
}, {
	cooldown: 10
});

// --- !thrown ---
commandList.addTrigger("thrown", async(channel, args, msg, user) => {
	const value = await getLeaderboardValueFromUserTarget(channel, args, msg, user, "Items Thrown");
	if(value != null) {
		await reply(channel, msg, `${value.userId == user.userId ? "You have" : `${value.userDisplayName} has`} thrown ${value.value.toLocaleString()} ${value.value != 1 ? "items" : "item"} at me`);
	}
}, {
	userCooldown: 5,
	respondWithCooldownMessage: true
});

// --- !tipping ---
commandList.addTrigger("tipping", async(channel, args, msg, user) => {
	await say(channel, 'Streamlabs: https://streamlabs.com/theblackparrot/tip || StreamElements: https://streamelements.com/theblackparrot/tip || Ko-fi: https://ko-fi.com/septilateral');
}, {
	aliases: ["tip", "donate", "kofi", "streamlabs", "streamelements"],
	cooldown: 10
});

// --- !toggleswapping ---
commandList.addTrigger("toggleswapping", async(channel, args, msg, user) => {
	allowBejeweled = !allowBejeweled;
	await reply(channel, msg, `Gem swapping is now ${allowBejeweled ? "enabled SkeletonPls" : "disabled SkeletonPause"}`);
}, {
	whitelist: ["broadcaster", "mod"]
});

// --- !uptime ---
commandList.addTrigger("uptime", async(channel, args, msg, user) => {
	const response = await obs.call('GetStreamStatus');

	if(response.outputActive) {
		const allSeconds = Math.ceil(response.outputDuration / 1000);

		const hours = Math.floor(allSeconds / 60 / 60);
		const minutes = Math.floor(allSeconds / 60) % 60;
		const seconds = allSeconds % 60;

		await reply(channel, msg, `The stream has been going for ${hours}h ${minutes}m ${seconds}s`);
	} else {
		await reply(channel, msg, "⚠️ The stream is currently offline.");
	}
}, {
	cooldown: 10
});

// --- !vnyan ---
commandList.addTrigger("vnyan", async(channel, args, msg, user) => {
	await reply(channel, msg, 'VNyan is what I use to render my avatar over the game I\'m playing, it\'s available for free! https://suvidriel.itch.io/vnyan');
}, {
	cooldown: 10
});

// --- !vnyandeath ---
// (temporary until VNyan adds support for sending HTTP requests)
const deathRemarks = ["This is so sad.", "Devastating.", "My condolences.", "What a loss.", "How could this happen?",
					 "Can we get 100 likes?", "Alexa, play Despacito.", "lik dis if u cri evrytim", "Tears are being shed."];

commandList.addTrigger("vnyandeath", async(channel, args, msg, user) => {
	counter.increment("death", 1);
	await say(channel, `Parrot has died ${counter.get("death").toLocaleString()} times. ${deathRemarks[Math.floor(Math.random() * deathRemarks.length)]}`);
}, {
	whitelist: ["broadcaster", "mod"],
	cooldown: 10
});

// --- !vrc ---
/*commandList.addTrigger("vrc", async(channel, args, msg, user) => {
	await reply(channel, msg, 'https://vrc.group/TBP.1829 (IGN: TheBlackParrot) (If I\'m comfortable with you, I\'ll give you a role upon joining the group and you can join the stream instances whenever)');
}, {
	cooldown: 10
});*/

// --- !weather ---
commandList.addTrigger("weather", async(channel, args, msg, user) => {
	let unit = "f";
	let windUnit = "mph";
	if(args.length) {
		if(args[0].toLowerCase().startsWith("c") || args[0].toLowerCase().startsWith("m")) {
			unit = "c";
			windUnit = "kph";
		}
	}

	let url = new URL('/v1/current.json', 'https://api.weatherapi.com/');
	let params = new URLSearchParams({
		key: settings.auth.weatherAPI.key,
		q: settings.weather.location,
		aqi: "no"
	});
	url.search = params.toString();

	let response = await axios.get(url).catch((err) => {});
	if(!("data" in response)) {
		return;
	}

	let parts = [
		`Current weather for ${response.data.location.name}, ${response.data.location.region}:`,
		`${weatherConditionCodes[response.data.current.condition.code]} ${response.data.current.condition.text},`,
		`${Math.round(response.data.current[`temp_${unit}`])}°${unit.toUpperCase()}`,
		`(feels like ${Math.round(response.data.current[`feelslike_${unit}`])}°${unit.toUpperCase()}).`,
		`${response.data.current.wind_dir} winds of around ${Math.round(response.data.current[`wind_${windUnit}`])}${windUnit}`,
		`with gusts up to ${Math.round(response.data.current[`gust_${windUnit}`])}${windUnit}.`,
		`${Math.round(response.data.current.humidity)}% relative humidity with a dew point of ${Math.round(response.data.current[`dewpoint_${unit}`])}°${unit.toUpperCase()}.`
	];

	await reply(channel, msg, parts.join(" "));
}, {
	cooldown: 300,
	userCooldown: 1800,
	respondWithCooldownMessage: true
});

// ====== SOUND COMMANDS ======
for(const soundCommandName in soundCommands) {
	let params = soundCommands[soundCommandName];

	if(params.regex) {
		commandList.addRegex(soundCommandName, async(channel, args, msg, user) => {
			await remoteSound.play(params.filename, ("volume" in params ? params.volume : 1), ("pitch" in params ? params.pitch : [1, 1]));
		}, {
			caseInsensitive: "caseInsensitive" in params ? params.caseInsensitive : true,
			userCooldown: "cooldown" in params ? params.cooldown : 5,
		});
	} else {
		commandList.addTrigger(soundCommandName, async(channel, args, msg, user) => {
			await remoteSound.play(("filename" in params ? params.filename : soundCommandName), ("volume" in params ? params.volume : 1), ("pitch" in params ? params.pitch : [1, 1]));
		}, {
			userCooldown: "cooldown" in params ? params.cooldown : 5
		});
	}
}

// ====== REGEX TRIGGERS ======

const crazyStrings = [
	"Crazy?",
	"I was crazy once.",
	"They locked me in a room.",
	"A rubber room.",
	"A rubber room with rats.",
	"And rats make me crazy."
];

const frfrStrings = ["yeah", "oh yeah", "so true", "sooo true", "omg", "mhm", "i agree", "agreed", "yep",
					"yes", "definitely", "oh yes", "frfr", "for real", "for real for real", "couldn't agree more",
					"i concur", "uh-huh", "i can agree with that", "for sure", "true"];
const frfrEmotes = ["mhmyep", "NODDERS", "catYep", "kermitNod", "pikaSquish", "Periodt", "Mhmmm", "TRUE"];

// matches any instance of "crazy"
commandList.addRegex("crazy", async(channel, args, msg, user) => {
	await say(channel, crazyStrings[Math.floor(Math.random() * crazyStrings.length)]);
});

// matches anyone asking why the category changes on an interval
commandList.addRegex(`why\\s.*\\s(change|swap)\\s.*(category|categories|game|games)`, async(channel, args, msg, user) => {
	await reply(channel, msg, 'I swap categories between Spin Rhythm XD and Games + Demos in order to get more eyes on the game and the stream while in Games + Demos, and to appear in the Spin Rhythm category for those browsing via categories.');
}, {
	cooldown: 30,
	aliases: [`why\\s(change|swap)\\s.*(category|categories|game|games)`]
});

// i don't like being called this
commandList.addRegex("blacky", async(channel, args, msg, user) => {
	await reply(channel, msg, 'Please call me Parrot, thanks! This term has some racial connotations I\'m uncomfortable with. Parrot doesn\'t, it\'s merely a bird. 🦜');
}, {
	aliases: ["blackie"]
});

// matches people complaining about ads
commandList.addRegex(`[0-9]\\sads`, async(channel, args, msg, user) => {
	await reply(channel, msg, 'Instead of complaining, take care of yourself a little bit! Get a snack, hydrate, use the restroom, take your meds, do tiny things you need to do! You won\'t miss anything, nothing\'s going on for the next few minutes! DonoWall');
}, {
	userCooldown: 30
});

// matches people asking about the overlays
commandList.addRegex(`(where|can i)\\s.*\\s(get|find)\\s.*\\s(overlay|overlays)`, async(channel, args, msg, user) => {
	commandList.get("overlays").trigger(channel, args, msg, user);
}, {
	cooldown: 30
});

// matches people asking about vnyan
commandList.addRegex(`(wat|what)\\s.*\\s(use)\\s.*\\s(show|render)\\s.*\\s(avatar|oc|character|fursona|yourself|urself|model)`, async(channel, args, msg, user) => {
	commandList.get("vnyan").trigger(channel, args, msg, user);
}, {
	aliases: [`how\\s(do|do\syou|you)\\s.*\\s(show|render)\\s.*\\s(avatar|oc|character|fursona|yourself|urself|model)`],
	cooldown: 30
});

// automatically agrees with any instance of people flattering me
commandList.addRegex(`^(parrot|null|tox|septi)\\s.*(cute|adorable|pretty|handsome|beautiful)`, async(channel, args, msg, user) => {
	await say(channel, `${frfrStrings[Math.floor(Math.random() * frfrStrings.length)]} ${frfrStrings[Math.floor(Math.random() * frfrStrings.length)]} ${frfrEmotes[Math.floor(Math.random() * frfrEmotes.length)]}`);
}, {
	aliases: [
		`^(parrot|null|tox|septi)s\\s.*(cute|adorable|pretty|handsome|beautiful)`,
		`^(parrot|null|tox|septi)'s\\s.*(cute|adorable|pretty|handsome|beautiful)`
	],
	userCooldown: 10
});

// condescendingly replies to people asking if i'm a furry
commandList.addRegex(`^(are|r)\\s(you|u)\\s.*(fur|fury|furry|furrie|furre)`, async(channel, args, msg, user) => {
	await reply(channel, msg, 'no of course not, what makes you think such a thing? FlatEricHuh');
}, {
	cooldown: 30
});

// tells people how to request maps
commandList.addRegex(`^(do|play|try)\\s.*\\s(song|pls|please|plz|plx)`, async(channel, args, msg, user) => {
	commandList.get("r").trigger(channel, args, msg, user);
}, {
	aliases: [
		`^can\\syou\\s(do|play|try)\\s.*`,
		`how\\s.*\\s(request|add)`
	],
	cooldown: 30
});

// choppy audio response
commandList.addRegex(`(audio|music)\\s.*\\s(choppy|crackly|chopping|crackling)`, async(channel, args, msg, user) => {
	await reply(channel, msg, "It's a Windows audio bug. It will fix itself shortly, give it a minute!");
}, {
	aliases: [
		`(choppy|crackly|chopping|crackling)\\s(audio|music)`,
		`(audio|music)\\s(choppy|crackly|chopping|crackling)`
	],
	cooldown: 30
});

// ====== CHAT STUFF ======

const uniEmotes = ["boobsPolite", "boobsFlower", "BigBoobsStare", "bigboobs"];

const hypeEmotes = ["OOOO", "GIGACHAD", "MONKE", "POLICE", "catKISS", "WEEWOO", "SkeletonPls", "hypeE", "LETSGOOO",
				   "StickBug", "AOLpls", "BASED", "BirbWobble", "birdieHype", "blobWobble", "bongoSmash", "BRUHBRUH",
				   "BulbaHype", "CATCHESTING", "catHYPE", "CatShake", "FallGuyRun", "FIREGIF", "FLOPPA", "FoxBobble",
				   "FoxJump", "gooseDance", "HeCrazy", "HyperNeko", "jermaSlay", "mewFLIP", "monkaW", "monkE",
				   "monkeyDriving", "MOOOO", "Panela", "PANIC", "pikaOMG", "PINGED", "PipCheer", "ppHop", "squirrelRAGE",
				   "StockExplosion", "ThisIsFine", "TwinkleSTEP", "YIPPEE"];

const chatClient = new ChatClient({
	authProvider,
	channels: ['theblackparrot']
});

global.botUserName = "";

var initialCategory = null;
var seenUsers = [];

async function say(channel, text) {
	await chatClient.say(channel, text);
}
global.say = say;
async function reply(channel, originalMsg, text) {
	await chatClient.say(channel, text, { replyTo: originalMsg });
}
global.reply = reply;

function hypeEmoteString(amount = 5) {
	let selectedEmote = hypeEmotes[Math.floor(Math.random() * hypeEmotes.length)];

	let output = [];
	for(let i = 0; i < amount; i++) {
		output.push(selectedEmote);
	}

	return output.join(" ");
}

function ensureEnglishName(user) {
	return user.displayName.replace(/[0-9a-z\-\_]/gi, '').length ? user.userName : user.displayName;
}

function getReadableTimeLeft(seconds) {
	if(seconds < 60) {
		return `${seconds} ${seconds != 1 ? "seconds" : "second"}`;
	}

	const minutes = Math.ceil(seconds / 60);
	return `${minutes} ${minutes != 1 ? "minutes" : "minute"}`;
}

async function messageHandler(channel, userString, text, msg) {
	let args = text.split(" ");

	if(args.length <= 0) {
		return;
	}

	global.log("", `${userString}: ${text}`, false, ['gray']);

	if(seenUsers.indexOf(msg.userInfo.userName) === -1) {
		seenUsers.push(msg.userInfo.userName);
		onUserFirstSeenForSession(channel, msg.userInfo, msg.isFirst);
	}

	if(msg.isRedemption) {
		return;
	}

	let commandName = "";
	if(!args[0].startsWith("!")) {
		if(text.startsWith("https://spinsha.re/song/") || text.startsWith("spinshare://chart/")) {
			commandName = "request";
			args[1] = args[0].replace("https://spinsha.re/song/", "");
			args[1] = args[1].replace("spinshare://chart/", "");
		}
	} else {
		commandName = args[0].substr(1);
	}

	let user = users.getUser(msg.userInfo.userId);

	let command = commandList.get(commandName);
	if(command == null) {
		command = commandList.getMatchedRegex(text);
	}

	if(command != null) {
		const isRegex = typeof(command.name) === "undefined";
		
		const triggerName = isRegex ? `(regex: ${command.regexStrings[0]})` : command.name;

		if(user.canUseCommand(command)) {
			if(command.canUse) {
				log("COMMANDS", `Running command ${triggerName} for ${msg.userInfo.userName}`);

				try {
					user.usedCommand(command);
					await command.trigger(channel, args.slice(1), msg, msg.userInfo);
				} catch(err) {
					console.error(err);
				}
			} else {
				log("COMMANDS", `Command ${triggerName} is on global cooldown`);

				if(command.respondWithCooldownMessage) {
					await reply(channel, msg, `This command is on cooldown (globally) for another ${getReadableTimeLeft(command.cooldownTimeLeft)}`);
				}
			}
		} else {
			log("COMMANDS", `Command ${triggerName} is on cooldown for ${msg.userInfo.userName}`);

			if(command.respondWithCooldownMessage) {
				await reply(channel, msg, `This command is on cooldown (for yourself) for another ${getReadableTimeLeft(user.cooldownTimeLeft(command))}`);
			}
		}

		if(isRegex) {
			if(command.fallThroughAsMessage) {
				onStandardMessage(channel, msg, text);
			}
		}
	} else {
		// not a command or regex, standard message
		onStandardMessage(channel, msg, text);
	}
}
const commandListener = chatClient.onMessage(messageHandler);

function onUserFirstSeenForSession(channel, user, isFirst) {
	const userData = users.getUser(user.userId);

	const ttsName = userData.getPersistentData("ttsName");
	tts(settings.tts.voices.system, `${ttsName ? ttsName : ensureEnglishName(user)} has entered the chat${isFirst ? " for the first time." : "."}`);
}

var previousMessageOwner = null;
var clearPreviousMessageOwnerTimeout;
async function onStandardMessage(channel, msgObject, message) {
	// user: https://twurple.js.org/reference/chat/classes/ChatUser.html

	const user = msgObject.userInfo;
	const emoteOffsets = msgObject.emoteOffsets;

	const emotes = parseEmotePositions(message, emoteOffsets);

	let filtered = message.split(" ").filter((part) => {
		for(const emote of emotes) {
			if(part == emote.name) {
				return false;
			}
		}

		// doing link checking here since we're looping through the entire message anyways, doesn't apply to those with a role
		if(part.indexOf(".") !== -1 && (part.startsWith('http:') || part.startsWith('https:')) && !(user.isMod || user.isVip || user.isBroadcaster)) {
			var url = null;

			try {
				url = new URL(part.toLowerCase());
			} catch(err) {
				// ignored
			}

			if(url) {
				const hostParts = url.hostname.split(".");
				// only need the domain and TLD
				const host = [hostParts[hostParts.length - 2], hostParts[hostParts.length - 1]].join(".");
				if(whitelistedDomains.indexOf(host) === -1) {
					reply(channel, msgObject, 'This internet domain is not whitelisted, sorry!');
					apiClient.moderation.deleteChatMessages(broadcasterUser.id, msgObject.id);
				}
			}
		}

		return !part.startsWith('http:') && !part.startsWith('https:'); // filter it anyways
	}).join(" ");
	filtered = global.emotes.getFilteredString(filtered);

	if(!filtered.replaceAll(" ", "").length) {
		return;
	}

	let wasGemSwap = false;
	if(allowBejeweled) {
		const parts = filtered.toLowerCase().split(" ");
		if(filtered.length == 5 && parts.length == 2) {
			let isSwapValid = true;

			for(const position of parts) {
				const row = position.charCodeAt(0);
				const column = position.charCodeAt(1);

				if(row < 97 && row > 104 && column < 49 && column > 56) {
					isSwapValid = false;
				}
			}

			if(isSwapValid) {
				wasGemSwap = true;
				exec(`${settings.bot.bejeweledSwapperLocation} ${parts.join(" ")}`, { windowsHide: true });
			}
		}
	}

	if(!(message.startsWith('@') || message.startsWith('!')) && !wasGemSwap && !(currentOBSSceneName == "Resonite" || currentOBSSceneName == "VRChat")) {

		const userData = users.getUser(user.userId);

		if(previousMessageOwner != user.userName) {
			const ttsName = userData.getPersistentData("ttsName");
			await tts(settings.tts.voices.names, ttsName ? ttsName : ensureEnglishName(user));
		}
		
		previousMessageOwner = user.userName;
		clearTimeout(clearPreviousMessageOwnerTimeout);
		clearPreviousMessageOwnerTimeout = setTimeout(clearPreviousMessageOwner, settings.tts.clearPreviousOwnerTimeout * 1000);

		const voice = userData.getPersistentData("ttsVoice");
		await tts(voice == null ? settings.tts.voices.messages : voice, filtered);
	}

	if(Math.floor(Math.random() * 1000) == 69) {
		say(channel, uniEmotes[Math.floor(Math.random() * uniEmotes.length)]);
	}
}
function clearPreviousMessageOwner() {
	// doing this to allow names through tts again from the same person, keeps context in my memory better
	clearTimeout(clearPreviousMessageOwnerTimeout);
	previousMessageOwner = null;
}

const vnyanOnlyRedeems = [
	'blep', 'Throw stuff at me', 'Drop a thing on my head', 'Throw a lot of stuff at me', 'yay!', 'Throw a bunch of hearts',
	'Give me a treat', 'E', '*metal pipe*', 'amogus', 'Drop a hat', 'balls'
];
const helloEmotes = ["ARISE", "FridayAwake", "PatArrive", "ARRIVE", "revUpThoseFryers"];
const helloMessages = ["hello chat!", "hi chat!", "omg hai :3", "i am awake", "hi there!", "hello there!", "(i enter the room)", "(i walk in)"];

chatClient.onJoin(async (channel, user) => {
	log("CHAT", `Joined channel #${channel} as ${user}`, false, ['whiteBright']);
	global.botUserName = user;

	log("COMMANDS", `There are ${commandList.length} registered commands, ${commandList.uniqueLength} of which are unique`, false, ['whiteBright']);
	log("COMMANDS", `There are ${commandList.regexLength} registered regex matchers, with ${commandList.uniqueRegexLength} unique functions`, false, ['whiteBright']);

	broadcasterUser = await apiClient.users.getUserByName(channel);
	if(broadcasterUser != null) {
		log("SYSTEM", `Got broadcaster information for ${channel}`);
		global.broadcasterUser = broadcasterUser;
		startEventSub();

		let channelInfo = await apiClient.channels.getChannelInfoById(broadcasterUser.id);
		initialCategory = channelInfo.gameName;
		previousCategory = channelInfo.gameName;
		previousTitle = channelInfo.title;
		log("SYSTEM", `Initial category is ${initialCategory}`);

		let allRedeems = await apiClient.channelPoints.getCustomRewards(broadcasterUser.id);
		for(const redeem of allRedeems) {
			redeemList.add(redeem);
		}
		log("SYSTEM", `Found ${redeemList.length} channel point redeems`);

		for(const redeemName in initialRedeemList) {
			const safeRedeemName = redeemName.substr(0, 45);

			if(redeemList.getByName(safeRedeemName) != null) {
				continue;
			}

			global.log("SYSTEM", `Defined channel point redeem "${safeRedeemName}" does not exist, creating it`, false, ['gray']);

			const initialData = initialRedeemList[safeRedeemName];
			const redeem = await apiClient.channelPoints.createCustomReward(broadcasterUser.id, {
				autoFulfill: "autoFulfill" in initialData ? initialData.autoFulfill : true,
				backgroundColor: "color" in initialData ? `#${initialData.color}` : "#000000",
				cost: "cost" in initialData ? initialData.cost : 6969,
				globalCooldown: "globalCooldown" in initialData ? initialData.globalCooldown : 0,
				isEnabled: false,
				maxRedemptionsPerStream: "maxRedemptionsPerStream" in initialData ? initialData.maxRedemptionsPerStream : 0,
				maxRedemptionsPerUserPerStream: "maxRedemptionsPerUserPerStream" in initialData ? initialData.maxRedemptionsPerUserPerStream : 0,
				prompt: "description" in initialData ? initialData.description.substr(0, 200) : "",
				title: safeRedeemName,
				userInputRequired: "userInputRequired" in initialData ? initialData.userInputRequired : false
			});

			redeemList.add(redeem);

			await delay(250);
		}

		for(const redeemName of vnyanOnlyRedeems) {
			await redeemList.getByName(redeemName).enable(initialCategory != "Resonite");
		}

		await redeemList.getByName("Flip a Coin").setCooldown(30); // can't do this on the twitch dashboard, so we do it here
		await rulerOfTheRedeem.enable(true);

		initSpinRequestsSocket();

		await say(broadcasterUser.name, `${helloEmotes[Math.floor(Math.random() * helloEmotes.length)]} ${helloMessages[Math.floor(Math.random() * helloMessages.length)]}`);
	}
});

chatClient.onRaid(async (channel, user, raidInfo, msg) => {
	let raiderInfo = await apiClient.users.getUserByName(user);
	let channelInfo = await apiClient.channels.getChannelInfoById(raiderInfo.id);
	
	tts(settings.tts.voices.system, `${user} raided the stream with ${raidInfo.viewerCount} ${raidInfo.viewerCount != 1 ? "viewers": "viewer"}! They were streaming ${channelInfo.gameName}.`);

	let hypeString = hypeEmoteString(2);
	say(channel, `${hypeString} Thank you @${raiderInfo.displayName} for the raid of ${raidInfo.viewerCount}! Also, hello raiders! SmileWave`);
	
	await apiClient.chat.shoutoutUser(broadcasterUser.id, raiderInfo.id);

	await updateLeaderboardValues(raiderInfo.userId, "Items Thrown", raidInfo.viewerCount);
	
	say(channel, '⚠️⚠️⚠️ THIS STREAM CONTAINS LOTS OF FLASHING AND POTENTIALLY STROBING LIGHTS. If you are sensitive to flashing lights I would advise switching the stream to audio-only mode or closing the stream. Viewer discretion is advised. ⚠️⚠️⚠️');
});
chatClient.onRaidCancel((channel, msg) => { 
	say(channel, "wait nevermind...");
});
chatClient.onSub((channel, user, subInfo, msg) => {
	if(seenUsers.indexOf(msg.userInfo.userName) === -1) {
		seenUsers.push(msg.userInfo.userName);
		onUserFirstSeenForSession(channel, msg.userInfo, msg.isFirst);
	}

	tts(settings.tts.voices.system, `${user} subscribed ${subInfo.isPrime ? "with Prime" : `at Tier ${Math.floor(subInfo.plan / 1000)}`} for ${subInfo.months} ${subInfo.months != 1 ? "months" : "month"}`);
	say(channel, hypeEmoteString());
})
chatClient.onResub((channel, user, subInfo, msg) => {
	if(seenUsers.indexOf(msg.userInfo.userName) === -1) {
		seenUsers.push(msg.userInfo.userName);
		onUserFirstSeenForSession(channel, msg.userInfo, msg.isFirst);
	}

	tts(settings.tts.voices.system, `${user} re-subscribed ${subInfo.isPrime ? "with Prime" : `at Tier ${Math.floor(subInfo.plan / 1000)}`} for ${subInfo.months} ${subInfo.months != 1 ? "months" : "month"}`);
	say(channel, hypeEmoteString());
})

// undefined is a possible key because of anonymous gifts
const giftCounts = new Map();

chatClient.onCommunitySub((channel, gifterName, giftInfo) => {
	const previousGiftCount = giftCounts.get(gifterName) ?? 0;
	giftCounts.set(gifterName, previousGiftCount + giftInfo.count);
	tts(settings.tts.voices.system, `${gifterName} gifted ${giftInfo.count != 1 ? `${giftInfo.count} subs` : 'a sub'}`);
	say(channel, hypeEmoteString());
});

chatClient.onSubGift((channel, recipientName, subInfo) => {
	const gifterName = subInfo.gifter;
	const previousGiftCount = giftCounts.get(gifterName) ?? 0;

	if (previousGiftCount > 0) {
		giftCounts.set(gifterName, previousGiftCount - 1);
	} else {
		tts(settings.tts.voices.system, `${gifterName} gifted a sub to ${recipientName}`);
		say(channel, hypeEmoteString());
	}
});

chatClient.connect();

// ====== EMOTES ======

global.emotes = new EmoteList();

const sevenTV = new SevenTV();
const bttv = new BetterTTV();
const ffz = new FrankerFaceZ();

// ====== REDEEM FUNCTIONS ======

const rulerOfTheRedeem = new RulerOfTheRedeem();

async function updateLeaderboardValues(userId, key, value, defaultValue = 0) {
	key = key.replaceAll(" ", "_");

	let url = new URL(settings.bot.leaderboard.update.path, settings.bot.leaderboard.update.root);
	let params = new URLSearchParams({
		id: userId,
		which: key.replaceAll(" ", "_"),
		value: value,
		default: defaultValue
	});
	url.search = params.toString();

	await axios.get(url).catch((err) => {
		global.log("LEADERBOARD", `Could not add ${value} to ${key} for ${userId}`, false, ['redBright']);
		console.error(err);
	});

	global.log("LEADERBOARD", `Added ${value} to ${key} for ${userId}`);
}
global.updateLeaderboardValues = updateLeaderboardValues;

async function getLeaderboardValue(userId, key) {
	let url = new URL(settings.bot.leaderboard.obtain.path, settings.bot.leaderboard.obtain.root);
	let params = new URLSearchParams({
		id: userId,
		which: key.replaceAll(" ", "_"),
		type: "plain"
	});
	url.search = params.toString();

	const response = await axios.get(url).catch((err) => {});

	if(response) {
		if(response.statusText == "OK") {
			return response.data;
		}
	}

	return null;
}

const avatarRedeemMap = {
	n: "Null",
	p: "Parrot",
	s: "Septi",
	t: "Tox"
};
var coinFlipOdds = 0.5;

const redeemFunctions = {
	// https://twurple.js.org/reference/eventsub-base/classes/EventSubChannelRedemptionAddEvent.html

	"Set TTS Voice": async function(event) {
		const message = event.input;

		let name = message.split(" ")[0];
		name = name.charAt(0).toUpperCase() + name.slice(1);

		if(allowedTTSVoices.indexOf(name) !== -1) {
			const user = users.getUser(event.userId);
			user.setPersistentData("ttsVoice", name);

			await say(broadcasterUser.name, `@${event.userDisplayName} 🆗 Your TTS voice is now ${name}`);
			await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], "FULFILLED");
		} else {
			await say(broadcasterUser.name, `@${event.userDisplayName} ⚠️ This is an invalid voice name, please see https://theblackparrot.me/tts for available choices and voice examples.`);
			await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], "CANCELED"); // it's cancelled!! not canceled!!! grrr
		}
	},

	"Set TTS Name": async function(event) {
		const message = event.input;
		const name = message.replace(/[^a-zA-Z0-9\s]/gi, '').substring(0, 80);

		const user = users.getUser(event.userId);
		user.setPersistentData("ttsName", name);

		await say(broadcasterUser.name, `@${event.userDisplayName} 🆗 I will call you this now, thanks for letting me know!`);
	},

	"Swap Avatars": async function(event) {
		const which = event.input[0].toLowerCase();

		if(!which in avatarRedeemMap) {
			await say(broadcasterUser.name, `@${event.userDisplayName} ⚠️ This is not a valid character name. You can find the character choices in the redeem's description.`);
			await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], "CANCELED");
			return;
		}

		const url = new URL('/', settings.vnyan.httpURL);

		await axios.post(url, {
			action: "SwapAvatars",
			payload: {
				avatar: which
			}
		}).catch((err) => {});
		await say(broadcasterUser.name, `@${event.userDisplayName} 🆗 Swapped to ${avatarRedeemMap[which]}`);
		await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], "FULFILLED");
	},

	"first": async function(event) {
		const redeems = [
			redeemList.getByName("first"),
			redeemList.getByName("second"),
			redeemList.getByName("third"),
		];

		let message;
		let wantedIdx;
		switch(event.rewardTitle) {
			case "first": message = "u winner YIPPEE"; wantedIdx = 1; break;
			case "second": message = "u also winner SealArrive"; wantedIdx = 2; break;
			case "third": message = "congrat you got here too okayipullup"; wantedIdx = 3; break;
		} // should disable all redeems on "third", as idx 3 doesn't exist

		await say(broadcasterUser.name, `@${event.userDisplayName} ${message}`);

		for(let idx = 0; idx < redeems.length; idx++) {
			await redeems[idx].enable(idx == wantedIdx)
		}
	},

	"Throw stuff at me": async function(event) {
		await updateLeaderboardValues(event.userId, "Items Thrown", 1);
	},
	"Throw a lot of stuff at me": async function(event) {
		await updateLeaderboardValues(event.userId, "Items Thrown", 20);
	},
	"Throw a bunch of hearts": async function(event) {
		await updateLeaderboardValues(event.userId, "Items Thrown", 12);
	},
	"E": async function(event) {
		await updateLeaderboardValues(event.userId, "Items Thrown", 15);
	},
	"amogus": async function(event) {
		await updateLeaderboardValues(event.userId, "Items Thrown", 15);
	},

	"Ruler of the Redeem": async function(event) {
		const correct = await rulerOfTheRedeem.attempt(event);
		await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], correct ? "FULFILLED" : "CANCELED");
	},
	"Force Refresh Ruler of the Redeem": async function(event) {
		await rulerOfTheRedeem.forceRefresh();
	},
	"GIVE ME THE CROWN RIGHT NOW!!!!!!! >:(((": async function(event) {
		await rulerOfTheRedeem.steal(event);
	},

	"Credit Exchange": async function(event) {
		await updateLeaderboardValues(event.userId, "Gamba Credits", 100);
		
		const newAmount = await getLeaderboardValue(event.userId, "Gamba Credits");
		await say(broadcasterUser.name, `@${event.userDisplayName} You now have ${newAmount.toLocaleString()} Gamba Credits`);
	},
	"Flip a Coin": async function(event) {
		const args = event.input.split(" ");
		if(!args.length) {
			await say(broadcasterUser.name, `@${event.userDisplayName} ⚠️ Please input a wager as the first word/argument, and then "h" or "t" as the second word/argument (or anything starting with those letters, e.g. "200 h").`);
			await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], "CANCELED");
			return;
		}

		const wager = +(args[0].replaceAll(",", "").split(".")[0]);
		if(isNaN(wager)) {
			await say(broadcasterUser.name, `@${event.userDisplayName} ⚠️ This wager is not a valid whole number.`);
			await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], "CANCELED");
			return;
		}
		if(wager <= 0) {
			await say(broadcasterUser.name, `@${event.userDisplayName} ⚠️ You must wager a positive value above 0.`);
			await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], "CANCELED");
			return;
		}

		const userHas = await getLeaderboardValue(event.userId, "Gamba Credits");
		if(wager > userHas) {
			await say(broadcasterUser.name, `@${event.userDisplayName} ⚠️ You can only wager a maximum of ${userHas.toLocaleString()} credits.`);
			await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], "CANCELED");
			return;
		}

		const minWager = Math.floor(userHas * 0.005);
		if(wager < minWager) {
			await say(broadcasterUser.name, `@${event.userDisplayName} ⚠️ You must wager at least 0.5% of your total credits, (which would be ${minWager.toLocaleString()} credits) PayUp`);
			await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], "CANCELED");
			return;
		}

		await apiClient.channelPoints.updateRedemptionStatusByIds(broadcasterUser.id, event.rewardId, [event.id], "FULFILLED");
		await remoteSound.play("insertcoin");

		let whichSide = "";

		if(args.length >= 2) {
			whichSide = args[1].toLowerCase()[0];
		}
		if(!(whichSide === "h" || whichSide === "t")) {
			whichSide = (Math.floor(Math.random() * 2) % 2) ? "h" : "t";
		}

		await say(broadcasterUser.name, `@${event.userDisplayName} flips a coin... CoinTime hopefully it lands on ${whichSide === "h" ? "Heads" : "Tails"}! NAILS`);
		await delay(5000 + (Math.random() * 7000));

		const result = Math.random() >= coinFlipOdds ? "t" : "h";

		if(result === whichSide) {
			await say(broadcasterUser.name, `@${event.userDisplayName} ...it lands on ${result === "h" ? "Heads" : "Tails"}! You win ${(wager * 2).toLocaleString()} Gamba Credits. OOOO`);
			await updateLeaderboardValues(event.userId, "Gamba Credits", wager);
			await remoteSound.play("win", 0.7);
		} else {
			await say(broadcasterUser.name, `@${event.userDisplayName} ...it lands on ${result === "h" ? "Heads" : "Tails"}! Oh no! You lost ${wager.toLocaleString()} Gamba Credits. Better luck next time! LETSGOGAMBLING`);
			await updateLeaderboardValues(event.userId, "Gamba Credits", wager * -1);
			await remoteSound.play("awdangit", 0.7, [0.9, 1.1]);
		}

		coinFlipOdds += ((2 + Math.floor(Math.random() * 5)) / 100) * (result === "h" ? -1 : 1);
		coinFlipOdds = Math.min(0.85, Math.max(0.15, coinFlipOdds));

		const readableOdds = Math.floor(coinFlipOdds * 100);
		global.log("GAMBA", `Result: ${result === "h" ? "Heads" : "Tails"} (odds: ${readableOdds}% heads, ${100 - readableOdds}% tails)`);
	},
	"gib coin hint pls?": async function(event) {
		const readableOdds = Math.floor(coinFlipOdds * 100);
		await say(broadcasterUser.name, `Current Coin Flip odds: ${readableOdds}% heads, ${100 - readableOdds}% tails EZ`);
	}
};
redeemFunctions["second"] = redeemFunctions["first"];
redeemFunctions["third"] = redeemFunctions["first"];

// ====== EVENTSUB STUFF ======

const thanksParts = [
	["Thanks", "Thank you", "Thanks so much", "Thank you so much"],
	["hello", "hey", "hi"]
];

function onBitsCheered(bits, message) {
	log("EVENTSUB", `${message.chatterName} cheered ${bits} ${bits != 1 ? "bits" : "bit"}`, false, ['whiteBright']);

	tts(settings.tts.voices.system, `${message.chatterName} cheered ${bits} ${bits != 1 ? "bits" : "bit"}`);

	if(bits >= 100) {
		say(message.broadcasterName, hypeEmoteString());
	}
}

async function onChannelRewardRedemption(event) {
	// https://twurple.js.org/reference/eventsub-base/classes/EventSubChannelRedemptionAddEvent.html

	const redeem = redeemList.getByID(event.rewardId);

	log("EVENTSUB", `Reward redeemed: ${redeem == null ? "<unknown>" : redeem.name} (${event.rewardId})`, false, ['whiteBright']);

	if(redeem.name in redeemFunctions) {
		await redeemFunctions[redeem.name](event);
	}
}

function onChannelFollowed(follow) {
	log("EVENTSUB", "User followed", false, ['whiteBright']);

	say(follow.broadcasterName, `${thanksParts[0][Math.floor(Math.random() * thanksParts[0].length)]} for the follow! Feel free to say ${thanksParts[1][Math.floor(Math.random() * thanksParts[1].length)]} in chat! RareChar`);
}

var haveAdsRunBefore = false;
async function onAdsStarted(event) {
	if(!haveAdsRunBefore) {
		await say(broadcasterUser.name, 'Ads are running during setup to disable pre-rolls for the next little bit. You\'re not missing out on anything! Get your snacks, get your drinks, take your meds! Okayge');
	} else {
		await say(broadcasterUser.name, "Rave4 AD BREAK! Rave4 Stand up, stretch, grab some refreshments, use the restroom, take your meds, do what you need to do! The stream will be back in a few minutes, you'll miss nothing! I promise! kermitNod");
	}

	haveAdsRunBefore = true;
	tts(settings.tts.voices.system, "Ad break started", 1);

	await creditRaffle.start();
}

async function onAdsEnded(event) {
	await say(broadcasterUser.name, "Ad break has ended, welcome back! WooperRise");
	tts(settings.tts.voices.system, "Ad break finished", 1);

	await creditRaffle.end();
}

var hasSetFirstRedeem = false;
async function onTwitchStreamOnline(event) {
	const channelInfo = await apiClient.channels.getChannelInfoById(event.broadcasterId);

	say(broadcasterUser.name, `SmileArrive Parrot is now live with ${channelInfo.gameName}! If this was an interruption and the stream does not resume automatically within the next few seconds, refresh the page or reload your app! SmileArrive`);

	if(!hasSetFirstRedeem) {
		await postToWebhook("streamLive", {
			content: `https://twitch.tv/theblackparrot\n\n# ${event.broadcasterDisplayName} is now live with *${channelInfo.gameName}*!\n> ${channelInfo.title}`
		});

		triggerTwitchStreamOnlineEvents();
	}
	hasSetFirstRedeem = true;
}
function triggerTwitchStreamOnlineEvents() {
	if(initialCategory == "Spin Rhythm XD") {
		swapCategoryInterval = setInterval(swapCategoryInSRXD, 45 * 60 * 1000);
	};

	adTimer();
}
async function onTwitchStreamOffline(event) {
	say(broadcasterUser.name, 'The stream is now offline! If this was an interruption, wait a few minutes and reload your app or refresh your page. Otherwise, see you later! SmileWave');

	clearTimeout(adTimerTimeout);

	await rulerOfTheRedeem.awardTime();
	rulerOfTheRedeem.updateTime();
}
async function onChannelShoutedOut(event) {
	const channelInfo = await apiClient.channels.getChannelInfoById(event.shoutedOutBroadcasterId);
	await say(broadcasterUser.name, `👉👉 Check out https://twitch.tv/${event.shoutedOutBroadcasterName} ! 👈👈 They were last seen streaming ${channelInfo.gameName}!`)
}
async function onOutgoingRaid(event) {
	let gameInfo = await apiClient.games.getGameByName(initialCategory);

	if(gameInfo != null) {
		await apiClient.channels.updateChannelInfo(broadcasterUser.id, {
			gameId: gameInfo.id
		});
	}

	await say(broadcasterUser.name, `We have sent the stream over to https://twitch.tv/${event.raidedBroadcasterName} ! See you next time! SmileWave`);
}

var previousCategory = null;
var previousTitle = null;
async function onChannelMetadataUpdate(event) {
	let messages = [];

	if(event.streamTitle != previousTitle) {
		global.log("EVENTSUB", `Stream title changed to ${event.streamTitle}`, false, ['gray']);
		messages.push(`Stream title changed to "${event.streamTitle}"`);
	}

	if(event.categoryName != previousCategory) {
		global.log("EVENTSUB", `Category changed to ${event.categoryName}`, false, ['gray']);
		messages.push(`Category changed to "${event.categoryName}"`);
	}

	previousTitle = event.streamTitle;
	previousCategory = event.categoryName;

	for(const message of messages) {
		say(broadcasterUser.name, `ObamaPhone ${message}`);
	}
}

const eventSubListener = new EventSubWsListener({
	apiClient: apiClient
});

function startEventSub() {
	eventSubListener.onChannelChatMessage(broadcasterUser.id, broadcasterUser.id, (message) => {
		if(message.isCheer) { try { onBitsCheered(message.bits, message); } catch(err) { console.error(err); } }
	});

	eventSubListener.onChannelFollow(broadcasterUser.id, broadcasterUser.id, (follow) => {
		try { onChannelFollowed(follow); } catch(err) { console.error(err); }
	});

	eventSubListener.onChannelAdBreakBegin(broadcasterUser.id, (event) => {
		try { onAdsStarted(event); } catch(err) { console.error(err); }

		setTimeout(() => { onAdsEnded(event) }, event.durationSeconds * 1000);
	});

	eventSubListener.onStreamOnline(broadcasterUser.id, (event) => {
		try { onTwitchStreamOnline(event) } catch(err) { console.error(err); }
	});
	eventSubListener.onStreamOffline(broadcasterUser.id, (event) => {
		try { onTwitchStreamOffline(event) } catch(err) { console.error(err); }
	});

	eventSubListener.onChannelRewardUpdate(broadcasterUser.id, (redeem) => {
		redeemList.getByID(redeem.id).update(redeem, false);
	});

	eventSubListener.onChannelRedemptionAdd(broadcasterUser.id, (event) => {
		try { onChannelRewardRedemption(event); } catch(err) { console.error(err); }
	});

	eventSubListener.onChannelShoutoutCreate(broadcasterUser.id, broadcasterUser.id, (event) => {
		try { onChannelShoutedOut(event); } catch(err) { console.error(err); }
	});

	eventSubListener.onChannelRaidFrom(broadcasterUser.id, (event) => {
		try { onOutgoingRaid(event); } catch(err) { console.error(err); }
	});

	eventSubListener.onChannelUpdate(broadcasterUser.id, (event) => {
		try { onChannelMetadataUpdate(event); } catch(err) { console.error(err); }
	});

	eventSubListener.start();
	log("SYSTEM", `Started EventSub listeners`);
}

// ====== AD STUFF (guh, bluh even) ======

var adTimerTimeout;

async function adTimer() {
	clearTimeout(adTimerTimeout);

	while(broadcasterUser == null) {
		await delay(1000);
	}

	adTimerTimeout = setTimeout(adTimer, settings.twitch.adTimerRefreshInterval * 1000);

	const adSchedule = await apiClient.channels.getAdSchedule(broadcasterUser.id);
	if(adSchedule == null) {
		// no ads or stream is not live
		return;
	}

	if(adSchedule.nextAdDate == null) {
		// no ads or stream is not live
		return;
	}

	if(adSchedule.nextAdDate.getTime() < Date.now()) {
		// or twitch is just fucking broken half the time who cares
		return;
	}

	onAdTimerRefreshed(adSchedule.nextAdDate.getTime());
}

var previousMinutesLeft = -1;
function onAdTimerRefreshed(nextAdTimestamp) {
	const now = Date.now();
	const timeLeft = (nextAdTimestamp - now) / 1000;
	const minutesLeft = Math.ceil(timeLeft / 60);

	if(timeLeft <= 300 && previousMinutesLeft != minutesLeft && haveAdsRunBefore) {
		say(broadcasterUser.name, `SNIFFA NEXT BREAK IN ${minutesLeft} ${minutesLeft != 1 ? "MINUTES" : "MINUTE"} SNIFFA`);
		tts(settings.tts.voices.system, `Scheduled ad break starts in ${minutesLeft} ${minutesLeft != 1 ? "minutes" : "minute"}`, 1);
		sound.play("sounds/retro-01.ogg", { volume: 0.6 });
	}

	previousMinutesLeft = minutesLeft;
}

// ====== OBS ======

var obsConnectionTimeout;

async function initOBS() {
	const address = `ws://${settings.obs.address}`;

	try {
		if(settings.obs.password != "") {
			await obs.connect(address, settings.obs.password);
		} else {
			await obs.connect(address);
		}
	} catch(err) {
		// ignored
	}
}

async function onOBSConnectionOpened() {
	const address = `ws://${settings.obs.address}`;

	clearTimeout(obsConnectionTimeout);
	global.log("OBS", `Established connection to OBS at ${address}`, false, ['greenBright']);

	obsBitrateInterval = setInterval(getInfoToDetermineOBSBitrate, settings.obs.bitrateInterval * 1000);

	const sceneObject = await obs.call('GetCurrentProgramScene');
	currentOBSSceneName = sceneObject.sceneName;
}

function onOBSConnectionClosed() {
	const address = `ws://${settings.obs.address}`;

	clearTimeout(obsConnectionTimeout);
	global.log("OBS", `Connection to OBS at ${address} closed`, false, ['redBright']);
	obsConnectionTimeout = setTimeout(initOBS, settings.obs.reconnectDelay * 1000);

	clearInterval(obsBitrateInterval);
}

var currentOBSSceneName;
async function onOBSSceneChanged(sceneObject) {
	currentOBSSceneName = sceneObject.sceneName;

	global.log("OBS", `Scene changed to ${currentOBSSceneName}`, false, ['gray']);

	const isVRChat = (currentOBSSceneName === "VRChat" || currentOBSSceneName === "Resonite");
	const isIntermission = (currentOBSSceneName === "Ad Wall" || currentOBSSceneName === "Starting Soon");
	const isMenu = (currentOBSSceneName === "SRXD Menu");
	const isGameplay = (currentOBSSceneName === "SRXD Gameplay");

	allowBejeweled = (currentOBSSceneName === "Ad Wall");

	if(initialCategory == "Spin Rhythm XD") {
		for(const redeem of redeemList.getTaggedRedeems("vnyan")) {
			if(redeem.name == "Throw stuff at me") {
				await redeem.pause(isIntermission | !isMenu);
			} else {
				await redeem.pause(isIntermission);
			}
		}
	}

	await redeemList.getByName("Flip a Coin").enable(isIntermission);
	await redeemList.getByName("gib coin hint pls?").enable(isIntermission);
}
async function onOBSSceneTransitionStarted(transitionObject) {
	const sceneObject = await obs.call('GetCurrentProgramScene');
	
	const name = sceneObject.sceneName;
	global.log("OBS", `Scene transition to scene ${name} started`, false, ['gray']);
	
	const isVRChat = (name === "VRChat" || name === "Resonite");
	const isIntermission = (name === "Ad Wall" || name === "Starting Soon");
	const isMenu = (name === "SRXD Menu");
	const isGameplay = (name === "SRXD Gameplay");

	await obs.call('SetInputMute', {
		inputName: 'Microphone',
		inputMuted: isIntermission
	});

	await obs.call('SetInputMute', {
		inputName: 'Resonite Audio',
		inputMuted: isIntermission
	});

	await obs.call('SetInputVolume', {
		inputName: "Spotify Audio",
		inputVolumeDb: isVRChat ? -4 : 0
	});

	if(initialCategory != "Resonite") {
		await axios.post(`http://${settings.foobar.address}/api/player/${isIntermission ? "play" : "pause"}`).catch((err) => {});
	} else {
		await axios.post(`http://${settings.foobar.address}/api/player`, { volume: (isVRChat ? -36.5 : -32.5) }).catch((err) => {});
	}
}

async function onOBSStreamStateChanged(state) {
	if(state.outputActive && state.outputState == "OBS_WEBSOCKET_OUTPUT_STARTED") {
		await onStreamStarted();
	} else if(!state.outputActive && state.outputState == "OBS_WEBSOCKET_OUTPUT_STOPPING") {
		await onStreamStopped();
	}
}

async function onStreamStarted() {
	global.log("OBS", "Stream started", false, ['green']);

	clearInterval(rotatingMessageInterval);
	rotatingMessageInterval = setInterval(doRotatingMessage, settings.bot.rotatingMessageInterval * 1000);

	if(currentOBSSceneName == "Starting Soon") {
		await obs.call('SetInputMute', {
			inputName: 'Microphone',
			inputMuted: true
		});

		await obs.call('SetInputMute', {
			inputName: 'Resonite Audio',
			inputMuted: true
		});

		await redeemList.getByName("first").enable(!hasSetFirstRedeem);
		await redeemList.getByName("second").enable(false);
		await redeemList.getByName("third").enable(false);

		await redeemList.getByName("Flip a Coin").enable(true);
		await redeemList.getByName("gib coin hint pls?").enable(true);
	}

	await axios.post(`http://${settings.foobar.address}/api/player`, { volume: -32.5 }).catch((err) => {});
}
async function onStreamStopped() {
	clearInterval(rotatingMessageInterval);
	global.log("OBS", "Stream stopped", false, ['yellow']);
}

obs.on('Identified', onOBSConnectionOpened);
obs.on('ConnectionClosed', onOBSConnectionClosed);
obs.on('CurrentProgramSceneChanged', onOBSSceneChanged);
obs.on('StreamStateChanged', onOBSStreamStateChanged);
obs.on('SceneTransitionStarted', onOBSSceneTransitionStarted)

initOBS();

// ====== TIMERS ======

var rotatingMessageInterval;
var currentRotatingMessageIdx = -1;

function doRotatingMessage() {
	currentRotatingMessageIdx++;
	if(currentRotatingMessageIdx >= rotatingMessageLines.length) {
		currentRotatingMessageIdx = 0;
	}

	say(broadcasterUser.name, `🤖 ${rotatingMessageLines[currentRotatingMessageIdx]}`);
}

var swapCategoryInterval;
async function swapCategoryInSRXD() {
	if(initialCategory != "Spin Rhythm XD") {
		return;
	}

	let channelInfo = await apiClient.channels.getChannelInfoById(broadcasterUser.id);
	let wantedGameName = channelInfo.gameName == "Spin Rhythm XD" ? "Games + Demos" : "Spin Rhythm XD";

	let gameInfo = await apiClient.games.getGameByName(wantedGameName);
	if(gameInfo == null) {
		return;
	}

	await apiClient.channels.updateChannelInfo(broadcasterUser.id, {
		gameId: gameInfo.id
	});
}

var obsBitrateInterval;
var obsBytesSentData = [0, 0];

async function getInfoToDetermineOBSBitrate() {
	const data = await obs.call('GetStreamStatus');
	
	obsBytesSentData[0] = obsBytesSentData[1];
	obsBytesSentData[1] = data.outputBytes;

	if(obsBytesSentData[0] == obsBytesSentData[1] && data.outputActive) {
		// no bytes were sent, alert me
		sound.play("sounds/no_bytes_alert.ogg", { volume: 0.9 });
	}
}

// ====== WEBHOOKS ======

async function postToWebhook(which, data) {
	await axios.post(settings.webhooks[which], data).catch((err) => { console.error(err); });
	global.log("WEBHOOK", `Posted to the ${which} webhook`);
}

// ====== bye ======

const byeEmotes = ["Sleepo", "sleepofdog", "VirtualLeave"];
const byeMessages = ["alright bye", "i'm out bye", "bye bye", "ok bye", "cya later", "(i leave the room)", "goodbye chat"];

process.on('SIGINT', async function() {
	await say(broadcasterUser.name, `${byeMessages[Math.floor(Math.random() * byeMessages.length)]} ${byeEmotes[Math.floor(Math.random() * byeEmotes.length)]}`);
	await foobar2000.saveQueue();
	process.exit();
});