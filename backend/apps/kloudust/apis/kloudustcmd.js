/**
 * Runs Kloudust commands. Should always require JWT token to run.
 * 
 * Request params
 * 	cmd - The command to run, the user ID is auto picked always from the JWT token
 * 	setup - Only valid during special setup mode, if set to true then setup mode will be used if secure
 * 
 * (C) 2020 TekMonks. All rights reserved.
 */

const {AsyncLocalStorage} = require('async_hooks');
const serverutils = require(`${CONSTANTS.LIBDIR}/utils.js`);
const login = require(`${KLOUD_CONSTANTS.APIDIR}/login.js`);
const kloudust = require(`${KLOUD_CONSTANTS.ROOTDIR}/kloudust.js`);

const REQUEST_HASH_KEY = "__org_kloudust_request_hash_", asyncLocalStorage = new AsyncLocalStorage(),
	MEMORY_PROVIDER = global[KLOUD_CONSTANTS.CONF.KLOUDUST_MEMORY_FOR_API_REQUEST_TRACKING];

exports.doService = async (jsonReq={}, _servObject, headers, _url, _apiconf) => {
	const requestHash = serverutils.hashObject(jsonReq), 
		requestID = Date.now()+":"+Math.random().toString().split(".")[1], memory = MEMORY_PROVIDER.get(REQUEST_HASH_KEY, {});
	if ((!KLOUD_CONSTANTS.CONF.DISABLE_DUPLICATE_REQUEST_CHECK) && memory[requestHash]) 
		return _logErrorAndConstructErrorResult(requestID, `Ignoring duplicate request -> ${JSON.stringify(jsonReq)} with hash ${requestHash}`); 

	if (!validateRequest(jsonReq)) return _logErrorAndConstructErrorResult(requestID, 
		`Validation failure for the request -> ${JSON.stringify(jsonReq)}`);
	
    const user = login.getID(headers); if (!user) return _logErrorAndConstructErrorResult(requestID, 
		`Validation failure for the request, missing user ID from headers -> ${JSON.stringify(jsonReq)}`);
	
	_streamHandler(requestID, `Running Kloudust command: ${jsonReq.cmd}`); _setRequestActive(requestHash, true);
    const kdRequest = {user: [user], project: jsonReq.project?[jsonReq.project]:undefined, execute: [jsonReq.cmd],
		setup: jsonReq.setup?[jsonReq.setup]:undefined, consoleStreamHandler: (info, warn, error) => 
			_streamHandler(requestID, info, warn, error), getAsyncStore: _ => asyncLocalStorage};
	const results = await _runKloudustRequestWithTimeout(requestID, kdRequest); _setRequestActive(requestHash, false);
	return {...results, result: results.result, stdout: results.out||"", stderr: results.err||"", exitcode: results.result?0:1};
}

function _streamHandler(id, info, warn, err) {
	if (info && info.toString().trim() != "") KLOUD_CONSTANTS.LOGINFO(`[${id}] ${info}`);
	if (warn && warn.toString().trim() != "") KLOUD_CONSTANTS.LOGWARN(`[${id}] ${warn}`);
	if (err && err.toString().trim() != "") KLOUD_CONSTANTS.LOGERROR(`[${id}] ${err}`);
}

function _setRequestActive(requestHash, active=true) {
	const memory = MEMORY_PROVIDER.get(REQUEST_HASH_KEY, {});
	if (active) { 
		memory[requestHash] = true; 
		setTimeout(_=>_setRequestActive(requestHash, false), 					// auto-cleanup
			KLOUD_CONSTANTS.CONF.DUPLICATE_REQUEST_CHECK_CLEANUP_INTERVAL);
	} else delete memory[requestHash];
	MEMORY_PROVIDER.set(REQUEST_HASH_KEY, memory);
}

function _runKloudustRequestWithTimeout(requestID, kdRequest) {
	return new Promise(async resolve => {
		let isResolved = false; 
		const _timeoutFunction = _ => { isResolved = true; resolve(_logErrorAndConstructErrorResult(
			requestID, "Kloudust command timed out.")); }
		setTimeout(_timeoutFunction, KLOUD_CONSTANTS.CONF.KLOUDUST_CMD_TIMEOUT_FOR_APIS);
		asyncLocalStorage.run({}, async _ => {
			const results = await kloudust.kloudust(kdRequest); if (!isResolved) resolve(results);
		});
		
	})
}

const _logErrorAndConstructErrorResult = (requestID, errorMessage) => { 
	_streamHandler(requestID, undefined, undefined, errorMessage);
	return {stdout: "", out: "", stderr: errorMessage, err: errorMessage, exitcode: 1, ...CONSTANTS.FALSE_RESULT } 
};

const validateRequest = jsonReq => jsonReq && jsonReq.cmd;