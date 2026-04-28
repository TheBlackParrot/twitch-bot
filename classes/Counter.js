import * as fs from 'fs';

export class Counter {
	constructor() {
		this.persistentData = {};

		const persistenceFilename = `./data/counters.json`;
		if(fs.existsSync(persistenceFilename)) {
			// don't add a try/catch here, if this is malformed something is Very Very Wrong
			this.persistentData = JSON.parse(fs.readFileSync(persistenceFilename));
		}
	}

	save() {
		try {
			fs.writeFileSync(`./data/counters.json`, JSON.stringify(this.persistentData));
		} catch(err) {
			global.log("COUNTER", `Could not save persistent counter data`, false, ['redBright']);
			global.logException(err);
		}
	}

	increment(key, value) {
		if(!(key in this.persistentData)) {
			this.persistentData[key] = 0;
		}

		this.persistentData[key] += value;
		global.log("COUNTER", `Added ${value} to ${key}`, false, ['gray']);

		this.save();
	}

	set(key, value) {
		this.persistentData[key] = value;
		global.log("COUNTER", `Set ${key} to ${value}`, false, ['gray']);

		this.save();
	}

	get(key) {
		return key in this.persistentData ? this.persistentData[key] : null;
	}
}