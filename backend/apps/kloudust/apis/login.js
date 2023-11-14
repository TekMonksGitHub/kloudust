/**
 * Login for Kloudust web admin. Needs Tekmonks Unified Login
 * to work.
 * 
 * Operations are
 *  op - getotk - Returns one time key which can be passed to Unified login 
 *  op - verify - Verifies the incoming JWT. This needs the following params
 *      op: "verify", jwt: "the JWT token from unified login", "cmdline": "this login is for command scripts"
 * 
 * (C) 2023 TekMonks. All rights reserved.
 */

const serverutils = require(`${CONSTANTS.LIBDIR}/utils.js`);
const httpClient = require(`${CONSTANTS.LIBDIR}/httpClient.js`);

const conf = require(`${KLOUD_CONSTANTS.CONFDIR}/kloudust.json`);
const API_JWT_VALIDATION = `${conf.tekmonkslogin_backend}/apps/loginapp/validatejwt`;

exports.doService = async jsonReq => {
	if (!validateRequest(jsonReq)) {KLOUD_CONSTANTS.LOGERROR("Validation failure."); return CONSTANTS.FALSE_RESULT;}
    
    if (jsonReq.op == "getotk") return _getOTK(jsonReq);
    else if (jsonReq.op == "verify") return await _verifyJWT(jsonReq);
    else return CONSTANTS.FALSE_RESULT;
}

exports.isValidLogin = headers => APIREGISTRY.getExtension("JWTTokenManager").checkToken(exports.getToken(headers));
exports.getID = headers => APIREGISTRY.getExtension("JWTTokenManager").getClaims(headers).id;
exports.getJWT = headers => APIREGISTRY.getExtension("JWTTokenManager").getToken(headers);


function _getOTK(_jsonReq) {
    return {...CONSTANTS.TRUE_RESULT, otk: serverutils.generateUUID(false)};
}

async function _verifyJWT(jsonReq) {
    let tokenValidationResult; try {
        tokenValidationResult = await httpClient.fetch(
            `${API_JWT_VALIDATION}?jwt=${jsonReq.jwt}${jsonReq.cmdline?"&noonce=true":""}`);
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
        return {...jwtClaims , ...CONSTANTS.TRUE_RESULT};
    } catch (err) {
        KLOUD_CONSTANTS.LOGERROR(`Bad JWT token passwed for login ${jsonReq.jwt}, validation succeeded but decode failed.`);
        return CONSTANTS.FALSE_RESULT;
    }
}

const validateRequest = jsonReq => jsonReq && ((jsonReq.op=="verify" && jsonReq.jwt) || jsonReq.op=="getotk");