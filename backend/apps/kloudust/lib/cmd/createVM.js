/** 
 * createVM.js - Creates VM from URI download or catalog image.
 * 
 * Params - 0 - VM name, 1 - VM description, 2 - cores, 3 - memory in MB, 4 - disk in GB, 
 *  5 - image name, 6 - cloud init data in JSON (or YAML format), 7 - force overwrite, if true
 *  in case the HOST has a VM by the same name already, it will be overwrittern, 8 - max cores
 *  is the maximum cores we can hotplug, 9 - max memory is the max memory we can hotplug, 
 *  10 - additional creation params (optional), 11 - vm type, default is vm, or anything else
 *  12 - set to true to not install qemu-agent, 13 - restart shutdown wait, set to -1 for default
 *  14 - hostname for the VM (only cloud admins can do this)
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const hostchooser = require(`${KLOUD_CONSTANTS.LIBDIR}/hostchooser.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const DEFAULT_SHUTDOWN_WAIT = 90;   // after creation initial restart should wait 90 seconds

/**
 * Creates VM from URI download or catalog image
 * @param {array} params See documented params
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}

    const [vm_name_raw, vm_description, cores_s, memory_s, disk_s, creation_image_name, cloudinit_data, 
        force_overwrite, max_cores_s, max_memory_s, additional_params, vmtype_raw, no_qemu_agent_raw, shutdown_wait,
        hostname] = [...params];
    const vm_name = exports.resolveVMName(vm_name_raw), cores = parseInt(cores_s), memory = parseInt(memory_s), disk = parseInt(disk_s), 
        max_cores = parseInt(max_cores_s||cores_s) > cores ? parseInt(max_cores_s||cores_s) : cores, 
        max_memory = parseInt(max_memory_s||memory_s) > memory ? parseInt(max_memory_s||memory_s) : memory,
        no_qemu_agent = no_qemu_agent_raw?.toLowerCase() == "true" ? "true" : "false", vmtype = vmtype_raw||exports.VM_TYPE_VM;

    if (await dbAbstractor.getVM(vm_name)) {  // VM exists
        const error = `VM with the name ${vm_name_raw} exists already for this project`;
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    const kdResource = await dbAbstractor.getHostResourceForProject(creation_image_name);
    if (!kdResource) {
        params.consoleHandlers.LOGERROR("Bad resource name or resource not found"); return CMD_CONSTANTS.FALSE_RESULT();
    }

    const forceHostByAdmin = hostname && hostname.trim().length && roleman.isCloudAdminLoggedIn();
    const hostInfo = forceHostByAdmin ? await dbAbstractor.getHostEntry(hostname) : 
        await hostchooser.getHostFor(cores, memory, disk, kdResource.processorarchitecture); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Unable to find a suitable host."); return CMD_CONSTANTS.FALSE_RESULT();}

    const extrainfoSplits = kdResource.extrainfo?kdResource.extrainfo.split(":"):[null,null];
    let ostype = extrainfoSplits[0], imgtype = extrainfoSplits[1];
    if (!ostype) {
        params.consoleHandlers.LOGWARN("Missing OS type in resource definition, assuming generic Linux");
        ostype = "linux2018";
    }

    const fromCloudImg = imgtype?.toLowerCase().endsWith(".iso") ? "false": "true";  // only ISOs are installable disks
    if (!fromCloudImg) params.consoleHandlers.LOGWARN("Not a cloud capable image, VM will probably not work");

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createVM.sh`,
            vm_name, vm_description, cores, memory, disk, creation_image_name, kdResource.uri, ostype, 
            fromCloudImg, cloudinit_data||"undefined", KLOUD_CONSTANTS.env.org, KLOUD_CONSTANTS.env.prj,
            force_overwrite||"false", max_cores, max_memory, additional_params, no_qemu_agent, 
            shutdown_wait && shutdown_wait!=-1 ? shutdown_wait : DEFAULT_SHUTDOWN_WAIT
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (await dbAbstractor.addOrUpdateVMToDB(vm_name, vm_description, hostInfo.hostname, ostype, cores, memory,
            [{diskname: exports.DEFAULT_DISK, size: parseInt(disk)}], ["createVM ", ...params].join(" "),
            vm_name_raw, vmtype)) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
}

/** @return The internal VM name for the given raw VM name or null on error */
exports.resolveVMName = vm_name_raw => vm_name_raw?`${vm_name_raw}_${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}`.toLowerCase().replace(/\s/g,"_"):null;
exports.DEFAULT_DISK = "__org_kloudust_default_disk_name";
exports.VM_TYPE_VM = "vm";