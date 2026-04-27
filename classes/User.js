import * as fs from 'fs';

export class UserList {
	constructor() {
		this.users = {};
	}

	getUser(userId) {
		if(!(userId in this.users)) {
			this.users[userId] = new User(userId);
		}

		return this.users[userId];
	}
}

export class User {
	constructor(userId) {
		this.userId = userId;

		this.allowPersistence = true;
		this.persistentData = {};
		this.lastUsedCommand = {};

		try {
			const persistenceFilename = `./data/persistence/${userId}.json`;
			if(fs.existsSync(persistenceFilename)) {
				this.persistentData = JSON.parse(fs.readFileSync(persistenceFilename));
			}
		} catch(err) {
			this.allowPersistence = false; // prevent data loss in case this is just malformed data

			global.log("USER", `Could not load persistent data for ${userId}`, false, ['redBright']);
			global.logException(err);
		}
	}

	getPersistentData(key) {
		if(key in this.persistentData) {
			return this.persistentData[key];
		}

		return null;
	}

	setPersistentData(key, value) {
		const persistenceFilename = `./data/persistence/${this.userId}.json`;

		this.persistentData[key] = value;
		if(this.allowPersistence) {
			try {
				fs.writeFileSync(persistenceFilename, JSON.stringify(this.persistentData));
			} catch(err) {
				global.log("USER", `Could not save persistent data for ${this.userId}`, false, ['yellowBright']);
				global.logException(err);
				return;
			}

			global.log("USER", `Saved persistent data for ${this.userId}`, false, ['gray']);
		}
	}

	usedCommand(command) {
		let which = typeof(command.name) === "undefined" ? command.regexStrings[0] : command.name;
		this.lastUsedCommand[which] = Date.now();
	}

	canUseCommand(command) {
		let which = typeof(command.name) === "undefined" ? command.regexStrings[0] : command.name;
		if(!(which in this.lastUsedCommand)) {
			return true;
		}

		return Date.now() >= this.lastUsedCommand[which] + command.userCooldown;
	}

	cooldownTimeLeft(command) {
		let which = typeof(command.name) === "undefined" ? command.regexStrings[0] : command.name;
		if(!(which in this.lastUsedCommand)) {
			return 0;
		}

		return Math.ceil(((this.lastUsedCommand[which] + command.userCooldown) - Date.now()) / 1000);
	}
}