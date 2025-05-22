/** 
 * cloneVM.js - Clones a VM on the same host
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Clones a VM on the same host
 * @param {array} params The incoming params - must be - VM name, Cloned VM name
 */
module.exports.exec = async function(params) {
    const [vm_raw_name,vmclone_raw_name] = [...params];

    const vm = await dbAbstractor.getVM(createVM.resolveVMName(vm_raw_name));
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return false;}
    
    const vmClone = createVM.resolveVMName(vmclone_raw_name);
    if (!vmClone) {params.consoleHandlers.LOGERROR("Bad Clone VM name "); return false;}

    const isVmClonePreset = await dbAbstractor.getVM(vmClone);
    if (isVmClonePreset) {params.consoleHandlers.LOGERROR("clone vm name already present"); return CMD_CONSTANTS.FALSE_RESULT("clone vm name already present");}

    const vmVlanName = await dbAbstractor.getVlanNameFromVMID(vm.id);
    if (!vmVlanName) {params.consoleHandlers.LOGERROR("vlan not found"); return CMD_CONSTANTS.FALSE_RESULT("vlan not found");}

    let vlanDetail = await dbAbstractor.getVlan(vmVlanName[0].name);
    if(!vlanDetail) {params.consoleHandlers.LOGERROR("VM vlan details not found"); return false;}

    const vm_ip = await createVM.getNextVmIp(vlanDetail.vlangateway, await dbAbstractor.getVmIps());
    if(!vm_ip) {params.consoleHandlers.LOGERROR("Clone VM ip not found"); return false;}

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname or host not found"); return false;}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/cloneVM.sh`,
            vm.name, vmClone,vm_ip
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (!(await dbAbstractor.addOrUpdateVMToDB(vmClone, vm.description, vm.hostname, vm.os, vm.cpus, vm.memory, vm.disks, vm.creationcmd, vmclone_raw_name, vm.vmtype, vm_ip))) 
        return LOGERROR("DB failed during addOrUpdateVMToDB"), { ...results, result: false };
        
        let vmCloned = await dbAbstractor.getVM(vmClone);
        if(!vmCloned) {params.consoleHandlers.LOGERROR("Cloned VM details not found"); return false;}

        if (!(await dbAbstractor.addVlanResourceMapping(vlanDetail.id, vmCloned.id, "vm"))) 
        return LOGERROR("DB failed during addVlanResourceMapping"), { ...results, result: false };
    
        return results;
    } else return results;
}
