/** 
 * addVMVnet.js - Adds the VM to the given Vnet. The Vnet must exist or create option 
 *                should be true.
 * 
 * Params - 0 - VM Name, 2 - Vnet name, 3 - if true and Vnet doesn't exist it is created
 * 
 * (C) 2025 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const vnet = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const VNET_VM_RELATION = "vnetvm";

/**
 * Adds the given VM to the given Virtual Network.
 * @param {array} params The incoming params, see above for param documentation.
 */
exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, vnet_name_raw, create_vnet] = [...params];
    const vm_name = createVM.resolveVMName(vm_name_raw), vnet_name = createVnet.resolveVnetName(vnet_name_raw);

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const vnetExpansionResult = await vnet.expandVnetToHost(vnet_name, hostInfo, params.consoleHandlers, create_vnet);
    if (!vnetExpansionResult) {
        params.consoleHandlers.LOGERROR(`Vnet expansion to VM host ${hostInfo.hostname} failed. Aborting`); return CMD_CONSTANTS.FALSE_RESULT();
    }

    // state now - vnet created, if needed, and expanded to the host which is hosting the VM
    const vnetRecord = await dbAbstractor.getVnet(vnet_name);
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/attachVMToVxLANBridge.sh`,
            vm_name, vnet_name, vnetRecord.vnetnum
        ]
    }
    const results = await xforge(xforgeArgs);

    if (results.result) {if (!await dbAbstractor.addVnetResource(vnet_name, vm_name, VNET_VM_RELATION)) params.consoleHandlers.LOGERROR(`Database error adding VM ${vm_name} to VNet ${vnet_name}.`)}
    else if (vnetExpansionResult == "added") // remove host from VxLan if this failed and if this VM was the only reason to add Vnet to the host
        vnet.deleteVnetFromHost(vnet_name, hostInfo, params.consoleHandlers);  // no need to await as this is cleanup

    return results;
}

/**
 * Returns a list of Vnets this VM is part of
 * @param {string} vm_name_raw The raw VM name
 * @returns {array} A list of Vnets this VM is part of
 */
exports.getVMVnets = async function(vm_name_raw) {
    const vm_name = createVM.resolveVMName(vm_name_raw);
    const vm_vnets = await dbAbstractor.getVnetsForResource(vm_name, VNET_VM_RELATION);
    return vm_vnets || [];
}
