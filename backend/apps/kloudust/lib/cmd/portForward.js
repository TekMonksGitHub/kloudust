/** 
 * portForward.js - Forwards the given port.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const hostchooser = require(`${KLOUD_CONSTANTS.LIBDIR}/hostchooser.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const hostInfo = await hostchooser.getHostFor();
    if (!hostInfo) { params.consoleHandlers.LOGERROR("Unable to find a suitable host."); return CMD_CONSTANTS.FALSE_RESULT(); }

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
          hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
          `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/portForward.sh`, params.docker_vm_name, hostInfo.hostaddress, KLOUD_CONSTANTS.S3DOCKERCONF.S3STORAGE_DEFAULT_PORT
        ]
    }

    const results = await xforge(xforgeArgs);
    return results;
}