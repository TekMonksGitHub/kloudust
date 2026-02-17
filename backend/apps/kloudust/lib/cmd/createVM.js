/** 
 * createVM.js - Creates VM from URI download or catalog image.
 * 
 * Params - 0 - VM name, 1 - VM description, 2 - cores, 3 - memory in MB, 4 - disk in GB, 5 - Vnet,
 *  6 - image name, 7 - cloud init data in JSON (or YAML format), 8 - force overwrite, if true
 *  in case the HOST has a VM by the same name already, it will be overwrittern, 9 - max cores
 *  is the maximum cores we can hotplug, 10 - max memory is the max memory we can hotplug, 
 *  11 - additional creation params (optional), 12 - vm type, default is vm, or anything else
 *  13 - No QEMU agent - "true" if no needed else "false", 14 - set to true to not install qemu-agent, 
 *  15 - KVM network name (only cloud admins can do this) else Qemu user network, 
 *  16 - hostname for the VM (only cloud admins can do this)
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const vnet = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const deleteVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/deleteVM.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const addVMVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/addVMVnet.js`);
const hostchooser = require(`${KLOUD_CONSTANTS.LIBDIR}/hostchooser.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Creates VM from URI download or catalog image
 * @param {array} params See documented params
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}

    const [vm_name_raw, vm_description, cores_s, memory_s, disk_s, vnet_name, creation_image_name, cloudinit_data, 
        force_overwrite, max_cores_s, max_memory_s, additional_params, vmtype_raw, no_qemu_agent_raw, 
        network_name_raw, hostname] = [...params];
    const vm_name = exports.resolveVMName(vm_name_raw), cores = parseInt(cores_s), memory = parseInt(memory_s), disk = parseInt(disk_s), 
        max_cores = parseInt(max_cores_s||cores_s) > cores ? parseInt(max_cores_s||cores_s) : cores * 10, 
        max_memory = parseInt(max_memory_s||memory_s) > memory ? parseInt(max_memory_s||memory_s) : memory * 10,
        no_qemu_agent = no_qemu_agent_raw?.toLowerCase() == "true" ? "true" : "false", vmtype = vmtype_raw||exports.VM_TYPE_VM,
        kvm_network_name = roleman.isCloudAdminLoggedIn() ? network_name_raw||vnet.KD_DEFAULT_HOST_NETWORK:vnet.KD_DEFAULT_HOST_NETWORK;

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

    const fromCloudImg = imgtype?.toLowerCase().endsWith("iso") ? "false": "true";  // only ISOs are installable disks
    if (!fromCloudImg) params.consoleHandlers.LOGWARN("Not a cloud capable image, VM will probably not work");

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createVM.sh`,
            vm_name, vm_description, cores, memory, disk, creation_image_name, kdResource.uri, ostype, 
            fromCloudImg, cloudinit_data||"undefined", KLOUD_CONSTANTS.env.org(), KLOUD_CONSTANTS.env.prj(),
            force_overwrite||"false", max_cores, max_memory, additional_params, no_qemu_agent, kvm_network_name
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (await dbAbstractor.addOrUpdateVMToDB(vm_name, vm_description, hostInfo.hostname, ostype, cores, memory,
                [{diskname: exports.DEFAULT_DISK, size: parseInt(disk)}], ["createVM ", ...params].join(" "),
                vm_name_raw, vmtype)) {
                
            if (vnet_name && vnet_name.trim().length) {   // add VM to the given Virtual network
                const paramsVnet = [vm_name_raw, vnet_name, "true"]; paramsVnet.consoleHandlers = params.consoleHandlers;
                const vnetResults = await addVMVnet.exec(paramsVnet);
                if (!vnetResults.result) {  // adding to Vnet failed, cleanup and return false
                    await deleteVM.exec(paramsVnet);    // takes same params
                    params.consoleHandlers.LOGERROR("Virtual network addition failed");
                    return vnetResults;
                }
            } 
            return results; // adding to host, database and virtual network all worked
        }
        else {  // adding to DB failed, cleanup and return false
            await deleteVM.deleteVMFromHost(vm_name, hostInfo, params.consoleHandlers);
            params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};
        }
    } else return results;  // creating the VM on the host itself failed
}

/** @return The internal VM name for the given raw VM name or null on error */
exports.resolveVMName = vm_name_raw => vm_name_raw?`${vm_name_raw}_${KLOUD_CONSTANTS.env.org()}_${KLOUD_CONSTANTS.env.prj()}`.toLowerCase().replace(/\s/g,"_"):null;
exports.DEFAULT_DISK = "__org_kloudust_default_disk_name";
exports.VM_TYPE_VM = "vm";