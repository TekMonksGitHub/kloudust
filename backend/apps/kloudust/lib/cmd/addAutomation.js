/** 
 * addAutomation.js - Adds a new automation. Only the cloud admin can do this.
 * 
 * Params - 0 - name, 1 - the automation code delineated by "----- KD BOUNDARY -----" with
 * first part being the module, the second part being the form and third part being the SVG
 * icon.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const automations = require(`${KLOUD_CONSTANTS.LIBDIR}/automations.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const BOUNDARY = "----- KD BOUNDARY -----";

/**
 * Adds the given automation
 * @param {array} params The incoming params - see module comments for param format
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}

    const [name, automation] = [...params];

    const parts = automation.split(BOUNDARY); if (parts.length < 3) {
        const err = `Error adding automation ${name}. Malformatted automation.`; params.consoleHandlers.LOGERROR(err);
        return {...CMD_CONSTANTS.FALSE_RESULT(), out: "", err, stdout: "", stderr: err};
    }

    try {JSON.parse(parts[1])} catch (err) {
        const error = `Error adding automation ${name}. Form JSON error ${err}.`; params.consoleHandlers.LOGERROR(error);
        return {...CMD_CONSTANTS.FALSE_RESULT(), out: "", err: error, stdout: "", stderr: error};
    }

    return automations.addAutomation(params.consoleHandlers, name, parts[0], parts[1], parts[2]);
}
