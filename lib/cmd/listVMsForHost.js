/** 
 * listVMs.js - Lists the host VMs - either all or running (default)
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

/**
 * Lists the host VMs - either all or running (default)
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey, [all|running] optional param, defaults to running
 */
module.exports.exec = async function(params) {
    const hostInfo = await dbAbstractor.getHostEntry(params[0]); 
    if (!hostInfo) {KLOUD_CONSTANTS.LOGERROR("Bad hostname or host not found"); return false;}
    const vms = await dbAbstractor.listVMs(params[0], true);

    if (vms) {
        KLOUD_CONSTANTS.LOGINFO("VM information from the database follows.");
        for (const vm of vms) KLOUD_CONSTANTS.LOGINFO(JSON.stringify(vm));
    }

    if (hostInfo) {
        KLOUD_CONSTANTS.LOGINFO("VM information from the specific host follows.");
        const xforgeArgs = {
            colors: KLOUD_CONSTANTS.COLORED_OUT, 
            file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
            other: [
                hostInfo.hostname, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey,
                `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/listVMs.sh`
            ]
        }
        return (await xforge(xforgeArgs)==0)?true:false; 
    } else return true;
}