/** 
 * deleteRouter.js - Deletes the given Router.
  It will also delete the Vnet relationships in the DB for this Router.
 * 
 * Params - 0 - Router Name
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const createRouter = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createRouter.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Deletes the given Router
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const router_name_raw = params[0], router_name = createRouter.resolveRouterName(router_name_raw);

    const router = await dbAbstractor.getRouter(router_name);
    if (!router) {params.consoleHandlers.LOGERROR("Bad Router name or Router not found"); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const hostInfo = await dbAbstractor.getHostEntry(router.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the router or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const results = await exports.deleteRouterFromHost(router_name, hostInfo, params.consoleHandlers);
     if (results.result) {
        if (!await dbAbstractor.removeAllRouterVnetIPRelationships(router.name))
            params.consoleHandlers.LOGERROR("DB failed to delete all Router-Vnets-IP for Router "+router_name);
        if (await dbAbstractor.deleteRouter(router_name)) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
    
}

exports.deleteRouterFromHost = async function(router_name, hostInfo, console) {
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/deleteRouter.sh`, router_name
        ]
    }

    const results = await xforge(xforgeArgs);
    return results;
}
