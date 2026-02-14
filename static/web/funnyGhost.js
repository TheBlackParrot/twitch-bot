var ghostBuffer = null;

const centeredWidth = 215/2;
const centeredHeight = 296/2;

function calculateAngle(x1, y1, x2, y2) {
	const dy = y1 - y2;
	const dx = x1 - x2;
	let theta = Math.atan2(dy, dx) * (180 / Math.PI);
	if(theta < 0) {
		theta += 360;
	}

	return theta;
}

async function sendFunnyGhost(rotationOffset = -90) {
	if(!ghostBuffer) {
		const response = await fetch("./assets/oOOo.ogg");
		const buffer = await response.arrayBuffer();
		ghostBuffer = await context.decodeAudioData(buffer);
	}

	const source = context.createBufferSource();
		
	const gainNode = context.createGain();
	gainNode.connect(context.destination);

	source.buffer = ghostBuffer;
	source.playbackRate.value = randomFloat(0.9, 1.1);
	gainNode.gain.value = source.playbackRate.value - 0.5;
	source.connect(gainNode).connect(context.destination);
	source.start(0);

	await delay(100);

	const height = $(document).height() - 80;
	const width = $(document).width();

	const scaler = $(`<div class="scaler"></div>`);
	const wiggler = $(`<div class="wiggler"></div>`);
	const sizer = $(`<div class="sizer"></div>`);
	sizer.css("transform", `scale(${((1 - (source.playbackRate.value - 0.1) + 0.8) * 200) - 100}%)`)
	const ghostImage = $(`<img class="spookyGhost" src="assets/spooky.png" />`);
	let rotation = rotationOffset;
	switch(Math.floor(Math.random() * 4)) {
		case 0: // top
			scaler.css("top", `${centeredHeight * -1}px`);
			scaler.css("left", `calc(${centeredWidth * -1}px + ${Math.random() * (width + centeredWidth)}px)`);
			break;
		case 2: // bottom
			scaler.css("top", `${(centeredHeight * -1) + height}px`);
			scaler.css("left", `calc(${centeredWidth * -1}px + ${Math.random() * (width + centeredWidth)}px)`);
			break;
		case 1: // left
			scaler.css("top", `calc(${centeredHeight * -1}px + ${Math.random() * (height + centeredHeight)}px)`);
			scaler.css("left", `${centeredWidth * -1}px`);
			break;
		case 3: // right
			scaler.css("top", `calc(${centeredHeight * -1}px + ${Math.random() * (height + centeredHeight)}px)`);
			scaler.css("left", `${(centeredWidth * -1) + width}px`);
			break;
	}
	sizer.append(ghostImage);
	wiggler.append(sizer);
	scaler.append(wiggler);
	$("body").append(scaler);
	ghostImage.show();

	const position = scaler.position();
	rotation += calculateAngle(position.left, position.top, width/2, height/2);
	ghostImage.css("transform", `rotate(${rotation}deg)`);

	//removeFunnyGhost(scaler);
}

async function removeFunnyGhost(scaler) {
	await delay(2000);
	scaler.remove();
}

async function sendALotOfFunnyGhosts(rotationOffset = -90) {
	for(let i = 0; i < 50; i++) {
		await sendFunnyGhost(rotationOffset);
		await delay(200);
	}
}