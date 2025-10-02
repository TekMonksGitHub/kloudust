/** 
 * deleteVMVnet.js - Deletes the VM from the given Vnet. The Vnet must exist.
 * 
 * Params - 0 - VM Name, 2 - Vnet name
 * 
 * (C) 2025 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const VNET_VM_RELATION = "vnetvm";

/**
 * Deletes the given VM from the given Virtual Network.
 * @param {array} params The incoming params, see above for param documentation.
 */
exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, vnet_name_raw] = [...params];
    const vm_name = createVM.resolveVMName(vm_name_raw), vnet_name = createVnet.resolveVnetName(vnet_name_raw);

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    let vnetRecord = await dbAbstractor.getVnet(vnet_name);
    if (!vnetRecord) {
        params.consoleHandlers.LOGERROR(`VM ${vm_name} deletion from Vnet ${vnet_name} failed as Vnet record not found. Aborting`); return CMD_CONSTANTS.FALSE_RESULT();
    }

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/detachVMFromVxLANBridge.sh`,
            vm_name, vnet_name, vnetRecord.vnetnum
        ]
    }
    const results = await xforge(xforgeArgs);

    if (results.result) {
        if (!await dbAbstractor.deleteVnetResource(vnet_name, vm_name, VNET_VM_RELATION)) 
            params.consoleHandlers.LOGERROR(`Database error deleting VM ${vm_name} relation for VNet ${vnet_name}.`);
    } else params.consoleHandlers.LOGERROR(`Error removing VM ${vm_name} from VNet ${vnet_name} on the host.`)

    return results;
}

/**
 * Deletes given resource relationship for all Vnets.
 * @param {string} resource The resource name
 * @param {string} relationship The relationship type
 */
exports.deleteResourceRelationshipForAllVNets = (resource, relationship) => dbAbstractor.deleteRelationship(resource, relationship);

/** Vnet to VM relarionship */
exports.VNET_VM_RELATION = VNET_VM_RELATION;