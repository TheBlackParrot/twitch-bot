import axios from 'axios';

async function fuck() {
	//console.log(await axios.get('http://127.0.0.1:8880/api/player'));
	await axios.post('http://127.0.0.1:8880/api/player', {
		volume: -10
	});
}
fuck();