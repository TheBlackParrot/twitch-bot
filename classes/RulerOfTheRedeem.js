const delay = ms => new Promise(res => setTimeout(res, ms));

export class RulerOfTheRedeem {
	constructor() {
		this.rulerId = null;
		this.rulerName = null;

		this.lastSwappedHands = Date.now() / 1000;

		this.countdownTimeout;

		this.updateAnswer();
	}

	updateTime() {
		this.lastSwappedHands = Date.now() / 1000;
	}

	async swapHands(redeemEvent) {
		const someoneWasHolding = this.rulerId != null;

		if(someoneWasHolding) {
			await this.awardTime();
		}

		this.updateTime();
		this.rulerId = redeemEvent.userId;
		this.rulerName = redeemEvent.userName;
	}

	get lengthHeld() {
		return Math.floor((Date.now() / 1000) - this.lastSwappedHands);
	}

	get crownHolder() {
		return {
			id: this.rulerId,
			name: this.rulerName
		};
	}

	async allowForceRefresh(status) {
		const forceRedeem = global.redeemList.getByName("Force Refresh Ruler of the Redeem");
		await forceRedeem.enable(status);
	}

	async allowSteal(status) {
		const redeem = global.redeemList.getByName("GIVE ME THE CROWN RIGHT NOW!!!!!!! >:(((");
		await redeem.enable(status);
	}

	async enable(status) {
		const redeem = global.redeemList.getByName("Ruler of the Redeem");

		await redeem.enable(status);

		if(status) {
			await this.allowSteal(true);
			await this.allowForceRefresh(false);
		}
	}

	async updatePrompt() {
		while(!global.broadcasterUser) {
			await delay(1000);
		}

		let prompt = `What is ${this.numbers[0]} ${this.sign} ${this.numbers[1]}?`;
		if(this.rulerName != null) {
			prompt += ` (Current ruler: ${this.rulerName})`;
		}

		const redeem = global.redeemList.getByName("Ruler of the Redeem");
		await global.apiClient.channelPoints.updateCustomReward(global.broadcasterUser.id, redeem.id, {
			prompt: prompt
		});

		global.log("ROTR", "Updated prompt", false, ['gray']);
	}

	async updateAnswer() {
		this.numbers = [
			Math.floor(Math.random() * 100),
			Math.floor(Math.random() * 100)
		];

		this.sign = Math.floor(Math.random() * 100) % 2 == 1 ? "+" : "-";
		this.answer = this.numbers[0] + (this.sign == "+" ? this.numbers[1] : this.numbers[1] * -1);

		global.log("ROTR", `Updated answer for ${this.numbers.join(` ${this.sign} `)} to ${this.answer}`, false, ['gray']);

		await this.updatePrompt();
	}

	async awardTime() {
		if(this.rulerId == null) {
			global.log("ROTR", "Could not award time, rulerId was null", false, ['redBright']);
			return;
		}

		await global.updateLeaderboardValues(this.rulerId, "Ruler of the Redeem", this.lengthHeld);
	}

	async attempt(redeemEvent) {
		const correct = (redeemEvent.input == this.answer);

		if(correct) {
			await global.say(global.broadcasterUser.name, `@${redeemEvent.userDisplayName} Correct! You are now the Ruler of the Redeem!`);
			await this.swapHands(redeemEvent);

			await this.enable(false);
			await this.allowForceRefresh(true);

			this.initiateCountdown();
		} else {
			await global.say(global.broadcasterUser.name, `@${redeemEvent.userDisplayName} Incorrect! ${this.rulerName != null ? `${this.rulerName} remains Ruler of the Redeem.` : ""}`);
		}

		return correct;
	}

	initiateCountdown() {
		const length = 240000 + (Math.random() * 120000);

		global.log("ROTR", `Countdown finishes in ${Math.ceil(length / 1000)} seconds`);
		this.countdownTimeout = setTimeout(this.countdownFinished, length);
	}

	countdownFinished = async function() {
		await this.updateAnswer();

		await this.allowSteal(true);
		await this.enable(true);
	}

	async forceRefresh() {
		await this.countdownFinished();
	}

	async steal(redeemEvent) {
		clearTimeout(this.countdownTimeout);

		await this.allowSteal(false);
		await this.allowForceRefresh(false);
		await this.enable(false);

		await this.swapHands(redeemEvent);
		await global.say(global.broadcasterUser.name, `@${redeemEvent.userDisplayName} became so power hungry they used their wealth to steal the crown for 45 minutes! Goodness me...`);

		global.log("ROTR", `Countdown finishes in 45 minutes`);
		this.countdownTimeout = setTimeout(this.countdownFinished, 60 * 45 * 1000);
	}
}