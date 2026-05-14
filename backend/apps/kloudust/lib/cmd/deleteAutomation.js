/** 
 * deleteAutomation.js - Deletes an automation. Only the cloud admin can do this.
 * 
 * Params - 0 - name
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const automations = require(`${KLOUD_CONSTANTS.LIBDIR}/automations.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Adds the given automation
 * @param {array} params The incoming params - see module comments for param format
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}

    const [name] = [...params];

    return automations.deleteAutomation(params.consoleHandlers, name);
}
