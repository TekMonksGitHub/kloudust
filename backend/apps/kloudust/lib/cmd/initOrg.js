/** 
 * initOrg.js - Initializes a new org by creating the default project and creating adding the first user(orgadmin) to project
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const addProject = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/addProject.js`);

/**
 * Initializes an organization with it's default project and add the initiating user to the project
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_org)) { params.consoleHandlers.LOGERROR("User is unauthorized for this operation."); return CMD_CONSTANTS.FALSE_RESULT(); }
    
    const org = roleman.getNormalizedOrg(KLOUD_CONSTANTS.env.org), project = KLOUD_CONSTANTS.DEFAULT_PROJECT, default_project_description = `Default project for org ${org}`;

    if (!await addProject.exec([project,default_project_description], params.consoleHandlers)) {
        params.consoleHandlers.LOGERROR(`Could not create project ${project}.`); 
        return CMD_CONSTANTS.FALSE_RESULT(`Could not create project ${project}.`);
    }

    return CMD_CONSTANTS.TRUE_RESULT(`Org ${org} Initiated.`);
}