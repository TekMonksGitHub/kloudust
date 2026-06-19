/** 
 * listRouters.js - Lists the routers for project or org.
 * 
 * Params - 0 - org, 1 - project  
 * 
 * If the project is skipped then all VMs for the ORG
 * are returned if the call is from ORG or Cloud admin.
 * 
 * Else routers for the currently logged in project only are
 * returned.
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const getRouter = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/getRouter.js`);

/**
 * Lists the Routers
 * @param {array} params The incoming params, as documented above
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    const [org, project] = [...params];

    const routers = await dbAbstractor.listRouters(project, org);
    const routers_promise = routers.map(router => {
        const getRouterParams = [router.name_raw]; getRouterParams.consoleHandlers = params.consoleHandlers;
        return getRouter.exec(getRouterParams);
    })
    const routers_promise_result = await Promise.all(routers_promise);
    const routers_ret = routers_promise_result.map(result=>result.router);

    let out = "Router information from the database follows.";

    return {result: true, stdout: out, out, err: "", stderr: "", routers: routers_ret};
}
