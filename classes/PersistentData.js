import * as fs from 'fs';

export class PersistentData {
	constructor(name, loadPreviousData = true) {
		this.name = name;
		this.data = {};
		this.allowSaving = false;
		this.savingTimeout = null;

		const persistenceFilename = `./data/${this.name}.json`;

		if(fs.existsSync(persistenceFilename) && loadPreviousData) {
			try {
				this.data = JSON.parse(fs.readFileSync(persistenceFilename));
				this.allowSaving = true;
				global.log("PERSISTENCE", `Loaded persistent data (${this.name})`);
			} catch(err) {
				global.log("PERSISTENCE", `Could not load persistent data (${this.name})`, false, ['redBright']);
				global.logException(err);
			}
		} else if(!loadPreviousData) {
			this.allowSaving = true;
			global.log("PERSISTENCE", `Skipping loading persistent data (${this.name})`);
		}
	}

	save() {
		if(!this.allowSaving) {
			return;
		}

		if(this.savingTimeout) {
			clearTimeout(this.savingTimeout);
		}

		this.savingTimeout = setTimeout(this.actuallySave, 100);
	}

	actuallySave() {
		if(!this.allowSaving) {
			return;
		}

		try {
			fs.writeFileSync(`./data/${this.name}.json`, JSON.stringify(this.data));
		} catch(err) {
			global.log("PERSISTENCE", `Could not save persistent data (${this.name})`, false, ['redBright']);
			global.logException(err);
		}
	}

	set(key, value) {
		this.data[key] = value;
		global.log("PERSISTENCE", `Set ${key} to ${value} in ${this.name}`, false, ['gray']);

		this.save();
	}

	increment(key, amount) {
		this.data[key] += value;
		global.log("PERSISTENCE", `Added ${value} to ${key} in ${this.name}`, false, ['gray']);

		this.save();
	}

	get(key) {
		return key in this.data ? this.data[key] : undefined;
	}
}