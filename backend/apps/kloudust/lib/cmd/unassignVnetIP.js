/** 
 * unassignVnetIP.js - Removes the given IP from the VM's given vnet interface.
 * 
 * Params - 0 - VM Name, 1 - IP, 2 - Vnet Name
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

/**
 * unassigns Vnet IP from the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, ip_raw, vnet_name_raw_in] = [...params];
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

    const xforgeArgsVMIPCommand = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfoVM.hostaddress, hostInfoVM.rootid, hostInfoVM.rootpw, hostInfoVM.hostkey, hostInfoVM.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/unassignVMIPViaVnet.sh`,
            vm_name, vnet_name, vnetRecord.vnetnum, ip
        ]
    }

    let results = await xforge(xforgeArgsVMIPCommand);
    
    if (results.result) {
        let deleteResult = await dbAbstractor.removeVMVnetIP(vm.name, vnetRecord.name, ip);
        if(!deleteResult) { params.consoleHandlers.LOGERRO(`DB deletion failed!`); CMD_CONSTANTS.FALSE_RESULT_RESULT(); }
        params.consoleHandlers.LOGINFO(`IP ${ip} was removed from the VM ${vm_name_raw} and internal VM command to configure the network card succeeded.`)
        return {...results, ...(CMD_CONSTANTS.TRUE_RESULT())};
    } else {
        params.consoleHandlers.LOGWARN(`IP ${ip} was removed from the VM ${vm_name_raw}. But internal VM command to configure the network card failed. The user will need to manually configure.`)
        return {...results, ...(CMD_CONSTANTS.TRUE_RESULT())};
    }
}
