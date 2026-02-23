import WebSocket from 'ws';

export class WebSocketListener {
	constructor(url, triggers = { "onMessage": null }, opts = {}) {
		this.url = url;

		this.logData = "logData" in opts ? opts.logData : false;

		this.restart = "restart" in opts ? opts.restart : true;
		this.restartDelay = "restartDelay" in opts ? opts.restartDelay : 15;

		this.restartTimeout = null;
		this.triggers = triggers;

		this.initializeWebsocket();
	}

	onOpen = function() {
		clearTimeout(this.restartTimeout);
		global.log("SOCKET", `Established connection to ${this.url}`, false, ['greenBright']);

		if("onOpen" in this.triggers) {
			if(this.triggers.onOpen) {
				this.triggers.onOpen();
			}
		}
	}

	onClose = function() {
		global.log("SOCKET", `Connection to ${this.url} closed`, false, ['redBright']);

		if(this.restart) {
			clearTimeout(this.restartTimeout);
			this.restartTimeout = setTimeout(() => { this.initializeWebsocket() }, this.restartDelay * 1000);
		} else {
			global.log("SOCKET", `Not restarting connection to ${this.url}`, false, ['yellow']);
		}

		if("onClose" in this.triggers) {
			if(this.triggers.onClose) {
				this.triggers.onClose();
			}
		}
	}

	onError = function(error) {
	}

	onMessage = function(data) {
		if(this.logData) {
			global.log("SOCKET", `Data from ${this.url}:`);
			global.log("SOCKET", data.toString());
		}

		if("onMessage" in this.triggers) {
			if(this.triggers.onMessage) {
				this.triggers.onMessage(data);
			}
		}
	}

	send = function(data) {
		this.socket.send(data);
	}

	get readyState() {
		if(typeof(this.socket) === "undefined") {
			return -1;
		}

		return this.socket.readyState;
	}

	initializeWebsocket() {
		this.socket = new WebSocket(this.url);

		this.socket.on('open', () => { this.onOpen(); });
		this.socket.on('close', () => { this.onClose(); });
		this.socket.on('message', (data) => { this.onMessage(data); });
		this.socket.on('error', (error) => { this.onError(error); });
	}
}