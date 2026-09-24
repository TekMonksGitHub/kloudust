/** 
 * deleteProject.js - Deletes the given project
 * 
 * Params - 0 - project id, only used if orgadmin or cloud admin is calling
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
    const project_id = params[0];
    const project = project_id ? project_id.split("_")[0] : KLOUD_CONSTANTS.env.prj();
    const org = project_id ? project_id.split("_")[1] : KLOUD_CONSTANTS.env.org(); 

    if(project === KLOUD_CONSTANTS.DEFAULT_PROJECT) { params.consoleHandlers.LOGWARN("Cannot delete project default."); return CMD_CONSTANTS.FALSE_RESULT("Cannot delete project default."); }
    return {result: await dbAbstractor.deleteProject(project, org), err: "", out: ""};
}