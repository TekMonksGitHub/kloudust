/** 
 * deleteProject.js - Deletes the given project
 * 
 * Params - 0 - project name, only used if orgadmin or cloud admin is calling,
 *  1 - org - only used if cloud admin is calling
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Deletes the given Project
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_org)) { 
        params.consoleHandlers.LOGERROR("User is unauthorized for this operation."); return CMD_CONSTANTS.FALSE_RESULT(); }
        
    const project = roleman.getNormalizedProject(params[0]||KLOUD_CONSTANTS.env.prj());
    const org = roleman.getNormalizedOrg(params[1]||KLOUD_CONSTANTS.env.org());
    return {result: await dbAbstractor.deleteProject(project, org), err: "", out: ""};
}