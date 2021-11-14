const fetch = require('node-fetch');
const { promises: fs } = require('fs');

const BASE_URL = `https://live.billiejeankingcup.com//feeds/d/roundrobin.php/en/W-FC-2021-FLS`;

async function fetchAndReturnJson(url, options = {}) {
	const resp = await fetch(url, options);
	const json = await resp.json();
	return json;
}

async function getAllTies() {
	const allTies = await fetchAndReturnJson(BASE_URL, {
		method: "GET",
		headers: {
			"Accept": "application/json, text/javascript, */*; q=0.01",
			"Accept-Encoding": "gzip, deflate, br",
			"Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
			"Connection": "keep-alive",
			"Host": "live.billiejeankingcup.com",
			"Referer": BASE_URL,
			"Transfer-Encoding": "",
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36",
			"X-Requested-With": "XMLHttpRequest"
		}
	});

	return allTies;
}

async function saveFile(pathAndFileName, content) {
	await fs.writeFile(pathAndFileName, content, function(err) {
		if (err) {
			console.error(`Error while saving the file in ${pathAndFileName}`);
            console.error(err);
        }
    });
}

/**
 * 
 * @param {*} allTies 
 * @param {*} someTies 
 * @param {*} phase 
 * @returns
	{
		"groupOrPhase": "A",
		"homeCountry": "RTF",
		"awayCountry": "CAN",
		"tieId": "W-FC-2021-FLS-A-M-RTF-CAN-01",
		"matchesId": [
			30226797,
			30225679,
			30237117
		]
	}
 */
function addTiesToArray(allTies, someTies, phase) {
	someTies.forEach(tie => {
		let myTie = {
			"groupOrPhase": phase, 								// A, B, C, D, SF or F
			"tieId": tie["_id"],
			"homeCountry": tie["home"],
			"awayCountry": tie["away"],
			"matchesId": Object.values(tie["allrubbers"])
		};
		allTies.push(myTie);
	});
}

function processAllTiesRaw(allTiesRaw) {
	let allTies = [];

	const groupATies = allTiesRaw["sections"]["pools"]["FLS-A-M"]["ties"];
	const groupBTies = allTiesRaw["sections"]["pools"]["FLS-B-M"]["ties"];
	const groupCTies = allTiesRaw["sections"]["pools"]["FLS-C-M"]["ties"];
	const groupDTies = allTiesRaw["sections"]["pools"]["FLS-D-M"]["ties"];
	const semifinalsTies = allTiesRaw["sections"]["playoffs"]["FLS-M-1"]["ties"];
	const finalsTies = allTiesRaw["sections"]["playoffs"]["FLS-M-2"]["ties"];

	addTiesToArray(allTies, groupATies, "A");
	addTiesToArray(allTies, groupBTies, "B");
	addTiesToArray(allTies, groupCTies, "C");
	addTiesToArray(allTies, groupDTies, "D");
	addTiesToArray(allTies, semifinalsTies, "SF");
	addTiesToArray(allTies, finalsTies, "F");

	return allTies;
}

async function fetchMatchInfoAndDetails(matchId) {
	let [matchInfo, matchDetails] = await Promise.all([
		fetchAndReturnJson(`https://ls.fn.sportradar.com/itf/en/Europe:Berlin/gismo/match_info/${matchId}`),
		fetchAndReturnJson(`https://ls.fn.sportradar.com/itf/en/Europe:Berlin/gismo/match_detailsextended/${matchId}`)
	]);

	return [matchInfo, matchDetails];
}

function addPlayerToAllPlayers(allPlayers, player) {
	// only if it's not already present
	if (!allPlayers.hasOwnProperty(player["_id"])) {
		allPlayers[player["_id"]] = {
			"playerId": player["_id"],
			"playerName": player["name"],
			"playerCountry": player["cc"]["a3"]
		};
	}
}

function addPlayerToPlayersOfThisMatch(playersOfThisMatch, homeOrAway, player) {
	playersOfThisMatch[homeOrAway].push(player["_id"]);
}

function addMatchPlayersToAllPlayers(allPlayers, matchInfo) {
	const teamHome = matchInfo["doc"][0]["data"]["match"]["teams"]["home"];
	const teamAway = matchInfo["doc"][0]["data"]["match"]["teams"]["away"];
	const isDoubles = teamHome.hasOwnProperty("children") && teamAway.hasOwnProperty("children");

	if (isDoubles) {
		addPlayerToAllPlayers(allPlayers, teamHome["children"][0]);
		addPlayerToAllPlayers(allPlayers, teamHome["children"][1]);
		addPlayerToAllPlayers(allPlayers, teamAway["children"][0]);
		addPlayerToAllPlayers(allPlayers, teamAway["children"][1]);
	} else {
		addPlayerToAllPlayers(allPlayers, teamHome);
		addPlayerToAllPlayers(allPlayers, teamAway);
	}

	return isDoubles;
}

function fillAllMatchesServeSpeedStats(allMatchesServeSpeedStats, allPlayers, fastest1stServeRaw, tieId, matchId, isDoubles) {
	let homePlayerIds = Object.keys(fastest1stServeRaw["home_children"]);
	let awayPlayerIds = Object.keys(fastest1stServeRaw["away_children"]);
	let homeAndAwayPlayerIds = [...homePlayerIds, ...awayPlayerIds];
	homeAndAwayPlayerIds.forEach(playerId => {
		let key = `${tieId}__${matchId}__${playerId}`;
		if (!allMatchesServeSpeedStats.hasOwnProperty(key)) {
			allMatchesServeSpeedStats[key] = {
				"tieId": tieId,
				"matchId": matchId,
				"isDoubles": isDoubles,
				"playerId": Number(playerId),
				"playerCountry": allPlayers[playerId]["playerCountry"],
				"playerName": allPlayers[playerId]["playerName"],
				"fastest1stServe": 0,
				"fastest2ndServe": 0,
				"average1stServe": 0,
				"average2ndServe": 0,
			};
		}
	});
}

/**
 * 
 * @param {*} allMatchesServeSpeedStats 
 * @param {*} serveStat fastest1stServeRaw | fastest2ndServeRaw | average1stServeRaw | average2ndServeRaw
 * @param {*} keyForStat "fastest1stServe" | "fastest2ndServe" | "average1stServe" | "average2ndServe"
 * @param {*} tieId 
 * @param {*} matchId 
 */
function addMatchServeStatToallMatchesServeSpeedStats(allMatchesServeSpeedStats, serveStatRaw, keyForStat, tieId, matchId) {
	Object.keys(serveStatRaw["home_children"]).forEach(playerId => {
		let key = `${tieId}__${matchId}__${playerId}`;
		allMatchesServeSpeedStats[key][keyForStat] = Number(serveStatRaw["home_children"][playerId]);
	});
	Object.keys(serveStatRaw["away_children"]).forEach(playerId => {
		let key = `${tieId}__${matchId}__${playerId}`;
		allMatchesServeSpeedStats[key][keyForStat] = Number(serveStatRaw["away_children"][playerId]);
	});
}

function processServeStats(allMatchesServeSpeedStats, allPlayers, matchDetails, tieId, matchId, isDoubles) {
	const fastest1stServeRaw = matchDetails["doc"][0]["data"]["values"]["2033"]["value"];
	const fastest2ndServeRaw = matchDetails["doc"][0]["data"]["values"]["2034"]["value"];
	const average1stServeRaw = matchDetails["doc"][0]["data"]["values"]["2035"]["value"];
	const average2ndServeRaw = matchDetails["doc"][0]["data"]["values"]["2036"]["value"];

	fillAllMatchesServeSpeedStats(allMatchesServeSpeedStats, allPlayers, fastest1stServeRaw, tieId, matchId, isDoubles);

	addMatchServeStatToallMatchesServeSpeedStats(allMatchesServeSpeedStats, fastest1stServeRaw, "fastest1stServe", tieId, matchId);
	addMatchServeStatToallMatchesServeSpeedStats(allMatchesServeSpeedStats, fastest2ndServeRaw, "fastest2ndServe", tieId, matchId);
	addMatchServeStatToallMatchesServeSpeedStats(allMatchesServeSpeedStats, average1stServeRaw, "average1stServe", tieId, matchId);
	addMatchServeStatToallMatchesServeSpeedStats(allMatchesServeSpeedStats, average2ndServeRaw, "average2ndServe", tieId, matchId);
}

function processMatchStats(allMatchesStats, allMatchesServeSpeedStats, allPlayers, matchDetails, tieId, matchId, isDoubles) {
	if (!matchDetails["doc"][0]["data"].hasOwnProperty("values")) {
		console.log("No values in details", tieId, matchId);
		return;
	}

	processServeStats(allMatchesServeSpeedStats, allPlayers, matchDetails, tieId, matchId, isDoubles);
}

async function randomWaitBetweenMs(minMsToWait, maxMsToWait) {
	let msToWait = Math.floor(Math.random() * (maxMsToWait - minMsToWait + 1) + minMsToWait);
	await new Promise(resolve => setTimeout(resolve, msToWait));
}

async function saveAllMatchesServeSpeedStatsInCsvAndJson(allMatchesServeSpeedStats) {
	let csvStringAllMatchesServeSpeedStats = "tieId,matchId,isDoubles,playerId,playerCountry,playerName,fastest1stServe,fastest2ndServe,average1stServe,average2ndServe";
	for (const matchServeStat of allMatchesServeSpeedStats) {
		// escape commas in name
		let escapedPlayerName = matchServeStat["playerName"];
		if (escapedPlayerName.includes(",")) {
			escapedPlayerName = `"${escapedPlayerName}"`;
		}
		
		let stringLineToAdd = `\n${matchServeStat["tieId"]},${matchServeStat["matchId"]},${matchServeStat["isDoubles"]},${matchServeStat["playerId"]},${matchServeStat["playerCountry"]},${escapedPlayerName},${matchServeStat["fastest1stServe"]},${matchServeStat["fastest2ndServe"]},${matchServeStat["average1stServe"]},${matchServeStat["average2ndServe"]}`;
		csvStringAllMatchesServeSpeedStats += stringLineToAdd;
	}

	await saveFile(`files/allMatchesServeSpeedStats.json`, JSON.stringify(allMatchesServeSpeedStats, null, 4));
	await saveFile(`files/allMatchesServeSpeedStats.csv`, csvStringAllMatchesServeSpeedStats);
}

async function saveAllPlayersInCsvAndJson(allPlayers) {
	let csvStringAllPlayers = "playerId,playerCountry,playerName";
	for (const player of Object.values(allPlayers)) {
		// escape commas in name
		let escapedPlayerName = player["playerName"];
		if (escapedPlayerName.includes(",")) {
			escapedPlayerName = `"${escapedPlayerName}"`;
		}
		
		let stringLineToAdd = `\n${player["playerId"]},${player["playerCountry"]},${escapedPlayerName}`;
		csvStringAllPlayers += stringLineToAdd;
	}
	await saveFile(`files/allPlayers.json`, JSON.stringify(allPlayers, null, 4));
	await saveFile(`files/allPlayers.csv`, csvStringAllPlayers);
}

(async function() {
	console.time("BJK Cup Finals stats fetch");
	
	try {
		let allPlayers = {};
		let allMatchesStats = [];
		let allMatchesServeSpeedStats = [];

		const allTiesRaw = await getAllTies();
		let allTies = processAllTiesRaw(allTiesRaw);
		
		for (let i = 0; i < allTies.length; i++) {
			const tie = allTies[i];
			const tieId = tie["tieId"];
			const matchesId = tie["matchesId"];
			
			console.log(`Tie ${tieId}`);

			for (let j = 0; j < matchesId.length; j++) {
				const matchId = matchesId[j];
				console.log(`  Match ${matchId}`);

				const [matchInfo, matchDetails] = await fetchMatchInfoAndDetails(matchId);

				const isDoubles = addMatchPlayersToAllPlayers(allPlayers, matchInfo)

				const isCanceledMatch = matchInfo["doc"][0]["data"]["match"]["cancelled"];
				if (isCanceledMatch) {
					console.log(`    Match ${matchId} canceled (${tieId})`);
					continue;
				}

				processMatchStats(allMatchesStats, allMatchesServeSpeedStats, allPlayers, matchDetails, tieId, matchId, isDoubles);
				
				// random wait before going to another match
				await randomWaitBetweenMs(minMsToWait=134, maxMsToWait=468);
			}
			
			// random wait before going to another tie
			await randomWaitBetweenMs(minMsToWait=891, maxMsToWait=1226);

			console.log("-----");
		}
		allMatchesServeSpeedStats = Object.values(allMatchesServeSpeedStats);

		await saveAllMatchesServeSpeedStatsInCsvAndJson(allMatchesServeSpeedStats);

		await saveAllPlayersInCsvAndJson(allPlayers);
	} catch(err) {
		console.error(err);
		console.trace(err);
	}

	console.timeEnd("BJK Cup Finals stats fetch");
})();