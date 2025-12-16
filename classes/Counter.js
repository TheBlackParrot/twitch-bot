import * as fs from 'fs';

export class Counter {
	constructor() {
		this.persistentData = {};

		const persistenceFilename = `./data/counters.json`;
		if(fs.existsSync(persistenceFilename)) {
			this.persistentData = JSON.parse(fs.readFileSync(persistenceFilename));
		}
	}

	save() {
		fs.writeFileSync(`./data/counters.json`, JSON.stringify(this.persistentData));
	}

	increment(key, value) {
		if(!("key" in this.persistentData)) {
			this.persistentData[key] = 0;
		}

		this.persistentData[key] += value;
		global.log("COUNTER", `Added ${value} to ${key}`, ['gray']);

		this.save();
	}

	set(key, value) {
		this.persistentData[key] = value;
		global.log("COUNTER", `Set ${key} to ${value}`, ['gray']);

		this.save();
	}

	get(key) {
		return key in this.persistentData ? this.persistentData[key] : null;
	}
}