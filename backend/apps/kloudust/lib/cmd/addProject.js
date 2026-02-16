/** 
 * addProject.js - Adds the given project to the current org
 * 
 * Params - 0 - Project description, the project name is picked from -j param
 * to the Kloudust command line itself, 1 - org - only used if cloud admin is calling
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const addUserToProject = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/addUserToProject.js`);
const deleteProject = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/deleteProject.js`);

/**
 * Adds the given project to the current org
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_org)) { 
        params.consoleHandlers.LOGERROR("User is unauthorized for this operation."); return CMD_CONSTANTS.FALSE_RESULT(); }

    const [name, description] = [...params];
    const org = roleman.getNormalizedOrg(KLOUD_CONSTANTS.env.org), creator = KLOUD_CONSTANTS.env.userid();

    if (await dbAbstractor.getProject(name)) {   // check
        params.consoleHandlers.LOGERROR(`Project ${name} already exists.`); 
        return CMD_CONSTANTS.TRUE_RESULT(`Project ${name} already exists.`);
    }

    if(!await dbAbstractor.addProject(name, description||"")) {
        params.consoleHandlers.LOGERROR(`Failed to add project ${name} for org ${org}.`); 
        return CMD_CONSTANTS.FALSE_RESULT(`Failed to add project ${name} for org ${org}.`);
    }  

    const addUserToProjectParams = [creator, name]; addUserToProjectParams.consoleHandlers = params.consoleHandlers;
    const addUserToProjectResult = await addUserToProject.exec(addUserToProjectParams);

    if(!addUserToProjectResult.result) {
        params.consoleHandlers.LOGERROR(`Failed to add user ${creator} to project ${name} for org ${org}.`); 
        const deleteProjectParams = [name,org]; deleteProjectParams.consoleHandlers = params.consoleHandlers;
        await deleteProject.exec(deleteProjectParams)
        return CMD_CONSTANTS.FALSE_RESULT(`Failed to add user ${creator} to project ${name} for org ${org}. Could not create project`);
    }

    return {result : true, out: `Added project ${name}`, err: ""};
}