import  { WebSocketServer as wss } from 'ws';

export class WebSocketServer {
	constructor(triggers = { "onMessage": null }) {
		this.triggers = triggers;

		this.server = new wss({
			host: global.settings.bot.socket.host,
			port: global.settings.bot.socket.port
		});

		this.server.on('connection', this.onConnect.bind(this));
	}

	onConnect(connection) {
		global.log("SERVER", "Client connected", false, ['green']);

		if("onMessage" in this.triggers) {
			if(this.triggers.onMessage) {
				connection.on('message', this.triggers.onMessage.bind(this));
				connection.on('close', this.onClose.bind(this));
			}
		}
	}

	onClose(connection) {
		global.log("SERVER", "Client disconnected", false, ['red']);
	}

	send(data) {
		// i hate this
		this.server.clients.forEach(function(client) {
			if(client.readyState === WebSocket.OPEN) {
				client.send(data);
			}
		});
	}
}