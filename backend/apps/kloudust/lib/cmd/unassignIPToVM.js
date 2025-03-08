/** 
 * unassignIPToVM.js - Unassigns the given IP to the given VM. The IP must be routable
 * to the host (KD doesn't handle that).
 * 
 * Params - 0 - VM Name, 1 - IP
 * 
 * (C) 2024 Tekmonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Unassing IP to the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, ip] = [...params];
    const vm_name = createVM.resolveVMName(vm_name_raw);

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}
    if(!vm.publicip){params.consoleHandlers.LOGERROR("IP is not allocated to this vm"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/unassignIPToVM.sh`,
            vm.ips, ip
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (await dbAbstractor.addOrUpdateVMToDB(vm.name, vm.description, vm.hostname, vm.os, 
            vm.cpus, vm.memory, vm.disks, vm.creationcmd, vm.name_raw, vm.vmtype,vm.ips,'')) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
}
