/** 
 * cloneVM.js - Clones a VM on the same host
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

/**
 * Clones a VM on the same host
 * @param {array} params The incoming params - must be - VM name, Cloned VM name
 */
module.exports.exec = async function(params) {
    const vm = await dbAbstractor.getVM(params[0]);
    if (!vm) {KLOUD_CONSTANTS.LOGERROR("Bad VM name or VM not found"); return false;}
    
    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {KLOUD_CONSTANTS.LOGERROR("Bad hostname or host not found"); return false;}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        other: [
            hostInfo.hostname, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/cloneVM.sh`,
            params[0], params[1]
        ]
    }

    if (await xforge(xforgeArgs)==0) {
        if (await dbAbstractor.addVMToDB(params[1], vm.description, vm.hostname, vm.os, vm.cpus, vm.memory, vm.disk)) return true;
        else {KLOUD_CONSTANTS.LOGERROR("DB failed"); return false;}
    } else return false;
}