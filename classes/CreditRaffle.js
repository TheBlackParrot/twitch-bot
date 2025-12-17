const delay = ms => new Promise(res => setTimeout(res, ms));

export class CreditRaffle {
	constructor() {
		this.active = false;
		this.entries = {};
	}

	get incrementAmount() {
		return Math.floor(Math.pow(Math.random() * 10, 3.67) / 5) + 150;
	}

	async start() {
		if(this.active) {
			return;
		}

		this.active = true;
		this.entries = {};

		global.counter.increment("RaffleCredits", this.incrementAmount);

		await global.say(global.broadcasterUser.name, `TWISTED Raffle time! TWISTED Send "!rafjoin" in chat to enter a raffle for ${global.counter.get("RaffleCredits")} Gamba Credits! catChat`);
	}

	async end() {
		if(!this.active) {
			return;
		}

		this.active = false;

		const amount = global.counter.get("RaffleCredits");
		global.counter.set("RaffleCredits", 0);

		let winner;
		const ids = Object.keys(this.entries);

		if(ids.length == 1) {
			winner = this.entries[ids[0]];
			await global.updateLeaderboardValues(winner.userId, "Gamba Credits", amount * 2);
			await global.say(global.broadcasterUser.name, `There was only one entrant? That's no fun! Have double the credits @${winner.displayName}, go nuts, who cares. WHATASHAME`);
			await global.remoteSound.play("applause", 0.6);
			return;
		}

		winner = this.entries[ids[Math.floor(Math.random() * ids.length)]];

		await global.say(global.broadcasterUser.name, `Alright, time to draw the raffle winner out of ${ids.length} entrants... jermaYou`);
		await delay(6000 + (Math.random() * 1500));

		await global.say(global.broadcasterUser.name, `And the winner of ${amount} Gamba Credits is... PauseChamp`);
		await delay(3500 + (Math.random() * 2500));

		await global.updateLeaderboardValues(winner.userId, "Gamba Credits", amount);
		await global.say(global.broadcasterUser.name, `... @${winner.displayName}! PogChamp Congrats! Clap Clap Clap`);
		await global.remoteSound.play("applause", 0.6);
	}

	async cancel() {
		if(!this.active) {
			return;
		}
		
		this.active = false;
		this.entries = {};

		await global.say(global.broadcasterUser.name, `The Gamba Credit raffle was cancelled.`);
	}

	addUser(user) {
		if(user.userId in this.entries) {
			return false;
		}

		this.entries[user.userId] = user;
		return true;
	}
}