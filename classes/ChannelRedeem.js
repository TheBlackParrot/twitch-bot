export class ChannelRedeemList {
	constructor() {
		this.redeems = [];
	}

	add(redeemObject) {
		if(this.getByID(redeemObject.id) == null) {
			this.redeems.push(new ChannelRedeem(redeemObject));
		}
	}

	getByID(id) {
		for(const redeem of this.redeems) {
			if(redeem.id == id) {
				return redeem;
			}
		}

		return null;
	}

	getByName(name) {
		for(const redeem of this.redeems) {
			if(redeem.name == name) {
				return redeem;
			}
		}

		return null;
	}

	get length() {
		return this.redeems.length;
	}
}

class ChannelRedeem {
	constructor(redeemObject) {
		this.redeemObject = redeemObject;
		this.id = redeemObject.id;

		this.update(redeemObject);
	}

	async enable(status) {
		if(status == this.enabled) {
			return;
		}

		await global.apiClient.channelPoints.updateCustomReward(global.broadcasterUser.id, this.id, {
			isEnabled: status
		});
	}

	async setCooldown(seconds) {
		if(seconds == this.globalCooldown) {
			return;
		}

		await global.apiClient.channelPoints.updateCustomReward(global.broadcasterUser.id, this.id, {
			globalCooldown: seconds
		});
	}

	update(redeemObject, silent = true) {
		this.name = redeemObject.title;
		this.enabled = redeemObject.isEnabled;
		this.cost = redeemObject.rewardCost;
		this.autoFulfill = redeemObject.autoApproved;
		this.globalCooldown = redeemObject.globalCooldown;

		if(!silent) {
			global.log("REDEEM", `Updated channel point redeem ${redeemObject.title}`);
		}
	}
}