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

		this.persistentData = {};
		this.lastUsedCommand = {};

		const persistenceFilename = `./data/persistence/${userId}.json`;
		if(fs.existsSync(persistenceFilename)) {
			this.persistentData = JSON.parse(fs.readFileSync(persistenceFilename));
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
		fs.writeFileSync(persistenceFilename, JSON.stringify(this.persistentData));

		global.log("USER", `Saved persistent data for ${this.userId}`, false, ['gray']);
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
}