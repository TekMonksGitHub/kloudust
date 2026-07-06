/** 
 * resizeVM.js - Resizes the given VM. Can resize cores, memory, add additional
 * data disks, resize an existing disk (primary or a named one), and detach,
 * delete or re-attach a data disk.
 * 
 * Params - 0 - VM Name, 1 - cores to resize or empty if leaving them as is,
 * 2 - memory to resize in MB or empty if leaving it as is,
 * 3 - disk size to add in GB or to resize to, empty if leaving it as is,
 * 4 - disk name (needed when adding a new disk, resizing a named disk, detaching or re-attaching a named disk),
 * 5 - in place resize, will resize the selected disk but will shut down the VM
 * 6 - restart should be set to true if needed,
 * 7 - remove disk, set to 'true' to detach the named disk from the VM (the disk
 *     file is kept on the host), or to 'delete' to detach it and also physically
 *     delete the disk file from the host
 * 8 - attach disk, set to 'true' to attach the named disk to the VM (the disk file must exist on the host + should be additional disk)
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
    const [vm_name_raw, cores, memory, disk_new_gb, disk_name, inplace_disk_resize, restart, remove_disk, attach_disk] = [...params];
    const vm_name = createVM.resolveVMName(vm_name_raw);

    const isInplaceResize = inplace_disk_resize?.toString().toLowerCase() == 'true';
    const removeDiskMode = remove_disk?.toString().toLowerCase();   // 'true' to detach, 'delete' to detach and delete the file
    const isRemoveDisk = removeDiskMode == 'true' || removeDiskMode == 'delete';
    const isDeleteDisk = removeDiskMode == 'delete';
    const isAttachDisk = attach_disk?.toString().toLowerCase() == 'true';

    // Disk name checks for diff operations
    if (disk_new_gb && (!disk_name) && (!isInplaceResize) && (!isRemoveDisk)) { params.consoleHandlers.LOGERROR(
        "Disk name is needed if adding a new disk"); return CMD_CONSTANTS.FALSE_RESULT(); }
    if (isRemoveDisk && (!disk_name)) { params.consoleHandlers.LOGERROR(
        "Disk name is needed to detach a disk"); return CMD_CONSTANTS.FALSE_RESULT(); }
    if (isAttachDisk && (!disk_name)) { params.consoleHandlers.LOGERROR(
        "Disk name is needed to attach a disk"); return CMD_CONSTANTS.FALSE_RESULT(); }

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
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/resizeVM.sh`,
            vm_name, cores||"", memory||"", parseInt(disk_new_gb)||"", disk_name||"", isAttachDisk?"true":"false",
            isRemoveDisk?removeDiskMode:"false", isInplaceResize?"true":"false", restart?.toLowerCase()||"false"
        ]
    }

    const results = await xforge(xforgeArgs);

    if (results.result) {
        if (isDeleteDisk && disk_name) 
            vm.disks = vm.disks.filter(disk => disk.diskname != disk_name);
        else if (isRemoveDisk && disk_name)  
            vm.disks = vm.disks.map(disk => disk.diskname == disk_name ? {...disk, attached: false} : disk);
        else if (isAttachDisk && disk_name)  
            vm.disks = vm.disks.map(disk => disk.diskname == disk_name ? {...disk, attached: true} : disk);
        else if (disk_new_gb && isInplaceResize) {
            const resizedDiskName = disk_name || createVM.DEFAULT_DISK;
            const resizedDisk = vm.disks.find(disk => disk.diskname == resizedDiskName);
            vm.disks = vm.disks.filter(disk => disk.diskname != resizedDiskName); // pop old disk so we can replace its value
            vm.disks.push({diskname: resizedDiskName, size: parseInt(disk_new_gb)*1073741824, attached: resizedDisk ? resizedDisk.attached !== false : true});
        } else if (disk_new_gb && disk_name) {  // added a brand new data disk, attached by default
            vm.disks = vm.disks.filter(disk => disk.diskname != disk_name); // guard against a duplicate name
            vm.disks.push({diskname: disk_name, size: parseInt(disk_new_gb)*1073741824, attached: true});
        }

        await dbAbstractor.addOrUpdateVMToDB(vm.name, vm.description, vm.hostname, vm.arch,
            vm.os, cores?cores:vm.cpus, memory?memory*1024*1024:vm.memory, vm.disks, vm.creationcmd, vm.name_raw, vm.vmtype, vm.ips);
    }

    return results;
}