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

const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Clones a VM on the same host
 * @param {array} params The incoming params - must be - VM name, Cloned VM name
 */
module.exports.exec = async function(params) {
    const [vm_name_raw, cloned_vm_name_raw] = [...params];
    const vm_name = createVM.resolveVMName(vm_name_raw), cloned_vm_name  = createVM.resolveVMName(cloned_vm_name_raw);
    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return false;}
    
    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname or host not found"); return false;}

    const availableHosts = await dbAbstractor.getAvailableHosts(vm.cpus, vm.memory, vm.disk, vm.arch,
        {cpu_factor: KLOUD_CONSTANTS.CONF.VCPU_TO_PHYSICAL_CPU_FACTOR, mem_factor: KLOUD_CONSTANTS.CONF.VMEM_TO_PHYSICAL_MEM_FACTOR});
    let currentHostCanHost = false; for (const availableHost of availableHosts) if (availableHost.hostname == hostInfo.hostname) currentHostCanHost = true;
    if (!currentHostCanHost) {
        const error = "The cloud host is out of capacity for VM cloning. Unable to clone.";
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/cloneVM.sh`,
            vm_name, cloned_vm_name
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (await dbAbstractor.addOrUpdateVMToDB(cloned_vm_name, vm.description, vm.hostname, vm.arch, 
            vm.os, vm.cpus, vm.memory, vm.disks, vm.creationcmd, cloned_vm_name_raw, vm.vmtype)) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
}