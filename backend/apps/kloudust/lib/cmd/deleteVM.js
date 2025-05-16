/** 
 * deleteVM.js - Deletes the given VM. Will not delete the snapshots
 * of this VM. This is on purpose so that the VM could potentially be
 * recreated later from the snapshots.
 * 
 * Params - 0 - VM Name
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const unassignIPToVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/unassignIPToVM.js`)
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const firewallVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/firewallvm.js`);

/**
 * Deletes the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const vm_name_raw = params[0], vm_name = createVM.resolveVMName(vm_name_raw);

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const VMFirewalls = await dbAbstractor.getVMFirewalls(vm.id);

    for (const firewall of VMFirewalls) {
        const locparams = ["remove",vm.name_raw,firewall.name];
        locparams.consoleHandlers = params.consoleHandlers;
        await firewallVM.exec(locparams);  
    }
    
    if(vm.publicip){
    const unassignIpParam = [...params];
    unassignIpParam.push(vm.publicip);
    unassignIpParam.consoleHandlers = params.consoleHandlers
    const isIpUnassigned = await unassignIPToVM.exec(unassignIpParam);;
    if(!isIpUnassigned.result){params.consoleHandlers.LOGERROR("IP unassigment Failed"); return CMD_CONSTANTS.FALSE_RESULT();}
    }
    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const results = await exports.deleteVMFromHost(vm_name, hostInfo, params.consoleHandlers);
    
    if (results.result) {
        if (await dbAbstractor.deleteVM(vm_name)) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
}

exports.deleteVMFromHost = async function(vm_name, hostInfo, console) {
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/deleteVM.sh`,
            vm_name
        ]
    }

    const results = await xforge(xforgeArgs);
    return results;
}
