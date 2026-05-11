/** 
 * automations.js - Runs automations
 * 
 * Params - 0 - Automation name, 
 *          1... passed onwards to the Kloudust command script
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Adds the given VM to the given Virtual Network.
 * @param {array} params The incoming params, see above for param documentation.
 */
exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const [automation, ...scriptparams] = [params];
    scriptparams.consoleHandlers = params.consoleHandlers;

    const automationModule = require(`${KLOUD_CONSTANTS.AUTOMATIONS_DIR}/${automation}`);
    const results = await automationModule.exec(scriptparams);
    return results;
}
