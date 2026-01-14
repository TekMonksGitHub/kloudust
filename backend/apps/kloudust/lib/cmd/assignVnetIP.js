/** 
 * assignVnetIP.js - Assigns the given IP to the given VM.
 * 
 * Params - 0 - VM Name, 1 - IP, 2 - Vnet Name 3 - MTU (not needed, defaults to 1200)
 * 
 * (C) 2026 Tekmonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const DEFAULT_VM_MTU = 1200;

/**
 * Assign Vnet IP to the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, ip_raw, vnet_name_raw_in, vm_mtu_raw] = [...params];
    const vm_mtu = vm_mtu_raw || DEFAULT_VM_MTU;
    const vm_name = createVM.resolveVMName(vm_name_raw);
    const vnet_name_raw = vnet_name_raw_in;
    const vnet_name = createVnet.resolveVnetName(vnet_name_raw);
    const ip = ip_raw.trim();

    if (!vnet_name) {params.consoleHandlers.LOGERROR("Unable to locate Vnet for the VM"); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const vnetRecord = await dbAbstractor.getVnet(vnet_name);
    if (!vnetRecord) {params.consoleHandlers.LOGERROR("Bad VNet name or VNet not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostInfoVM = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfoVM) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    //check if the guest agent is running before making any changes
    const xforgeArgsGuestCheck = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfoVM.hostaddress, hostInfoVM.rootid, hostInfoVM.rootpw, hostInfoVM.hostkey, hostInfoVM.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/guestCheck.sh`,
            vm.name
        ]
    }

    let guestCheck = await xforge(xforgeArgsGuestCheck);

    if (!guestCheck.result) {
        params.consoleHandlers.LOGERROR(`QEMU Guest agent is not running inside the vm ${vm.name}`); 
        return CMD_CONSTANTS.FALSE_RESULT();
    }
    
    const xforgeArgsVMIPCommand = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfoVM.hostaddress, hostInfoVM.rootid, hostInfoVM.rootpw, hostInfoVM.hostkey, hostInfoVM.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/assignVMIPViaVnet.sh`,
            vm_name, vnet_name, vnetRecord.vnetnum, ip, vm_mtu
        ]
    }

    let results = await xforge(xforgeArgsVMIPCommand);
    
    if (results.result) {
        params.consoleHandlers.LOGINFO(`IP ${ip} was allocated to VM ${vm_name_raw} and internal VM command to configure the network card succeeded.`)
        return {...results, ...(CMD_CONSTANTS.TRUE_RESULT())};
    } else {
        params.consoleHandlers.LOGWARN(`IP ${ip} was allocated to VM ${vm_name_raw}. But internal VM command to configure the network card failed. The user will need to manually configure.`)
        return {...results, ...(CMD_CONSTANTS.TRUE_RESULT())};
    }
}