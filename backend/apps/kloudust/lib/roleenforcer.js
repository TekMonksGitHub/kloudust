/**
 * Encodes all the role based enforcement rules.
 * 
 * (C) 2022 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

exports.ACTIONS = Object.freeze({
    edit_cloud_resource: Symbol("edit_cloud_resource"),
    lookup_cloud_resource: Symbol("lookup_cloud_resource"),
    lookup_cloud_resource_for_project: Symbol("lookup_cloud_resource_for_project"),

    edit_project_resource: Symbol("edit_project_resource"),
    lookup_project_resource: Symbol("lookup_project_resource"),

    edit_org: Symbol("edit_org"),
    lookup_org: Symbol("lookup_org"),
    add_user_to_org: Symbol("add_user_to_org")
});

/**
 * Checks if the user should have access.
 * @param {Symbol} access_for The action for which access is needed, should be one of roleenforcer.ACTIONS
 * @param {string} user_role The user's role - can be user, admin or cloud admin, as defined in KLOUD_CONSTANTS
 */
exports.checkAccess = function(access_for, user_role=KLOUD_CONSTANTS.env?.role?.()) {
    const actions = exports.ACTIONS, roles = KLOUD_CONSTANTS.ROLES;

    if (access_for == actions.edit_cloud_resource && user_role == roles.CLOUD_ADMIN) return true;

    if (access_for == actions.lookup_cloud_resource && user_role == roles.CLOUD_ADMIN) return true;

    if (access_for == actions.lookup_cloud_resource_for_project) if (user_role == roles.CLOUD_ADMIN || 
        user_role == roles.ORG_ADMIN) return true;

    if (access_for == actions.edit_project_resource) if (user_role == roles.CLOUD_ADMIN || 
        user_role == roles.ORG_ADMIN || (user_role == roles.USER && 
            dbAbstractor.checkUserBelongsToProject(KLOUD_CONSTANTS.env.prj()))) return true;

    if (access_for == actions.lookup_project_resource) if (user_role == roles.CLOUD_ADMIN || 
        user_role == roles.ORG_ADMIN || user_role == roles.USER) return true;

    if (access_for == actions.edit_org) if (user_role == roles.CLOUD_ADMIN || 
        user_role == roles.ORG_ADMIN) return true;
    if (access_for == actions.lookup_org) if (user_role == roles.CLOUD_ADMIN || 
        user_role == roles.ORG_ADMIN) return true;
    if (access_for == actions.add_user_to_org) if (user_role == roles.CLOUD_ADMIN || 
        user_role == roles.ORG_ADMIN || (user_role == roles.USER && 
            dbAbstractor.checkUserBelongsToProject(KLOUD_CONSTANTS.env.prj()))) return true;

    return false;
}

exports.isSetupMode = async _ => ((await dbAbstractor.getUserCount()) == 0) && KLOUD_CONSTANTS.env._setup_mode;

exports.canBeSetupMode = async _ => (await dbAbstractor.getUserCount() === 0);

exports.isCloudAdminLoggedIn = _ => KLOUD_CONSTANTS.env.role() == KLOUD_CONSTANTS.ROLES.CLOUD_ADMIN;

exports.isOrgAdminLoggedIn = _ => KLOUD_CONSTANTS.env.role() == KLOUD_CONSTANTS.ROLES.ORG_ADMIN;

exports.isNormalUserLoggedIn = _ => KLOUD_CONSTANTS.env.role() == KLOUD_CONSTANTS.ROLES.USER;

exports.getNormalizedOrg = org => exports.isCloudAdminLoggedIn() && org ? org : KLOUD_CONSTANTS.env.org();

exports.getCurrentOrg = _ => KLOUD_CONSTANTS.env.org();

exports.getCurrentuser = _ => KLOUD_CONSTANTS.env.userid();

exports.getNormalizedProject = prj => prj && (exports.isCloudAdminLoggedIn() || exports.isOrgAdminLoggedIn) ?
    prj : KLOUD_CONSTANTS.env.prj();

exports.getNormalizedRole = roleRaw => {
    const role = Object.values(KLOUD_CONSTANTS.ROLES).includes(roleRaw?.toLowerCase()) ? roleRaw.toLowerCase() : 
        KLOUD_CONSTANTS.ROLES.USER;
    return exports.isCloudAdminLoggedIn() ? role : 
        exports.isOrgAdminLoggedIn() && (role != KLOUD_CONSTANTS.ROLES.CLOUD_ADMIN) ? role : KLOUD_CONSTANTS.ROLES.USER;
}
