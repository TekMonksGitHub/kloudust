/** 
 * powerOpVM.js - Performs the given power operation on the VM
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);

/**
 * Performs the given power operation on the VM
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey, VM name, [start|stop|forcestop|reboot] - default is start
 */
module.exports.exec = async function(params) {
    if (params[0].toLowerCase() != "centos8") {KLOUD_CONSTANTS.LOGERROR("Only centos8 is supported."); return false;}

    const xforgeArgs = {
        colors: true, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        other: [
            params[1], params[2], params[3], params[4], 
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/powerOpVM.sh`,
            params[5], params[6].toLowerCase()=="start"?"start":(params[6].toLowerCase()=="stop"?"shutdown":
                (params[6].toLowerCase()=="reboot"?"reboot":(params[6].toLowerCase()=="forcestop"?"destroy":"start")))
        ]
    }

    return (await xforge(xforgeArgs)==0)?true:false;
}