/** 
 * listFirewallRulesForOrgOrProject.js - Lists the Firewall Rules for project or org.
 * 
 * Params - 0 - org, 1 - project, 
 * 
 * If the project is skipped then all Rules for the ORG
 * are returned if the call is from ORG or Cloud admin.
 * 
 * Else Rules for the currently logged in project only are
 * returned.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Lists the Firewall Rules
 * @param {array} params The incoming params, as documented above
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }

    const [org, project] = [...params];

    const rules = await dbAbstractor.listFirewallRulesForOrgOrProject(org, project);
    
    let out = "Firewall rules from the database follows.";
    return {result: true, stdout: out, out, err: "", stderr: "", rules };
}
