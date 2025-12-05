/** 
 * addIPHost.js - Add the given IP to the assignable pool of IP addresses.
 * 
 * Params - 0 - IP Address, 1 - Hostname 
 * 
 * (C) 2025 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Adds the given IP the assignable IP addressses table 
 * @param {array} params The incoming params, see above.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    
    const [ip,hostname] = [...params];

    if (!await dbAbstractor.addIPHost(ip, hostname)) return CMD_CONSTANTS.FALSE_RESULT();

    return {result : true, out: "", err: ""};
}
