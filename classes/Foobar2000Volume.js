import axios from 'axios';

function linearInterpolate(a, b, val) {
	return a + (b - a) * val;
};

export class Foobar2000Volume {
	constructor() {
		this.currentVolume = 0;
		this.targetVolume = 0;

		this.loopTimeout;

		this.initValues();
	}

	async initValues() {
		const rootResponse = await axios.get(`http://${global.settings.foobar.address}/api/player`).catch((err) => {
			console.error(err);
		});

		this.currentVolume = rootResponse.data.player.volume.value;
		this.targetVolume = rootResponse.data.player.volume.value;

		this.startUpdates();
	}

	startUpdates() {
		this.loopTimeout = setTimeout(this.update.bind(this), 100);
	}

	async update() {
		clearTimeout(this.loopTimeout);

		if(this.currentVolume == this.targetVolume) {
			this.loopTimeout = setTimeout(this.update.bind(this), 1000);
			return;
		}

		let current = this.currentVolume;
		let target = this.targetVolume;

		const position = current > target ? Math.pow(current / target, 5) : Math.pow(target / current, 5);
		this.currentVolume = parseFloat(current > target ? linearInterpolate(current, target, position) : linearInterpolate(target, current, Math.sin(1 - position)).toFixed(2));

		if(this.currentVolume <= -98 && this.targetVolume <= -99) {
			this.currentVolume = -100;
		}

		await axios.post(`http://${global.settings.foobar.address}/api/player`, { volume: this.currentVolume }).catch((err) => {});
		this.loopTimeout = setTimeout(this.update.bind(this), 100);
	}
}
