/**
 * Login for Kloudust web admin. Needs Tekmonks Unified Login
 * to work.
 * 
 * Operations are
 *  op - getotk - Returns one time key which can be passed to Unified login 
 *  op - verify - Verifies the incoming JWT. This needs the following params
 *      op: "verify", jwt: "the JWT token from unified login", "cmdline": "this login is for command scripts"
 *      Equivalent to login command. Will register the user as org or cloud admin, if allowed by Kloudust.
 * 
 * (C) 2023 TekMonks. All rights reserved.
 */

const {AsyncLocalStorage} = require('async_hooks');
const serverutils = require(`${CONSTANTS.LIBDIR}/utils.js`);
const httpClient = require(`${CONSTANTS.LIBDIR}/httpClient.js`);
const conf = require(`${KLOUD_CONSTANTS.CONFDIR}/kloudust.json`);
const kloudust = require(`${KLOUD_CONSTANTS.ROOTDIR}/kloudust.js`);
const API_JWT_VALIDATION = `${conf.TEKMONKS_LOGIN_BACKEND}/apps/loginapp/validatejwt`;

const ASYNC_LOCAL_STORAGE = new AsyncLocalStorage();

exports.doService = async jsonReq => {
	if (!validateRequest(jsonReq)) {KLOUD_CONSTANTS.LOGERROR("Validation failure."); return CONSTANTS.FALSE_RESULT;}
    
    if (jsonReq.op == "getotk") return _getOTK(jsonReq);
    else if (jsonReq.op == "verify") {
        let result; await ASYNC_LOCAL_STORAGE.run({}, async _ => {result = await _verifyJWT(jsonReq)});
        return result;
    } else return CONSTANTS.FALSE_RESULT;
}

exports.isValidLogin = headers => APIREGISTRY.getExtension("JWTTokenManager").checkToken(exports.getToken(headers));
exports.getID = headers => APIREGISTRY.getExtension("JWTTokenManager").getClaims(headers).id;
exports.getOrg = headers => APIREGISTRY.getExtension("JWTTokenManager").getClaims(headers).org;
exports.getRole = headers => APIREGISTRY.getExtension("JWTTokenManager").getClaims(headers).role;
exports.getName = headers => APIREGISTRY.getExtension("JWTTokenManager").getClaims(headers).name;
exports.getJWT = headers => APIREGISTRY.getExtension("JWTTokenManager").getToken(headers);
exports.getToken = headers => exports.getJWT(headers);

function _getOTK(_jsonReq) {
    return {...CONSTANTS.TRUE_RESULT, otk: serverutils.generateUUID(false)};
}

async function _verifyJWT(jsonReq) {
    let tokenValidationResult; try {
        tokenValidationResult = await httpClient.fetch(
            `${API_JWT_VALIDATION}?jwt=${jsonReq.jwt}${jsonReq.cmdline?"&noonce=true":""}`);    // if not command line, then keep session alive
    } catch (err) {
        KLOUD_CONSTANTS.LOGERROR(`Network error validating JWT token ${jsonReq.jwt}, validation failed.`);
        return CONSTANTS.FALSE_RESULT;
    }

	if (!tokenValidationResult.ok) {
        KLOUD_CONSTANTS.LOGERROR(`Fetch error validating JWT token ${jsonReq.jwt}, validation failed.`);
        return CONSTANTS.FALSE_RESULT;
    }

    const responseJSON = await tokenValidationResult.json();
    if ((!responseJSON.result) || (responseJSON.jwt != jsonReq.jwt)) {
        KLOUD_CONSTANTS.LOGERROR(`Validation error when validating JWT token ${jsonReq.jwt}.`);
        return CONSTANTS.FALSE_RESULT;
    }

    try {
        const _decodeBase64 = string => Buffer.from(string, "base64").toString("utf8");
        const jwtClaims = JSON.parse(_decodeBase64(jsonReq.jwt.split(".")[1]));
        const kdLoginResult = await kloudust.loginUser({user: [jwtClaims.id], org: [jwtClaims.org], 
            loginAssignedRole: [jwtClaims.role], name: [jwtClaims.name], getAsyncStorage: _ => ASYNC_LOCAL_STORAGE}, KLOUD_CONSTANTS);
        if (!kdLoginResult) {
            KLOUD_CONSTANTS.LOGERROR(`Unregistered cloud user login ${jsonReq.jwt}, not allowing.`);
            return CONSTANTS.FALSE_RESULT; 
        } else {
            const finalResult = {...jwtClaims , role: KLOUD_CONSTANTS.env.role()||jwtClaims.role, ...CONSTANTS.TRUE_RESULT};
            return finalResult
        }
    } catch (err) {
        KLOUD_CONSTANTS.LOGERROR(`Bad JWT token passed for login ${jsonReq.jwt}, JWT validation succeeded but JWT claims decode failed. Error is ${err}`);
        return CONSTANTS.FALSE_RESULT;
    }
}

const validateRequest = jsonReq => jsonReq && ((jsonReq.op=="verify" && jsonReq.jwt) || jsonReq.op=="getotk");