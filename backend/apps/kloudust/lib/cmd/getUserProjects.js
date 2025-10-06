/**
 * Returns the list of projects the current user belongs to.
 * 
 * Params - none.
 * 
 * (C) 2023 Tekmonks Corp. All rights reserved. 
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Returns projects for the current or given user (given user can only be called by cloudadmin)
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    const userid = KLOUD_CONSTANTS.env.userid;
    if (userid && (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource))) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}

    let projects = await dbAbstractor.getUserProjects(userid); 
    if (!projects) {const err = "Database error in searching for user's projects"; params.consoleHandlers.LOGERROR(err); 
        return CMD_CONSTANTS.FALSE_RESULT(err); }
    if (!projects.length) projects = [{name: "default", org: KLOUD_CONSTANTS.env.org, description: ""}];

    const out = `Project information follows\n${JSON.stringify(projects)}`; 
    params.consoleHandlers.LOGINFO(out);

    return {result: true, err: "", out, stdout: out, projects};
}