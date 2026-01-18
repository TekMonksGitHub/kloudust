/** 
 * liveMigrate.js - Live migrates a VM. Only cloud admins can run
 * this command.
 * 
 * Params - 0 - vm_name, 1 - hostname for the host to move to
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const deleteVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/deleteVM.js`);
const vnet = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);
const addVMVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/addVMVnet.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Live migrates a VM
 * @param {array} params The incoming params, see above
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const vm_name_raw = params[0], vm_name = createVM.resolveVMName(vm_name_raw), hostToName = params[1];

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostToInfo = await dbAbstractor.getHostEntry(hostToName); 
    if (!hostToInfo) {params.consoleHandlers.LOGERROR("Bad hostname for host to."); return CMD_CONSTANTS.FALSE_RESULT();}

    const vm_vnets = await addVMVnet.getVMVnets(vm.name_raw);
    for (const vm_vnet of vm_vnets) {
        const vnet_name = await dbAbstractor.getVnetName(vm_vnet);
        const vnetExpansionResult = await vnet.expandVnetToHost(vnet_name.name, hostToInfo, params.consoleHandlers, true);
    }

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/liveMigrate.sh`,
            vm_name, hostToInfo.hostaddress, hostToInfo.rootid, hostToInfo.rootpw, hostToInfo.hostkey, hostToInfo.port
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
            const xforgeGuestExec = {
            colors: KLOUD_CONSTANTS.COLORED_OUT, 
            file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
            console: params.consoleHandlers,
            other: [
                hostToInfo.hostaddress, hostToInfo.rootid, hostToInfo.rootpw, hostToInfo.hostkey, hostToInfo.port,
                `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/guestNetworkReapply.sh`,
                vm.name,"netplan apply"
            ]
        }

        const execResult = await xforge(xforgeGuestExec);

        if (!await dbAbstractor.updateVMHost(vm.id, hostToName)) {  // fix the DB, if failed give up
            params.consoleHandlers.LOGERROR(`DB failed but VM ${vm_name_raw} was migrated to ${hostToName}, aborting.`); 
            if (!await deleteVM.deleteVMFromHost(vm_name, hostToInfo, params.consoleHandlers)) {   // cleanup new host in case of issues
                params.consoleHandlers.LOGERROR(`Unable to delete the VM ${vm_name_raw} from the new host, cleanup failed.`);
            }
            return {...results, result: false}; 
        } else if (!await deleteVM.deleteVMFromHost(vm_name, hostInfo, params.consoleHandlers)) {  // remove from old host
            params.consoleHandlers.LOGERROR(`Unable to delete the VM ${vm_name_raw} from the original host, leaving intact.`);
            if (!await deleteVM.deleteVMFromHost(vm_name, hostToInfo, params.consoleHandlers)) {   // cleanup new host in case of issues
                params.consoleHandlers.LOGERROR(`Unable to delete the VM ${vm_name_raw} from the new host, cleanup failed.`);
            }
            return {...results, result: false}; 
        } else return results;
    } else return results;
}
