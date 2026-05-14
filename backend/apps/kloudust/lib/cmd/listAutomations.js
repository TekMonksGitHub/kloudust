/** 
 * listAutomations.js - Lists active automations.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const automations = require(`${KLOUD_CONSTANTS.LIBDIR}/automations.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Lists the active automations
 * @param {array} params The incoming params - see module comments for param format
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    return automations.listAutomations(params.consoleHandlers, );
}
