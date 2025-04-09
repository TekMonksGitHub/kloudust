/** 
 * addIpToHost.js
 * 
 * Params - 0 - hostname, 1 - externalip, 2 - internalip
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Adds the given user to org as an operator. 
 * @param {array} params The incoming params, see above.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.add_user_to_org)) {
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    const [hostname,externalIp,internalIp] = [...params];

    const _hostExists = async (hostname) => {
        const lookupResult = await dbAbstractor.getlistOfHosts();
        const listOfHosts = lookupResult.map(hosts=>hosts.hostname);
        if (listOfHosts.includes(hostname)) return true; else return false;
    }

    if (!await _hostExists(hostname)) {params.consoleHandlers.LOGERROR("hostname does not exist"); 
        return CMD_CONSTANTS.FALSE_RESULT("hostname does not exist");}  

    const result = await dbAbstractor.addOrUpdateHostIpMappingToDB(hostname,externalIp,internalIp);
    return {result, out: "", err: ""};
}
