/** 
 * addUser.js - Adds the given user to org as an operator. Only org admins can add or remove
 * org users as admin. Normal users can add users as normal users for their org only. Cloud 
 * admins can add any user to any org in any role.
 * 
 * Params - 0 - email, 1 - name, 2 - org, 3 - role 
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Adds the given user to org as an operator. 
 * @param {array} params The incoming params, see above.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.add_user_to_org)) {
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }

    const _accountExists = async email => {
        const lookupResult = await dbAbstractor.getUserForEmail(email);
        if (lookupResult != null) return true; else return false;
    }

    const email = params[0], name = params[1], org = roleman.getNormalizedOrg(params[2]||KLOUD_CONSTANTS.env.org()), 
        role = roleman.getNormalizedRole(params[3]||KLOUD_CONSTANTS.ROLES.USER);
    if (await _accountExists(email)) {params.consoleHandlers.LOGERROR("Account already exists or unauthorized."); 
        return CMD_CONSTANTS.FALSE_RESULT("Account already exists or unauthorized.");}  

    const result = await dbAbstractor.addUserToDB(email, name, org, role);
    return {result, out: "", err: ""};
}
