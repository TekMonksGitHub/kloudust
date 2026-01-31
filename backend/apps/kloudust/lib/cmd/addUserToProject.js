/** 
 * addUserToProject.js - Adds the given user to the given project. Users
 * for a project or org admins can others to the project.
 * 
 * Params - 0 - email, 1 - project name, only org admins are honored on
 * this param.
 * 
 * (C) 2023 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Adds the given user to the given or current project. Org admins can add a user
 * to any project. Normal users can only add another user to their own project.
 * @param {array} params The incoming params - must be - email, project name (optionally)
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const email = params[0], project = roleman.isOrgAdminLoggedIn()?params[1]:KLOUD_CONSTANTS.env.prj();

    if (!await dbAbstractor.getProject(project, KLOUD_CONSTANTS.env.org())) {
        const error = `Project ${project} does not exist`; params.consoleHandlers.LOGERROR(error);
        return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    if (await dbAbstractor.checkUserBelongsToProject(email, project)) {
        const warn = `User ${email} already belongs to the project ${project}`; params.consoleHandlers.LOGWARN(warn);
        return CMD_CONSTANTS.TRUE_RESULT(undefined, warn);
    } else return {result: await dbAbstractor.addUserToProject(email, project), err: "", out: ""};
}
