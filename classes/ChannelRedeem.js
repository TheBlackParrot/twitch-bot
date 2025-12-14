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

		this.name = redeemObject.title;
		this.id = redeemObject.id;
		this.enabled = redeemObject.isEnabled;
		this.cost = redeemObject.cost;
		this.autoFulfill = redeemObject.autoFulfill;
	}
}