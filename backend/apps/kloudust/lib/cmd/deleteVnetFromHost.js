/** 
 * deleteVnet.js - Deletes Vnet from the given host.
 * 
 * Params - 1 - Vnet name, 2 - host name
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

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
    let vnetRecord = await dbAbstractor.getVnet(vnet_name);

    const checkVnet = await dbAbstractor.getVnet(vnet_name);
    if (!checkVnet) {
        const err = `Vnet with ID ${vnet_name_raw} doesn't exist. Ignoring.`; params.consoleHandlers.LOGWARN(err); 
        return {...CMD_CONSTANTS.TRUE_RESULT(), out: "", err, stdout: err, stderr: ''};
    }

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/deleteVLAN.sh`,
            vnet_name, vnetRecord.vnetnum
        ]
    }
    const results = await xforge(xforgeArgs);

    if (!results.result) params.consoleHandlers.LOGERROR(`Vnet ${vnet_name_raw} deletion from host ${host} failed.`);

    return results;
}