/** 
 * deleteVnet.js - Deletes Vnet to from org and project.
 * 
 * Params - 1 - Vnet name
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const vnet = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

/**
 * Deletes an existing Virtual Network. Must be empty first.
 * @param {array} params The incoming params - must be as above
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const vnet_name_raw = params[0];
    const vnet_name = createVnet.resolveVnetName(vnet_name_raw)

    const vnet_vms = await dbAbstractor.getVMsForVnet(vnet_name);

    if(vnet_vms && vnet_vms.length > 0){
        const error = `Unable to delete ${vnet_name_raw}. Still in use by virtual machines.`
        params.consoleHandlers.LOGERROR(error);
        return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    return await vnet.deleteVnet(vnet_name, params.consoleHandlers);
}