const delay = ms => new Promise(res => setTimeout(res, ms));

export class RulerOfTheRedeem {
	constructor() {
		this.rulerId = null;
		this.rulerName = null;

		this.lastSwappedHands = Date.now() / 1000;

		this.countdownTimeout;

		this.updateAnswer();
	}

	updateTime = function() {
		this.lastSwappedHands = Date.now() / 1000;
	}

	swapHands = async function(redeemEvent) {
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

	allowForceRefresh = async function(status) {
		const forceRedeem = global.redeemList.getByName("Force Refresh Ruler of the Redeem");
		await forceRedeem.enable(status);
	}

	allowSteal = async function(status) {
		const redeem = global.redeemList.getByName("GIVE ME THE CROWN RIGHT NOW!!!!!!! >:(((");
		await redeem.enable(status);
	}

	enable = async function(status) {
		const redeem = global.redeemList.getByName("Ruler of the Redeem");

		await redeem.enable(status);

		if(status) {
			await this.allowSteal(true);
			await this.allowForceRefresh(false);
		}
	}

	updatePrompt = async function() {
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

	updateAnswer = async function() {
		this.numbers = [
			Math.floor(Math.random() * 100),
			Math.floor(Math.random() * 100)
		];

		this.sign = Math.floor(Math.random() * 100) % 2 == 1 ? "+" : "-";
		this.answer = this.numbers[0] + (this.sign == "+" ? this.numbers[1] : this.numbers[1] * -1);

		global.log("ROTR", `Updated answer for ${this.numbers.join(` ${this.sign} `)} to ${this.answer}`, false, ['gray']);

		await this.updatePrompt();
	}

	awardTime = async function() {
		if(this.rulerId == null) {
			global.log("ROTR", "Could not award time, rulerId was null", false, ['redBright']);
			return;
		}

		await global.updateLeaderboardValues(this.rulerId, "Ruler of the Redeem", this.lengthHeld);
	}

	attempt = async function(redeemEvent) {
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

	initiateCountdown = function() {
		const length = 240000 + (Math.random() * 120000);

		global.log("ROTR", `Countdown finishes in ${Math.ceil(length / 1000)} seconds`);
		this.countdownTimeout = setTimeout(this.countdownFinished.bind(this), length);
	}

	countdownFinished = async function() {
		await this.updateAnswer();

		await this.allowSteal(true);
		await this.enable(true);
	}

	forceRefresh = async function() {
		await this.countdownFinished();
	}

	steal = async function(redeemEvent) {
		clearTimeout(this.countdownTimeout);

		await this.allowSteal(false);
		await this.allowForceRefresh(false);
		await this.enable(false);

		await this.swapHands(redeemEvent);
		await global.say(global.broadcasterUser.name, `@${redeemEvent.userDisplayName} became so power hungry they used their wealth to steal the crown for 45 minutes! Goodness me...`);

		global.log("ROTR", `Countdown finishes in 45 minutes`);
		this.countdownTimeout = setTimeout(this.countdownFinished.bind(this), 60 * 45 * 1000);
	}
}