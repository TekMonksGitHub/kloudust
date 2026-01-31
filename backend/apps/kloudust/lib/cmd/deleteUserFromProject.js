/** 
 * deleteUserFromProject.js - Removes the given user from the given
 * or current project.
 * 
 * Params - 0 - email, 1 - project name, 2 - org name
 * 
 * (C) 2023 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

/**
 * Removes the given user from the given or current project. Org admins can remove a user
 * from any org project within their org. Normal users can only remove another user from 
 * their own project. Cloud admins can remove users across projects and orgs.
 * @param {array} params The incoming params - must be - email, project name (optionally)
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}

    const [email, projectRaw, orgRaw] = [...params];
    const project = projectRaw?roleman.getNormalizedProject(projectRaw):KLOUD_CONSTANTS.env.prj(); 
    const org = orgRaw?roleman.getNormalizedOrg(orgRaw):KLOUD_CONSTANTS.env.org();

    return {result: await dbAbstractor.removeUserFromProject(email, project, org), err: "", out: ""};
}
