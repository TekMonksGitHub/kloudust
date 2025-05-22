/** 
 * createVM.js - Creates VM from URI download or catalog image.
 * 
 * Params - 0 - VM name, 1 - VM description, 2 - cores, 3 - memory in MB, 4 vlan, 5 - disk in GB, 
 *  6 - image name, 7 - cloud init data in JSON (or YAML format), 8 - force overwrite, if true
 *  in case the HOST has a VM by the same name already, it will be overwrittern, 9 - max cores
 *  is the maximum cores we can hotplug, 10 - max memory is the max memory we can hotplug, 
 *  11 - additional creation params (optional), 12 - vm type, default is vm, or anything else
 *  13 - No QEMU agent - "true" if no needed else "false", 14 - set to true to not install qemu-agent, 
 *  15 - hostname for the VM (only cloud admins can do this)
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const hostchooser = require(`${KLOUD_CONSTANTS.LIBDIR}/hostchooser.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);

/**
 * Creates VM from URI download or catalog image
 * @param {array} params See documented params
 */
module.exports.exec = async function (params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {
        params.consoleHandlers.LOGUNAUTH();
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    const [vm_name_raw, vm_description, cores_s, memory_s, disk_s, vlan, creation_image_name, cloudinit_data,
        force_overwrite, max_cores_s, max_memory_s, additional_params, vmtype_raw, no_qemu_agent_raw, hostname
    ] = [...params];
    
    const vm_name = exports.resolveVMName(vm_name_raw);
    const cores = parseInt(cores_s), memory = parseInt(memory_s), disk = parseInt(disk_s);
    const max_cores = Math.max(parseInt(max_cores_s || cores_s), cores);
    const max_memory = Math.max(parseInt(max_memory_s || memory_s), memory);
    const no_qemu_agent = no_qemu_agent_raw?.toLowerCase() === "true" ? "true" : "false";
    const vmtype = vmtype_raw || exports.VM_TYPE_VM;

    if (await dbAbstractor.getVM(vm_name)) {
        return logAndReturnError(params, `VM with the name ${vm_name_raw} exists already for this project`);
    }

    const kdResource = await dbAbstractor.getHostResourceForProject(creation_image_name);
    if (!kdResource) {
        return logAndReturnError(params, "Bad resource name or resource not found");
    }

    const hostInfo = await getHostInfo(hostname, cores, memory, disk, kdResource.processorarchitecture);
    if (!hostInfo) return logAndReturnError(params, "Unable to find a suitable host.");
    
    const vmHostname = hostInfo.hostname;
    if (!(await setupVlan(params, vlan, vmHostname))) return CMD_CONSTANTS.FALSE_RESULT("Failed to set up VLAN");
    
    const vlanDetails = await dbAbstractor.getVlanFromHostname(vlan || 'default',vmHostname);
    if (!vlanDetails) return CMD_CONSTANTS.FALSE_RESULT("Failed to retrieve VLAN data");

    const vm_ip = await exports.getNextVmIp(vlanDetails.vlangateway, await dbAbstractor.getVmIps());
    const isVxlanSetup = await setupVxlanIfNeeded(params,vmHostname, await dbAbstractor.getVlan(vlan || 'default'));
    if (!isVxlanSetup) {
        params.consoleHandlers.LOGERROR(`VXLAN setup failed, Check if the host IP is assigned; if not, add an internal IP. If the internal IP is already added, ensure that the IPs are correct,check the ips of ${vmHostname} or ${vlanDetails.hostname}`);
        return CMD_CONSTANTS.FALSE_RESULT("Vm creation failed, Check if the host IP is assigned; if not, add an internal IP. If the internal IP is already added, ensure that the IPs are correct");
    }

    return createVM(params, kdResource, hostInfo, vlanDetails, vm_name, vm_description, cores, memory, disk,
        creation_image_name, cloudinit_data, force_overwrite, max_cores, max_memory, additional_params, 
        no_qemu_agent,vm_name_raw, vm_ip);
};

async function getHostInfo(hostname, cores, memory, disk, processorArch) {
    return hostname && roleman.isCloudAdminLoggedIn()
        ? await dbAbstractor.getHostEntry(hostname)
        : await hostchooser.getHostFor(cores, memory, disk, processorArch);
}

async function setupVlan(params, vlan, vmHostname) {
    const vlanParams = [vlan || 'default', 'default', vmHostname];
    vlanParams.consoleHandlers = params.consoleHandlers;
    return await createVnet.exec(vlanParams);
}

async function setupVxlanIfNeeded(params,vmHostname, vlanDetails) {
    let vlanHostnames = vlanDetails.hostname;
    if (vlanHostnames==vmHostname) return true;
    
    const vxlan = await dbAbstractor.getVxlan(vmHostname, vlanHostnames);
    if (vxlan) return true;

    const primaryHost = await dbAbstractor.getHostEntry(vmHostname);
    const secondaryHost = await dbAbstractor.getHostEntry(vlanHostnames);
    if (!primaryHost || !secondaryHost) return false;

    
    const vxlanId = await dbAbstractor.getVxlanId();
    let primaryHostLocalIp = await dbAbstractor.getLocalIp(vmHostname);
    if(!primaryHostLocalIp) primaryHostLocalIp = primaryHost.hostaddress;
    let secondaryHostLocalIp = await dbAbstractor.getLocalIp(vlanHostnames);
    if(!secondaryHostLocalIp) secondaryHostLocalIp = secondaryHost.hostaddress;
    if (!(await module.exports.executeXforge(params,primaryHost, secondaryHost.hostaddress, vxlanId,primaryHostLocalIp))) return false;
    if (!(await module.exports.executeXforge(params,secondaryHost, primaryHost.hostaddress, vxlanId,secondaryHostLocalIp))) 
    {
        const deleteResult = await module.exports.deleteVxlan(params,primaryHost,vxlanId);
        if(deleteResult) {
            params.consoleHandlers.LOGERROR("vm cannot create in this vlan.") 
            return false;
        }
    };
    
    return await dbAbstractor.addOrUpdateVxlanHostMappingToDB(vxlanId, primaryHost.hostname, secondaryHost.hostname);
}

module.exports.deleteVxlan= async function(params,targetHost, vxlanId) {
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [targetHost.hostaddress, targetHost.rootid, targetHost.rootpw, targetHost.hostkey, targetHost.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/deleteVxlan.sh`, vxlanId]
    };
    const result = await xforge(xforgeArgs);
    if (result.result) {
        if (!await dbAbstractor.deleteVxlanFromDB(vxlanId)) { params.consoleHandlers.LOGERROR("DB failed"); return { ...primaryExecutionResult, result: false }; }
    }return result.result;
}


module.exports.executeXforge= async function(params,targetHost, otherHost, vxlanId,localIp) {
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [targetHost.hostaddress, targetHost.rootid, targetHost.rootpw, targetHost.hostkey, targetHost.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createVxlan.sh`, otherHost, vxlanId,localIp]
    };
    const result = await xforge(xforgeArgs);
    if (result.result) {
        if (!await dbAbstractor.addOrUpdateVxlanToDB(vxlanId)) { params.consoleHandlers.LOGERROR("DB failed"); return { ...primaryExecutionResult, result: false }; }
    }return result.result;
}

async function createVM(params, kdResource, hostInfo, vlanDetails, vm_name, vm_description, cores, memory, disk,
    creation_image_name, cloudinit_data, force_overwrite, max_cores, max_memory, additional_params, 
    no_qemu_agent,vm_name_raw, vm_ip) {
    
    const extrainfoSplits = kdResource.extrainfo ? kdResource.extrainfo.split(":") : ["linux2018", null];
    const ostype = extrainfoSplits[0], imgtype = extrainfoSplits[1];
    const fromCloudImg = imgtype?.toLowerCase().endsWith(".iso") ? "false" : "true";
    
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createVM.sh`, vm_name, vm_description, cores, memory, disk, 
            creation_image_name, kdResource.uri, ostype, fromCloudImg, cloudinit_data || "undefined", 
            KLOUD_CONSTANTS.env.org, KLOUD_CONSTANTS.env.prj, force_overwrite || "false", max_cores, max_memory, 
            additional_params, no_qemu_agent, vlanDetails.vlanid, vm_ip, vlanDetails.vlangateway]
    };
    
    const results = await xforge(xforgeArgs);
    if (!results.result) return results;
    
    if (!(await dbAbstractor.addOrUpdateVMToDB(vm_name, vm_description, hostInfo.hostname, ostype, cores, memory,
        [{ diskname: exports.DEFAULT_DISK, size: parseInt(disk) }], ["createVM ", ...params].join(" "),
        vm_name_raw, exports.VM_TYPE_VM, vm_ip))) {
        params.consoleHandlers.LOGERROR("DB failed");
        return { ...results, result: false };
    }
    let vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {
        return logAndReturnError(params, `The VM was not added successfully to the DB.`);
    }
    if (!(await dbAbstractor.addVlanResourceMapping(vlanDetails.id, vm.id, "vm"))) {
        params.consoleHandlers.LOGERROR("DB failed");
        return { ...results, result: false };
    }
    return results;
}

function logAndReturnError(params, message) {
    params.consoleHandlers.LOGERROR(message);
    return CMD_CONSTANTS.FALSE_RESULT(message);
}

module.exports.getNextVmIp = async function(selectedVlanGateway, vmIps) {
    const vlanPrefix = selectedVlanGateway.split(".").slice(0, 3).join("."); // Extract "10.1.1"
    const gatewayLastOctet = parseInt(selectedVlanGateway.split(".")[3]); // Extract last octet of selected gateway
    const allGateways = await dbAbstractor.getAllVlanGateways();

    // Extract vlangateway values and filter gateways in the same VLAN
    const listOfGateways = allGateways
        .map(gw => gw.vlangateway) // Extract IPs
        .filter(ip => ip.startsWith(vlanPrefix)) // Filter only matching VLAN
        .map(ip => parseInt(ip.split(".")[3])); // Extract last octets

    let vlanIps = [];

    if (vmIps.length) {
        vlanIps = vmIps
            .filter(ip => ip.startsWith(vlanPrefix))
            .map(ip => parseInt(ip.split(".")[3]))
            .sort((a, b) => a - b);
    }

    let nextIp = vlanIps.length > 0 ? vlanIps[vlanIps.length - 1] + 1 : gatewayLastOctet + 1;

    // Ensure the VM IP does not match any existing VLAN gateways
    while (listOfGateways.includes(nextIp)) {
        nextIp += 1;
    }

    return `${vlanPrefix}.${nextIp}`;
}



/** @return The internal VM name for the given raw VM name or null on error */
exports.resolveVMName = vm_name_raw => vm_name_raw?`${vm_name_raw}_${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}`.toLowerCase().replace(/\s/g,"_"):null;
exports.DEFAULT_DISK = "__org_kloudust_default_disk_name";
exports.VM_TYPE_VM = "vm";
