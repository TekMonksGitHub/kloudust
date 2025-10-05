/** 
 * deleteVnetFromHost.js - Deletes Vnet from the given host.
 * 
 * Params - 1 - Vnet name, 2 - host name
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const vnet = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Deletes an existing Virtual Network. Must be empty first.
 * @param {array} params The incoming params - must be as above
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vnet_name_raw, host] = [...params];
    const vnet_name = createVnet.resolveVnetName(vnet_name_raw);
    const hostInfo = await dbAbstractor.getHostEntry(host); 

    const results = await vnet.deleteVnetFromHost(vnet_name, hostInfo, params.consoleHandlers);
    return results;
}