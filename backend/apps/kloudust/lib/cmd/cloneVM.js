/** 
 * cloneVM.js - Clones a VM on the same host
 * 
 * Params
 * 0 - The VM name of the VM to clone
 * 1 - The VM name of the cloned VM
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);

/**
 * Clones a VM on the same host
 * @param {array} params The incoming params - must be - VM name, Cloned VM name
 */
module.exports.exec = async function(params) {
    const vm = await dbAbstractor.getVM(params[0]);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return false;}
    
    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname or host not found"); return false;}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/cloneVM.sh`,
            params[0], params[1]
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (await dbAbstractor.addOrUpdateVMToDB(params[1], vm.description, vm.hostname, vm.os, 
            cores, memory, vm.disks, vm.creationcmd, vm.name_raw, vm.vmtype, vm.ips)) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
}