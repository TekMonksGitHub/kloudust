/** 
 * deleteHost.js - Removes the gives host as a Kloudust hypervisor from the catalog
 * 
 * Params - 0 - hostname, 1 - clean host, if set the host machine itself will be cleaned
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

 /**
  * Removes the given host as a Kloudust hypervisor
  * @param {array} params The incoming params - must be - hostname
  */
 module.exports.exec = async params => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [hostname, cleanhost] = [...params];

    const hostInfo = await dbAbstractor.getHostEntry(hostname); 
    const result = {result: await dbAbstractor.deleteHostFromDB(hostname), err: "", out: ""};
    params.consoleHandlers.LOGWARN(`Host ${hostname} has been deleted from Kloudust cloud.`);

    if (cleanhost) {
        params.consoleHandlers.LOGWARN(`Host ${hostname} machine is being cleaned.`);
        if (!hostInfo) {
            params.consoleHandlers.LOGERROR(`Bad hostname ${hostname} or host not found, skipping cleanhost`); 
            return CMD_CONSTANTS.TRUE_RESULT(`Host ${hostname} has been deleted from Kloudust cloud.`, 
                `Bad hostname ${hostname} or host not found, skipping cleanhost`);
        }

        const xforgeArgs = {
            colors: KLOUD_CONSTANTS.COLORED_OUT, 
            console: params.consoleHandlers,
            file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
            other: [
                hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
                `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/deleteHost.sh`
            ]
        }
        await xforge(xforgeArgs);
    }

    return result;  // as long as it is gone from our DB, the result is positive
}