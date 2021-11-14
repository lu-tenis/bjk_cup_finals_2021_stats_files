const fetch = require('node-fetch');
const { promises: fs } = require('fs');

async function saveFile(pathAndFileName, content) {
	await fs.writeFile(pathAndFileName, content, function(err) {
		if (err) {
			console.error(`Error while saving the file in ${pathAndFileName}`);
            console.error(err);
        }
    });
}

async function readFile(pathAndFileName) {
	let content = await fs.readFile(pathAndFileName);
	let jsonContent = JSON.parse(content);
	return jsonContent;
}

function getFastestServeSpeedsPerPlayer(allMatchesServeSpeedStats, allPlayers) {
	const allDistinctPlayers = Array.from(new Set(Object.values(allMatchesServeSpeedStats).map(m => m["playerId"])));
	let fastestServeSpeedsPerPlayer = [];

	for (const playerId of allDistinctPlayers) {
		let fastestServeSpeedsForThisPlayer = {
			"playerId": playerId,
			"playerCountry": allPlayers[playerId]["playerCountry"],
			"playerName": allPlayers[playerId]["playerName"],
			"fastest1stServe": 0,
			"typeMatchFastest1stServe": "",
			"fastest2ndServe": 0,
			"typeMatchFastest2ndServe": "",
			"average1stServe": 0,
			"typeMatchAverage1stServe": "",
			"average2ndServe": 0,
			"typeMatchAverage2ndServe": "",
		};

		let matchesForThisPlayer = allMatchesServeSpeedStats.filter(e => e["playerId"] === playerId);
		for (const match of matchesForThisPlayer) {
			if (match["fastest1stServe"] > fastestServeSpeedsForThisPlayer["fastest1stServe"]) {
				fastestServeSpeedsForThisPlayer["fastest1stServe"] = match["fastest1stServe"];
				fastestServeSpeedsForThisPlayer["typeMatchFastest1stServe"] = match["isDoubles"] ? "doubles": "singles";
			}
			if (match["fastest2ndServe"] > fastestServeSpeedsForThisPlayer["fastest2ndServe"]) {
				fastestServeSpeedsForThisPlayer["fastest2ndServe"] = match["fastest2ndServe"];
				fastestServeSpeedsForThisPlayer["typeMatchFastest2ndServe"] = match["isDoubles"] ? "doubles": "singles";
			}
			if (match["average1stServe"] > fastestServeSpeedsForThisPlayer["average1stServe"]) {
				fastestServeSpeedsForThisPlayer["average1stServe"] = match["average1stServe"];
				fastestServeSpeedsForThisPlayer["typeMatchAverage1stServe"] = match["isDoubles"] ? "doubles": "singles";
			}
			if (match["average2ndServe"] > fastestServeSpeedsForThisPlayer["average2ndServe"]) {
				fastestServeSpeedsForThisPlayer["average2ndServe"] = match["average2ndServe"];
				fastestServeSpeedsForThisPlayer["typeMatchAverage2ndServe"] = match["isDoubles"] ? "doubles": "singles";
			}
		}

		fastestServeSpeedsPerPlayer.push(fastestServeSpeedsForThisPlayer);
	}

	return fastestServeSpeedsPerPlayer;
}

async function saveFastestServeSpeedsPerPlayer(fastestServeSpeedsPerPlayer) {
	let csvStringFastestServeSpeedsPerPlayer = "playerId,playerCountry,playerName,fastest1stServe,typeMatchFastest1stServe,order_fastest1stServe,fastest2ndServe,typeMatchFastest2ndServe,order_fastest2ndServe,average1stServe,typeMatchAverage1stServe,order_average1stServe,average2ndServe,typeMatchAverage2ndServe,order_average2ndServe";
	for (const fastestServeSpeed of fastestServeSpeedsPerPlayer) {
		// escape commas in name
		let escapedPlayerName = fastestServeSpeed["playerName"];
		if (escapedPlayerName.includes(",")) {
			escapedPlayerName = `"${escapedPlayerName}"`;
		}
		
		let stringLineToAdd = `\n${fastestServeSpeed["playerId"]},${fastestServeSpeed["playerCountry"]},${escapedPlayerName},${fastestServeSpeed["fastest1stServe"]},${fastestServeSpeed["typeMatchFastest1stServe"]},${fastestServeSpeed["order_fastest1stServe"]},${fastestServeSpeed["fastest2ndServe"]},${fastestServeSpeed["typeMatchFastest2ndServe"]},${fastestServeSpeed["order_fastest2ndServe"]},${fastestServeSpeed["average1stServe"]},${fastestServeSpeed["typeMatchAverage1stServe"]},${fastestServeSpeed["order_average1stServe"]},${fastestServeSpeed["average2ndServe"]},${fastestServeSpeed["typeMatchAverage2ndServe"]},${fastestServeSpeed["order_average2ndServe"]}`;
		csvStringFastestServeSpeedsPerPlayer += stringLineToAdd;
	}
	await saveFile(`files/fastestServeSpeedsPerPlayer.json`, JSON.stringify(fastestServeSpeedsPerPlayer, null, 4));
	await saveFile(`files/fastestServeSpeedsPerPlayer.csv`, csvStringFastestServeSpeedsPerPlayer);
}

function sortByKey(fastestServeSpeedsPerPlayer, key, ascendingOrDescending) {
	fastestServeSpeedsPerPlayer.sort((a, b) => {
		if (a[key] < b[key]) {
			return ascendingOrDescending === "descending" ? 1 : -1;
		} else if (a[key] > b[key]) {
			return ascendingOrDescending === "descending" ? -1 : 1;
		} else {
			return 0;
		}
	});
}

function addOrderForKey(fastestServeSpeedsPerPlayer, key) {
	for (let i = 0; i < fastestServeSpeedsPerPlayer.length; i++) {
		const isNotOrderOriginal = !fastestServeSpeedsPerPlayer[i].hasOwnProperty(key);
		const isFirstRow = i === 0;
		if (isNotOrderOriginal || isFirstRow) {
			fastestServeSpeedsPerPlayer[i][`order_${key}`] = i+1;
			continue;
		}

		const isEqualToPreviousRow = fastestServeSpeedsPerPlayer[i][key] === fastestServeSpeedsPerPlayer[i-1][key];
		if (isEqualToPreviousRow) {
			fastestServeSpeedsPerPlayer[i][`order_${key}`] = fastestServeSpeedsPerPlayer[i-1][`order_${key}`];
		} else {
			fastestServeSpeedsPerPlayer[i][`order_${key}`] = i+1;
		}
	}
}

function deleteKey(fastestServeSpeedsPerPlayer, key) {
	for (let i = 0; i < fastestServeSpeedsPerPlayer.length; i++) {
		delete fastestServeSpeedsPerPlayer[i][key];
	}
}

function createOverallOrder(fastestServeSpeedsPerPlayer) {
	for (let i = 0; i < fastestServeSpeedsPerPlayer.length; i++) {
		fastestServeSpeedsPerPlayer[i]["order_overall"] = fastestServeSpeedsPerPlayer[i]["order_fastest1stServe"] + fastestServeSpeedsPerPlayer[i]["order_fastest2ndServe"] + fastestServeSpeedsPerPlayer[i]["order_average1stServe"] + fastestServeSpeedsPerPlayer[i]["order_average2ndServe"];
	}
}

function addOrderForServeSpeedStats(fastestServeSpeedsPerPlayer) {
	addOrderForKey(fastestServeSpeedsPerPlayer, "original");

	sortByKey(fastestServeSpeedsPerPlayer, "fastest1stServe", "descending");
	addOrderForKey(fastestServeSpeedsPerPlayer, "fastest1stServe");

	sortByKey(fastestServeSpeedsPerPlayer, "fastest2ndServe", "descending");
	addOrderForKey(fastestServeSpeedsPerPlayer, "fastest2ndServe");
	
	sortByKey(fastestServeSpeedsPerPlayer, "average1stServe", "descending");
	addOrderForKey(fastestServeSpeedsPerPlayer, "average1stServe");
	
	sortByKey(fastestServeSpeedsPerPlayer, "average2ndServe", "descending");
	addOrderForKey(fastestServeSpeedsPerPlayer, "average2ndServe");
	
	sortByKey(fastestServeSpeedsPerPlayer, "order_original", "ascending");
	deleteKey(fastestServeSpeedsPerPlayer, "order_original");

	createOverallOrder(fastestServeSpeedsPerPlayer);
}

(async function() {
	console.time("BJK Cup Finals stats process");
	
	try {
		let allPlayers = await readFile(`files/allPlayers.json`);
		let allMatchesServeSpeedStats = await readFile(`files/allMatchesServeSpeedStats.json`);

		
		let fastestServeSpeedsPerPlayer = getFastestServeSpeedsPerPlayer(allMatchesServeSpeedStats, allPlayers);
		
		addOrderForServeSpeedStats(fastestServeSpeedsPerPlayer);
		
		await saveFastestServeSpeedsPerPlayer(fastestServeSpeedsPerPlayer);
	} catch(err) {
		console.error(err);
		console.trace(err);
	}

	console.timeEnd("BJK Cup Finals stats process");
})();