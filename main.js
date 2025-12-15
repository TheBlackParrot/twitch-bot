import { promises as fs } from 'fs';
import { Console } from 'node:console';
import { styleText } from 'node:util';
import axios from 'axios';
import { OBSWebSocket } from 'obs-websocket-js';
const obs = new OBSWebSocket();
import { Player } from "cli-sound";
const sound = new Player();

import { RefreshingAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { ChatClient } from '@twurple/chat';
import { EventSubWsListener } from '@twurple/eventsub-ws';

import { UserList } from "./classes/User.js";
import { CommandList } from "./classes/Command.js";
import { WebSocketListener } from "./classes/WebSocketListener.js";
import { EmoteList, SevenTV, BetterTTV, FrankerFaceZ } from "./classes/Emote.js";
import { ChannelRedeemList } from "./classes/ChannelRedeem.js";

const settings = JSON.parse(await fs.readFile('./settings.json'));
const clientId = settings.auth.twitch.clientID;
const clientSecret = settings.auth.twitch.clientSecret;
const botTokenData = JSON.parse(await fs.readFile('./tokens.738319562.json'));
const streamerTokenData = JSON.parse(await fs.readFile('./tokens.43464015.json'));
const authProvider = new RefreshingAuthProvider(
	{
		clientId,
		clientSecret
	}
);

const weatherConditionCodes = JSON.parse(await fs.readFile('./static/weatherConditionCodes.json'));

const users = new UserList();
const commandList = new CommandList();
const redeemList = new ChannelRedeemList();
var broadcasterUser = null;

const apiClient = new ApiClient({
	authProvider
});

const sessionStart = Date.now();
fs.mkdir("./logs").catch((err) => {
	// ignored 
});

await fs.writeFile(`./logs/${sessionStart}.log`, '');
const logFileHandle = await fs.open(`./logs/${sessionStart}.log`, 'r+');
const logOutput = await logFileHandle.createWriteStream();
const logWriter = new Console({ stdout: logOutput });

const delay = ms => new Promise(res => setTimeout(res, ms));

// ====== SYSTEM STUFF ======

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

function tts(voice, string, rate = 0) {
	let url = new URL('/', settings.tts.URL);
	let data = {
		voice: voice,
		text: string.replace('"', ''),
		rate: rate
	};

	axios.post(url, data).catch((err) => {});
}

// ====== AUTH ======

async function refreshHandler(userId, newTokenData) {
	await fs.writeFile(`./tokens.${userId}.json`, JSON.stringify(newTokenData, null, 4));
	log("AUTH", `Refreshed tokens for ${userId}`);
}

authProvider.onRefresh(refreshHandler);
await authProvider.addUserForToken(botTokenData, ['chat', 'user']);
await authProvider.addUserForToken(streamerTokenData, ['channel']);

// ====== SRXD ======

var spinRequestsSocket;

function initSpinRequestsSocket() {
	if(initialCategory == "Spin Rhythm XD") {
		spinRequestsSocket = new WebSocketListener('http://127.0.0.1:6970/', handleSpinRequestsMessage);
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

// --- !amhere ---
commandList.addTrigger("amhere", async(channel, args, msg, user) => {
	let url = new URL('/value-tracking/private/api/updateValue.php', 'http://172.16.0.1/');
	let params = new URLSearchParams({
		id: user.userId,
		which: 'Gamba_Credits',
		value: 20,
		default: 0
	});
	url.search = params.toString();

	let response = await axios.get(url).catch((err) => {});
	if("data" in response) {
		await reply(channel, msg, response.data === "OK" ? `20 Gamba Credits to you! Okayge` : `⚠️ Something went wrong: ${response.data} @${channel}`);
	} else {
		await reply(channel, msg, `⚠️ Something went REALLY wrong @${channel}`);
	}
}, {
	userCooldown: 1800
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
})

// --- !github ---
commandList.addTrigger("github", async(channel, args, msg, user) => {
	await reply(channel, msg, 'https://github.com/TheBlackParrot');
}, {
	aliases: ["mods", "srxdmods", "gh", "code"],
	cooldown: 10
});

// --- !insulin ---
commandList.addTrigger("insulin", async(channel, args, msg, user) => {
	await say(channel, 'Insulin helps regulate blood-sugar levels throughout the day and night, a key to managing diabetes. People with type 1 diabetes (T1D) rely on insulin therapy to help manage their blood-glucose levels. While insulin therapy keeps people with T1D alive, it is not a cure, nor does it prevent the possibility of T1D’s serious side effects. Learn more: https://www.breakthrought1d.org/t1d-basics/insulin/');
}, {
	cooldown: 30
})

// --- !link ---
commandList.addTrigger("link", async(channel, args, msg, user) => {
	let response = await querySRXD('history', '', { limit: 1 });
	if("data" in response) {
		if(response.data.length) {
			await reply(channel, msg, formatSRXDLinkResponse(response.data[0], "Current chart: "));
		}
	}
}, {
	aliases: ["song", "chart"]
});

// --- !low ---
commandList.addTrigger("low", async(channel, args, msg, user) => {
	// todo: automatically pin this
	await say(channel, 'Parrot\'s having a low blood sugar episode (hypoglycemia), he\'s a type 1 diabetic so this happens sometimes, and it makes his brain go brr. He\'s fixing it right now, and will be back shortly! (If you heard beeping, this is his insulin pump screaming at him to fix it. He\'s not in any danger! (unless he very obviously is)');
}, {
	whitelist: ["broadcaster", "mod", "vip"],
	cooldown: 30
});

// --- !modadd ---
commandList.addTrigger("modadd", async(channel, args, msg, user) => {
	if(!args.length) {
		return;
	}

	let queryString = args.join(" ").replace("https://spinsha.re/song/", "");
	queryString = queryString.replace("spinshare://chart/", "");

	let addResponse = await querySRXD('add', queryString, { user: user.displayName, service: "twitch" });

	if("data" in addResponse) {
		if("message" in addResponse.data) { return await reply(channel, msg, `⚠️ Something went wrong: ${addResponse.data.message}`); }
		await reply(channel, msg, `🆗 ${formatSRXDLinkResponse(addResponse.data, "Added ", true)} to the queue.`);
		sound.play("sounds/notif.wav", { volume: 0.9 });
	}
}, {
	whitelist: ["broadcaster", "mod", "vip"]
});

// --- !music ---
commandList.addTrigger("music", async(channel, args, msg, user) => {
	await reply(channel, msg, 'https://music.theblackparrot.me (all music I have copyright control over is stream safe!)');
}, {
	cooldown: 10
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
	if("data" in response) {
		if(response.data.length === 2) {
			await reply(channel, msg, formatSRXDLinkResponse(response.data[1], "Previous chart: "));
		} else {
			await reply(channel, msg, "⚠️ No data");
		}
	}
}, {
	aliases: ["prevsong", "prevchart", "prev", "previous"]
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

	if("data" in response) {
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
		if("data" in addResponse) {
			if("message" in addResponse.data) { return await reply(channel, msg, `⚠️ Something went wrong: ${addResponse.data.message}`); }
			await reply(channel, msg, `🆗 ${formatSRXDLinkResponse(addResponse.data, "Added ", true)} to the queue.`);
			sound.play("sounds/notif.wav", { volume: 0.9 });
		}
	}
}, {
	aliases: ["srxd", "req", "bsr", "sr", "add"],
	userCooldown: 10
});

// --- !specs ---
commandList.addTrigger("specs", async(channel, args, msg, user) => {
	let parts = {
		"CPU": "AMD Ryzen 5 7600X @ 4.7GHz",
		"RAM": "32GB (2x16GB) Team Group UD5-6000 DDR5-6000",
		"GPU": "AMD Radeon RX 6800XT (Reference)",
		"Motherboard": "ASRock B650M-HDV/M.2",
		"VR stuff": "Valve Index w/ Knuckles Controllers, 2x Tundra Trackers, 1x Vive 2.0 Tracker, 4x SteamVR 2.0 Base Stations"
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

// --- !steam ---
commandList.addTrigger("steam", async(channel, args, msg, user) => {
	await reply(channel, msg, 'https://steamcommunity.com/id/TheBlackParrot');
}, {
	cooldown: 10
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

// --- !tipping ---
commandList.addTrigger("tipping", async(channel, args, msg, user) => {
	await say(channel, 'Streamlabs: https://streamlabs.com/theblackparrot/tip || StreamElements: https://streamelements.com/theblackparrot/tip || Ko-fi: https://ko-fi.com/septilateral');
}, {
	aliases: ["tip", "donate", "kofi", "streamlabs", "streamelements"],
	cooldown: 10
});

// --- !vnyan ---
commandList.addTrigger("vnyan", async(channel, args, msg, user) => {
	await reply(channel, msg, 'VNyan is what I use to render my avatar over the game I\'m playing, it\'s available for free! https://suvidriel.itch.io/vnyan');
}, {
	cooldown: 10
})

// --- !vrc ---
commandList.addTrigger("vrc", async(channel, args, msg, user) => {
	await reply(channel, msg, 'https://vrc.group/TBP.1829 (IGN: TheBlackParrot) (If I\'m comfortable with you, I\'ll give you a role upon joining the group and you can join the stream instances whenever)');
}, {
	cooldown: 10
});

// --- !weather ---
commandList.addTrigger("weather", async(channel, args, msg, user) => {
	let unit = "f";
	let windUnit = "mph";
	if(args.length) {
		if(arg[0].toLowerCase().startsWith("c") || arg[0].toLowerCase().startsWith("m")) {
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
	cooldown: 300
});

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
async function reply(channel, originalMsg, text) {
	await chatClient.say(channel, text, { replyTo: originalMsg });
}

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

async function messageHandler(channel, userString, text, msg) {
	let args = text.split(" ");

	if(args.length <= 0) {
		return;
	}

	global.log("", `${userString}: ${text}`, false, ['gray']);

	if(seenUsers.indexOf(msg.userInfo.userName) === -1) {
		seenUsers.push(msg.userInfo.userName);
		onUserFirstSeenForSession(channel, msg.userInfo);
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
		let triggerName = typeof(command.name) === "undefined" ? `(regex: ${command.regexStrings[0]})` : command.name;

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
			}
		} else {
			log("COMMANDS", `Command ${triggerName} is on cooldown for ${msg.userInfo.userName}`);
		}
	} else {
		// not a command or regex, standard message

		if(Math.floor(Math.random() * 1000) == 69) {
			say(channel, uniEmotes[Math.floor(Math.random() * uniEmotes.length)]);
		}

		onStandardMessage(channel, msg.userInfo, text);
	}
}
const commandListener = chatClient.onMessage(messageHandler);

function onUserFirstSeenForSession(channel, user) {
	tts(settings.tts.voices.system, `${ensureEnglishName(user)} has entered the chat.`);
}

function onStandardMessage(channel, user, message) {
	let filtered = message.split(" ").filter((part) => !part.startsWith('http:') && !part.startsWith('https:')).join(" ");

	if(!message.startsWith('@') && initialCategory != "VRChat") {
		tts(settings.tts.voices.names, ensureEnglishName(user));
		tts(settings.tts.voices.messages, global.emotes.getFilteredString(filtered));
	}
}

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
		log("SYSTEM", `Initial category is ${initialCategory}`);

		let allRedeems = await apiClient.channelPoints.getCustomRewards(broadcasterUser.id);
		for(const redeem of allRedeems) {
			redeemList.add(redeem);
		}
		log("SYSTEM", `Found ${redeemList.length} channel point redeems`);

		initSpinRequestsSocket();
	}
});

chatClient.onRaid(async (channel, user, raidInfo, msg) => {
	let raiderInfo = await apiClient.users.getUserByName(user);
	let channelInfo = await apiClient.channels.getChannelInfoById(raiderInfo.id);
	
	tts(settings.tts.voices.system, `${user} raided the stream with ${raidInfo.viewerCount} ${raidInfo.viewerCount != 1 ? "viewers": "viewer"}! They were streaming ${channelInfo.gameName}.`);

	let hypeString = hypeEmoteString(2);
	say(channel, `${hypeString} Thank you @${raiderInfo.displayName} for the raid of ${raidInfo.viewerCount}, they were streaming ${channelInfo.gameName}! Check them out at https://twitch.tv/${user}! ${hypeString}`);
	
	await apiClient.chat.shoutoutUser(broadcasterUser.id, raiderInfo.id);

	// todo: add viewercount to thrown items
	
	say(channel, '⚠️⚠️⚠️ THIS STREAM CONTAINS LOTS OF FLASHING AND POTENTIALLY STROBING LIGHTS. If you are sensitive to flashing lights I would advise switching the stream to audio-only mode or closing the stream. Viewer discretion is advised. ⚠️⚠️⚠️');
});
chatClient.onRaidCancel((channel, msg) => { 
	say(channel, "wait nevermind...");
});
chatClient.onSub((channel, user, subInfo, msg) => {
	tts(settings.tts.voices.system, `${user} subscribed ${subInfo.isPrime ? "with Prime" : `at ${subInfo.planName}`} for ${subInfo.months} ${subInfo.months != 1 ? "months" : "month"}`);
	say(channel, hypeEmoteString());
})
chatClient.onResub((channel, user, subInfo, msg) => {
	tts(settings.tts.voices.system, `${user} re-subscribed ${subInfo.isPrime ? "with Prime" : `at ${subInfo.planName}`} for ${subInfo.months} ${subInfo.months != 1 ? "months" : "month"}`);
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

function onChannelRewardRedemption(rewardId, message) {
	log("EVENTSUB", `Reward redeemed: ${rewardId}`, false, ['whiteBright']);
}

function onChannelFollowed(follow) {
	log("EVENTSUB", "User followed", false, ['whiteBright']);

	say(follow.broadcasterName, `${thanksParts[0][Math.floor(Math.random() * thanksParts[0].length)]} for the follow! Feel free to say ${thanksParts[1][Math.floor(Math.random() * thanksParts[1].length)]} in chat! RareChar`);
}

function onAdsStarted(event) {
	tts(system.tts.voices.system, "Ad break started", 1);
}

function onAdsEnded(event) {
	say(event.broadcasterName, "Ad break has ended, welcome back! WooperRise");
	tts(system.tts.voices.system, "Ad break finished", 1);
}

const eventSubListener = new EventSubWsListener({
	apiClient: apiClient
});

function startEventSub() {
	eventSubListener.onChannelChatMessage(broadcasterUser.id, broadcasterUser.id, (message) => {
		if(message.isCheer) { try { onBitsCheered(message.bits, message); } catch(err) { console.error(err); } }
		if(message.isReward) { try { onChannelRewardRedemption(message.rewardId, message); } catch(err) { console.error(err); } }
	});

	eventSubListener.onChannelFollow(broadcasterUser.id, broadcasterUser.id, (follow) => {
		try { onChannelFollowed(follow); } catch(err) { console.error(err); }
	});

	eventSubListener.onChannelAdBreakBegin(broadcasterUser.id, (event) => {
		try { onAdsStarted(event); } catch(err) { console.error(err); }

		setTimeout(() => { onAdsEnded(event) }, event.durationSeconds * 1000);
	})

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
	const minutesLeft = Math.floor(timeLeft / 60);

	if(timeLeft <= 300 && previousMinutesLeft != minutesLeft) {
		say(broadcasterUser.name, `SNIFFA NEXT BREAK IN ${minutesLeft} ${minutesLeft != 1 ? "MINUTES" : "MINUTE"} SNIFFA`);
		tts(settings.tts.voices.system, `Scheduled ad break starts in ${minutesLeft} ${minutesLeft != 1 ? "minutes" : "minute"}`, 1);
		sound.play("sounds/retro-01.ogg", { volume: 0.6 });
	}

	previousMinutesLeft = minutesLeft;
}

adTimer();

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

function onOBSConnectionOpened() {
	const address = `ws://${settings.obs.address}`;

	clearTimeout(obsConnectionTimeout);
	global.log("OBS", `Established connection to OBS at ${address}`, false, ['greenBright']);
}

function onOBSConnectionClosed() {
	const address = `ws://${settings.obs.address}`;

	clearTimeout(obsConnectionTimeout);
	global.log("OBS", `Connection to OBS at ${address} closed`, false, ['redBright']);
	obsConnectionTimeout = setTimeout(initOBS, settings.obs.reconnectDelay * 1000);
}

async function onOBSSceneChanged(sceneObject) {
	const name = sceneObject.sceneName;

	global.log("OBS", `Scene changed to ${name}`, false, ['gray']);

	const isVRChat = (name === "VRChat");
	const isIntermission = (name === "Ad Wall" || name === "Starting Soon");
	const isMenu = (name === "SRXD Menu");
	const isGameplay = (name === "SRXD Gameplay");

	await obs.call('SetInputMute', {
		inputName: 'Microphone',
		inputMuted: isIntermission
	});

	await axios.post(`http://${settings.foobar.address}/api/player/${isIntermission ? "play" : "pause"}`).catch((err) => {});

	if(initialCategory == "Spin Rhythm XD") {
		const throwStuff = redeemList.getByName("Throw stuff at me");
		apiClient.channelPoints.updateCustomReward(broadcasterUser.id, throwStuff.id, {
			isPaused: isMenu
		});
	}

	await obs.call('SetInputVolume', {
		inputName: "Spotify Audio",
		inputVolumeDb: isVRChat ? -4 : 0
	});
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

	await axios.post('http://127.0.0.1:8880/api/player', { volume: -36.5 }).catch((err) => {});

	say(broadcasterUser.name, 'SmileArrive Parrot is now live with $game! If this was an interruption and the stream does not resume automatically within the next few seconds, refresh the page or reload your app! SmileArrive');
}
async function onStreamStopped() {
	clear(rotatingMessageInterval);
	global.log("OBS", "Stream stopped", false, ['yellow']);
}

obs.on('ConnectionOpened', onOBSConnectionOpened);
obs.on('ConnectionClosed', onOBSConnectionClosed);
obs.on('CurrentProgramSceneChanged', onOBSSceneChanged);
obs.on('StreamStateChanged', onOBSStreamStateChanged);

initOBS();

// ====== TIMERS ======

var rotatingMessageInterval;
var currentRotatingMessageIdx = -1;
const rotatingMessageLines = [
	`Come say hello if you'd like! Join the Discord! https://discord.gg/gCDJYbzxar Or join the Telegram group! https://t.me/+4dg5pw6oiy84N2Jh`,
	`Want to directly support the stream? Send me a tip! Check the About Panels down below for links to my Ko-fi, Streamlabs, and StreamElements pages. I also have a Patreon!`,
	`Want to change the appearance of your chat messages on stream? Use this page to manage your own settings! https://theblackparrot.me/overlays/chat/previewer`,
	`This channel has custom 3rd party emotes! Grab the FrankerFaceZ browser extension from https://frankerfacez.com to see them. (Also enable the "7TV Emotes" and "BetterTTV Emotes" add-ons in FFZ's settings to see even more of them!)`,
	`Amazon Prime members: if you connect your Amazon account with your Twitch account, you get a free (non-rollover) subscription you can use across Twitch each month! Be sure to use it on your favorite streamer! https://gaming.amazon.com/links/twitch/manage`,
	`Want 20 free Gamba Credits to use for coin flips? You can use !amhere in chat every 30 minutes!`
];

function doRotatingMessage() {
	currentRotatingMessageIdx++;
	if(currentRotatingMessageIdx >= rotatingMessageLines.length) {
		currentRotatingMessageIdx = 0;
	}

	say(broadcasterUser.name, `🤖 ${rotatingMessageLines[currentRotatingMessageIdx]}`);
}