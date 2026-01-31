/** 
 * deleteUser.js - Removes the given user from the org. Org or cloud admins
 * can remove any user, including other org or cloud admins (org admins only
 * for their orgs). Regular users can remove other regular users.
 * 
 * Params - 0 - email, 2 - org name
 * 
 * (C) 2023 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

/**
 * Removes the given user from the org.
 * @param {array} params The incoming params
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {  // at least we should have this access
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}    

    const [email, orgRaw] = [...params];
    const org = orgRaw?roleman.getNormalizedOrg(orgRaw):KLOUD_CONSTANTS.env.org();

    const userToDelete = await dbAbstractor.getUserForEmail(email, org);
    if (!userToDelete) { const err = `User ${email} not found`; params.consoleHandlers.LOGERROR(err); 
        return CMD_CONSTANTS.FALSE_RESULT(err); }
    if (roleman.isNormalUserLoggedIn() && (userToDelete.role != KLOUD_CONSTANTS.ROLES.USER)) {  // can't delete admins by users
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }   

    return {result: await dbAbstractor.removeUserFromDB(email, org), err: "", out: ""};
}
