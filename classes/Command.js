export class CommandList {
	constructor() {
		this.triggerCommands = {};
		this.regexCommands = {};
	}

	addTrigger(name, trigger, opts = {}) {
		if(name in this.triggerCommands) {
			return false;
		}

		this.triggerCommands[name] = new TriggeredCommand(name, trigger, opts);

		if("aliases" in opts) {
			for(const alias of opts.aliases) {
				this.triggerCommands[alias] = this.triggerCommands[name];
			}
		}

		return true;
	}

	addRegex(regex, trigger, opts = {}) {
		let roots = Object.keys(this.regexCommands);
		for(const rootRegex of roots) {
			const command = this.regexCommands[rootRegex];

			if(command.regexStrings.indexOf(regex) > -1) {
				return false;
			}
		}

		this.regexCommands[regex] = new RegexCommand(regex, trigger, opts);
		return true;
	}

	get(name, type = "trigger") {
		let list = type == "trigger" ? this.triggerCommands : this.regexCommands;
		return name in list ? list[name] : null;
	}

	get length() {
		return Object.keys(this.triggerCommands).length;
	}

	get uniqueLength() {
		let names = Object.keys(this.triggerCommands);
		let unique = [];
		
		for(const idx in names) {
			let rootName = this.triggerCommands[names[idx]].name;

			if(unique.indexOf(rootName) == -1) {
				unique.push(rootName);
			}
		}

		return unique.length;
	}

	get regexLength() {
		let count = 0;
		let roots = Object.keys(this.regexCommands);

		for(const rootRegex of roots) {
			const command = this.regexCommands[rootRegex];
			count += command.regexStrings.length;
		}

		return count;
	}

	get uniqueRegexLength() {
		return Object.keys(this.regexCommands).length;
	}

	getMatchedRegex(string) {
		let roots = Object.keys(this.regexCommands);

		for(const rootRegex of roots) {
			const command = this.regexCommands[rootRegex];
			if(command.matches(string)) {
				return command;
			}
		}

		return null;
	}
}

export class BaseCommand {
	constructor(trigger, opts) {
		this._trigger = trigger;
		this.lastTriggered = 0;

		this.cooldown = "cooldown" in opts ? opts.cooldown * 1000 : 0;
		this.userCooldown = "userCooldown" in opts ? opts.userCooldown * 1000 : 0;
		this.whitelist = "whitelist" in opts ? opts.whitelist : [];
		this.respondWithCooldownMessage = "respondWithCooldownMessage" in opts ? opts.respondWithCooldownMessage : false;
		this.allowedCategories = "allowedCategories" in opts ? opts.allowedCategories : [];
	}

	get canUse() {
		return Date.now() >= this.lastTriggered + this.cooldown;
	}

	get cooldownTimeLeft() {
		return Math.ceil(((this.lastTriggered + this.cooldown) - Date.now()) / 1000);
	}

	async trigger(channel, args, msg, user) {
		if(user.userName === global.botUserName) {
			return;
		}

		if(this.whitelist.length) {
			let allowed = false;

			for(const role of this.whitelist) {
				switch(role) {
					case "streamer":
					case "broadcaster":
						allowed = user.isBroadcaster;
						break;

					case "moderator":
					case "mod":
						allowed = user.isMod;
						break;

					case "vip":
						allowed = user.isVip;
						break;

					case "subscriber":
					case "sub":
						allowed = user.isSubscriber;
						break;
				}

				if(allowed) {
					break;
				}
			}

			if(!allowed) {
				return;
			}
		}

		if(this.allowedCategories.length) {
			if(global.initialCategory == null || this.allowedCategories.indexOf(global.initialCategory) == -1) {
				return;
			}
		}

		this.lastTriggered = Date.now();
		await this._trigger(channel, args, msg, user);
	}
}

export class TriggeredCommand extends BaseCommand {
	constructor(name, trigger, opts) {
		super(trigger, opts);

		this.name = name;
	}
}

export class RegexCommand extends BaseCommand {
	constructor(regex, trigger, opts) {
		super(trigger, opts);

		this.regexStrings = [regex];

		const caseInsensitive = "caseInsensitive" in opts ? opts.caseInsensitive : true;
		this.validRegex = [new RegExp(regex, caseInsensitive ? "i" : "")];

		if("aliases" in opts) {
			for(const aliasedRegex of opts.aliases) {
				this.regexStrings.push(aliasedRegex);
				this.validRegex.push(new RegExp(aliasedRegex, "i"));
			}
		}

		this.fallThroughAsMessage = "fallThroughAsMessage" in opts ? opts.fallThroughAsMessage : true;
	}

	matches(string) {
		for(const regex of this.validRegex) {
			if(regex.test(string)) {
				return true;
			}
		}

		return false;
	}
}