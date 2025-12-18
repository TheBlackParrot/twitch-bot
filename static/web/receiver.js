const delay = ms => new Promise(res => setTimeout(res, ms));

const AudioContext = window.AudioContext || window.webkitAudioContext;
const context = new AudioContext();

const noiseBuffer = new AudioBuffer({
	length: context.sampleRate,
	sampleRate: context.sampleRate
});

const noiseData = noiseBuffer.getChannelData(0);
for(let i = 0; i < context.sampleRate; i++) {
	noiseData[i] = Math.random() / 20;
}

var noise = new AudioBufferSourceNode(context, {
	buffer: noiseBuffer,
	loop: true
});

const noiseLowPassFilter = new BiquadFilterNode(context, {
	type: "lowpass",
	frequency: 400
});

const noiseGain = context.createGain();
noiseGain.gain.value = 0.055;

noise.connect(noiseGain).connect(noiseLowPassFilter).connect(context.destination);

var ws;
var reconnectTimeout;
function initConnection() {
	ws = new WebSocket('ws://127.0.0.1:6900');

	ws.addEventListener("open", handleOpen);
	ws.addEventListener("close", handleClose);
	ws.addEventListener("message", handleMessage);
}
function handleOpen() {
	clearTimeout(reconnectTimeout);
	
	console.log("Connected");

	noise.start();
}
function handleClose() {
	clearTimeout(reconnectTimeout);
	reconnectTimeout = setTimeout(initConnection, 7000);

	console.log("Connection dropped");

	noise.stop();
}

function randomFloat(min = 0, max = 1) {
	if(min > max) { return NaN; }
	else if(min === max) { return min; }

	return min + (Math.random() * (max - min));
}

var soundCache = {};
async function handleMessage(event) {
	const data = JSON.parse(event.data);
	const audioData = data.data;

	if(data.event == "data") {
		soundCache[audioData.name] = await context.decodeAudioData(Uint8Array.fromBase64(audioData.audio).buffer);
		return;
	}

	if(data.event == "sound") {
		if(!(audioData.name in soundCache)) {
			console.log(`${audioData.name} is not cached, requesting data...`);
			ws.send(audioData.name);

			while(!(audioData.name in soundCache)) {
				await delay(100);
			}

			console.log(`${audioData.name} is now cached`);
		} else {
			console.log(`${audioData.name} is cached`);
		}

		const source = context.createBufferSource();
		
		const gainNode = context.createGain();
		gainNode.connect(context.destination);
		gainNode.gain.value = data.data.volume;
		
		source.buffer = soundCache[audioData.name];
		source.playbackRate.value = randomFloat(audioData.pitchRange[0], audioData.pitchRange[1]);
		source.connect(gainNode).connect(context.destination);
		source.start(0);
	}
}

initConnection();