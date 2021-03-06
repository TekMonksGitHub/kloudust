/** 
 * createVM.js - Creates VM from Internet download or catalog image
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

/**
 * Creates KDS from KDS catalog image
 * @param {array} params The incoming params - must be - Hostname, VM name, VM description, vCPUs, RAM
 */
module.exports.exec = async function(params) {
    const hostInfo = await dbAbstractor.getHostEntry(params[0]); 
    if (!hostInfo) {KLOUD_CONSTANTS.LOGERROR("Bad hostname or host not found"); return false;}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        other: [
            hostInfo.hostname, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createKDS.sh`,
            params[1], params[2], params[3], params[4], KLOUD_CONSTANTS.env.org, 
            KLOUD_CONSTANTS.env.prj
        ]
    }

    if (await xforge(xforgeArgs)==0) {
        if (await dbAbstractor.addVMToDB(params[1], params[2], params[0], "centos8", params[3], params[4], "30")) return true;
        else {KLOUD_CONSTANTS.LOGERROR("DB failed"); return false;}
    } else return false;
}