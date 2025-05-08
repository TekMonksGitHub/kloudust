/** 
 * resizeVM.js - Resizes the given VM. Can resize cores, memory and
 * add additional data disks on the fly on a live VM.
 * 
 * Params - 0 - VM Name, 1 - cores to resize or empty if leaving them as is, 
 * 2 - memory to resize in MB or empty if leaving it as is, 
 * 3 - disk size to add in GB or to resize to, empty if leaving it as is,
 * 4 - disk name (if adding a new disk this is needed else not), 
 * 5 - in place resize, will resize current main disk but will shut down VM
 * 6 - restart should be set to true if needed
 * 
 * (C) 2022 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Resizes the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, cores, memory, disk_new_gb, disk_name, inplace_disk_resize, restart] = [...params];
    const vm_name = createVM.resolveVMName(vm_name_raw);
    if (disk_new_gb && inplace_disk_resize.toString().toLowerCase() != 'true' && !disk_name) { params.consoleHandlers.LOGERROR(
        "Disk name is needed if adding a new disk"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/resizeVM.sh`,
            vm_name, cores||"", memory||"", parseInt(disk_new_gb)||"", disk_name, "false", "false",
            inplace_disk_resize?.toLowerCase()||"false", restart?.toLowerCase()||"false", 90
        ]
    }

    const results = await xforge(xforgeArgs);

    if (disk_name && disk_new_gb) {
       vm.disks = vm.disks.filter(disk => disk.diskname != disk_name); // pop old disk so we can replace it's value
       vm.disks.push({diskname: disk_name, size: parseInt(disk_new_gb)}); // add new disk with new size
    }
    
    if (results.result) await dbAbstractor.addOrUpdateVMToDB(vm_name, vm.description, vm.hostname, vm.os, 
        cores==""?vm.cpus:cores, memory==""?vm.memory:memory, vm.disks, vm.creationcmd, vm.name_raw, vm.vmtype, vm.ips);

    return results;
}