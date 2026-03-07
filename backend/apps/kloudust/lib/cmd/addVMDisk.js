/** 
 * addVMDisk.js - Attaches an existing disk to the VM.
 * 
 * Params - 0 - VM Name, 2 - disk name, 3 - restart should be set to true if needed
 * 
 * (C) 2022 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Resizes the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, disk_name, restart] = [...params];
    if (disk_name.toLowerCase() == createVM.DEFAULT_DISK) {
        params.consoleHandlers.LOGERROR("Told to re-add VM's default disk. Aborting."); return CMD_CONSTANTS.FALSE_RESULT(); }
    const vm_name = createVM.resolveVMName(vm_name_raw);

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/addVMDisk.sh`,
            vm_name, "", "", "", disk_name, "true", "false", restart?.toLowerCase()||"false"
        ]
    }

    const results = await xforge(xforgeArgs);

    vm.disks.push({diskname: disk_name, size: parseInt(disk)});
    if (results.result) await dbAbstractor.updateVM(vm_name, vm.vm_description, vm.hostname, vm.ostype, 
        cores, memory, vm.disks, vm.creationcmd);

    return results;
}