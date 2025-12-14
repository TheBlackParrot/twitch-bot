import WebSocket from 'ws';

export class WebSocketListener {
	constructor(url, trigger = null, opts = {}) {
		this.url = url;

		this.logData = "logData" in opts ? opts.logData : false;

		this.restart = "restart" in opts ? opts.restart : true;
		this.restartDelay = "restartDelay" in opts ? opts.restartDelay : 15;

		this.restartTimeout = null;
		this.trigger = trigger;

		this.initializeWebsocket();
	}

	onOpen = function() {
		clearTimeout(this.restartTimeout);
		global.log("SOCKET", `Established connection to ${this.url}`);
	}

	onClose = function() {
		global.log("SOCKET", `Connection to ${this.url} closed`);

		if(this.restart) {
			clearTimeout(this.restartTimeout);
			this.restartTimeout = setTimeout(() => { this.initializeWebsocket() }, this.restartDelay * 1000);
		} else {
			global.log("SOCKET", `Not restarting connection to ${this.url}`);
		}
	}

	onError = function(error) {
	}

	onMessage = function(data) {
		if(this.logData) {
			global.log("SOCKET", `Data from ${this.url}:`);
			global.log("SOCKET", data);
		}

		if(this.trigger) {
			this.trigger(data);
		}
	}

	initializeWebsocket() {
		this.socket = new WebSocket(this.url);

		this.socket.on('open', () => { this.onOpen(); });
		this.socket.on('close', () => { this.onClose(); });
		this.socket.on('message', (data) => { this.onMessage(data); });
		this.socket.on('error', (error) => { this.onError(error); });
	}
}