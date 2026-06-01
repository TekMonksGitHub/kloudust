/** 
 * cloneVM.js - Clones a VM on the same host
 * 
 * Params
 * 0 - The VM name of the VM to clone
 * 1 - The VM name of the cloned VM
 * 2 - Optional: Number of clones to make, assumed to be one
 * 3 - Optional: The new hosting project for this VM, only works if org or cloud admins are logged in
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
    const [vm_name_raw, cloned_vm_name_raw, number_of_clones_raw, hosting_project] = [...params]; 
    const number_of_clones = number_of_clones_raw.trim().length ? parseInt(number_of_clones_raw) : 1;
    const vm_name = createVM.resolveVMName(vm_name_raw);
    const cloned_vm_name  = createVM.resolveVMName(cloned_vm_name_raw, hosting_project);
    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return false;}
    
    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname or host not found"); return false;}

    const finalResults = [];
    for (let i = 1; i < number_of_clones; i++) {
        const results = _cloneVMReal(vm, `${cloned_vm_name}${i>0?i+1:""}`, hostInfo, hosting_project); 
        finalResults.push(results);
        if (!results.result) return _getFinalResult(finalResults);    // failed
    }
    return _getFinalResult(finalResults);
}

function _getFinalResult(allResults) {
    const finalResult = {result: true, out: "", err: "", stdout: "", stderr: ""};
    for (const result of allResults) {
        if (finalResult.result) finalResult.result = result.result; // once false we are false
        finalResult.out += result.out + "\n"; finalResult.stdout = finalResult.out;
        finalResult.err += result.err + "\n"; finalResult.stderr = finalResult.stderr;
    }
    return finalResult;
}

async function _cloneVMReal(vm, cloned_vm_name, hostInfo, hosting_project) {
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
            vm.os, vm.cpus, vm.memory, vm.disks, vm.creationcmd, cloned_vm_name_raw, vm.vmtype, 
            undefined, hosting_project)) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
}