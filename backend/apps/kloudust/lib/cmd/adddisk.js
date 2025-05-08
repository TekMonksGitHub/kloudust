/** 
 * adddisk.js - add a new disk to the given VM.
 * 
 * Params - 0 - VM Name, 
 * 1 - new disk size to add in GB
 * 2 - new disk name , 
 * 
 * (C) 2022 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const { xforge } = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * add a new disk to the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function (params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    const [vm_name_raw, disk_new_gb, disk_name] = [...params];
    const vm_name = createVM.resolveVMName(vm_name_raw);
    if (disk_new_gb && !disk_name) {
        params.consoleHandlers.LOGERROR(
            "Disk name is needed if adding a new disk"); return CMD_CONSTANTS.FALSE_RESULT();
    }

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) { params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname);
    if (!hostInfo) { params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/adddisk.sh`,
            vm_name, parseInt(disk_new_gb) || "", disk_name
        ]
    }

    const results = await xforge(xforgeArgs);

    if (disk_name && disk_new_gb) vm.disks.push({ diskname: disk_name, size: parseInt(disk_new_gb) }); // add new disk with new size

    if (results.result) await dbAbstractor.addOrUpdateVMToDB(vm_name, vm.description, vm.hostname, vm.os,
        vm.cpus, vm.memory, vm.disks, vm.creationcmd, vm.name_raw, vm.vmtype, vm.ips);
    
    return results;
}