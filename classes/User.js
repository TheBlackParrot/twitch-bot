export class UserList {
	constructor() {
		this.users = {};
	}

	getUser(userId) {
		if(!(userId in this.users)) {
			this.users[userId] = new User();
		}

		return this.users[userId];
	}
}

export class User {
	constructor() {
		this.lastUsedCommand = {};
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