/** 
 * createFirewall.js - 
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Lists the host catalog
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [name , rules] = [...params]
    if(!rules){params.consoleHandlers.LOGERROR("enter ip adress and port"); return CMD_CONSTANTS.FALSE_RESULT("enter ip adress and port");}
    const parseBoolean = (str) => str.toLowerCase() === "true";
    const ruleSets =  rules.split('|').map(rule => {
        const [direction, allow, protocol, ip, port] = rule.split(',');
        return {
            direction,
            allow: parseBoolean(allow),
            protocol,
            ip,
            port
        };
    });
    const dbUpdateSuccess = await dbAbstractor.addOrUpdateFirewallRulesToDB(name, JSON.stringify(ruleSets));
    if (dbUpdateSuccess) return { result: true };

    params.consoleHandlers.LOGERROR("DB failed");
    return CMD_CONSTANTS.FALSE_RESULT();
}