/** 
 * createVnet.js - Creates new virtual network (type VxLAN) for the cloud.
 * 
 * Params - 0 - Vnet name, 1 - Vnet description, 3 - force overwrite, if true
 *  and a Vnet by the same name already exists, it will be overwrittern
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Creates a new virtual network
 * @param {array} params The incoming params - must be as above
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}

    const [vnet_name_raw, vnet_description, force_overwrite] = [...params];
    const vnet_name = exports.resolveVnetName(vnet_name_raw)

    dbAbstractor.addOrUpdateVnet(vnet_name, vnet_description, force_overwrite.toLowerCase() == "true");
    const out = stdout = `Virtual network ${params[0]} created.`;
    return {...CMD_CONSTANTS.TRUE_RESULT(), out, err: "", stdout: out, stderr: ""};
}


/** @return The internal name for the given raw Vnet name or null on error */
exports.resolveVnetName = vnet_name_raw => vnet_name_raw?`${vnet_name_raw}_${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}`.toLowerCase().replace(/\s/g,"_"):null;