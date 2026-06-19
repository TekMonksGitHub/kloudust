/** 
 * getRouter.js - returns the complete information about a router in
 * its vnets and vnet assigned ips
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const createRouter = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createRouter.js`);
const vnetModule = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);

/**
 * Returns the router information
 * @param {array} params The incoming params
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [router_name_raw] = params;
    if (!router_name_raw) { params.consoleHandlers.LOGERROR("Missing router name!"); return CMD_CONSTANTS.FALSE_RESULT(); }
    
    const router_name = createRouter.resolveRouterName(router_name_raw);
    const router = await dbAbstractor.getRouter(router_name);
    const vnet_ips = await dbAbstractor.getVnetIPsForRouter(router.name);

    const vnet_ips_promise = vnet_ips.map(async vi=>{
        let vnet_name = await dbAbstractor.getVnetName(vi.vnet);
        vnet_name = vnetModule.unresolveVnetName(vnet_name.name);
        return {...vi, vnet : vnet_name}
    })

    router.vnet_ips = await Promise.all(vnet_ips_promise);

    let err = "", out = ""; if (!router) err = `Error loading router ${router_name_raw}`; else out = `Router ${router_name_raw} found`;
    return {result: router?true:false, err, out, stdout: out, stderr: err, router: router};
}