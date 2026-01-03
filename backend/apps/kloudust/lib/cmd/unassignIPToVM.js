/** 
 * unassignIPVM.js - unassigns the given IP from the given VM.
 * 
 * Params - 0 - VM Name, 1 - IP, 2 - VxLAN name to use for routing, should typically not be needed
 * 
 * (C) 2026 Tekmonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const deleteVMVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/deleteVMVnet.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * unassign IP from the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, ip, vnet_name_raw_in] = [...params]; 
    const vm_name = createVM.resolveVMName(vm_name_raw);
    const vnet_name_raw = vnet_name_raw_in || `${KLOUD_CONSTANTS.env.org}-${KLOUD_CONSTANTS.env.prj}-Internet-Backbone`;
    const vnet_name = createVnet.resolveVnetName(vnet_name_raw);
    if (!vnet_name) {params.consoleHandlers.LOGERROR("Unable to locate VxLAN for the VM"); return CMD_CONSTANTS.FALSE_RESULT();}

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    // resolve the two hostinfos - for VM and for IP termination host
    const hostInfoVM = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfoVM) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}
    const hostnameIPVtep = await dbAbstractor.getHostForIP(ip, false);
    if (!hostnameIPVtep) {params.consoleHandlers.LOGERROR("Unable to locate Vtep host for IP "+ip); return CMD_CONSTANTS.FALSE_RESULT();}
    const hostInfoIPVtep = hostnameIPVtep == WILDCARD_IP_VTEP_HOSTNAME ? hostInfoVM : await dbAbstractor.getHostEntry(hostnameIPVtep);       
    if (!hostInfoIPVtep) {params.consoleHandlers.LOGERROR("Unable to locate Vtep hostinfo for IP "+ip); return CMD_CONSTANTS.FALSE_RESULT();}

    // remove the vm from the vnet
    const paramsDeleteVMVnet = [vm_name_raw, vnet_name_raw, true]; paramsDeleteVMVnet.consoleHandlers = params.consoleHandlers;
    if (!(await deleteVMVnet.exec(paramsDeleteVMVnet)).result) { // this expands the IP Vnet to the VM host and also connects the VM to it
        params.consoleHandlers.LOGERROR(`Unable to delete the VM ${vn_name} from VNet ${vnet_name}`); return CMD_CONSTANTS.FALSE_RESULT();
    }

    const vnetRecord = await dbAbstractor.getVnet(vnet_name);

    // now unmap the given IP's route through the VxLAN bridge on the IP host vtep
    const xforgeArgsBridgeRoute = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfoIPVtep.hostaddress, hostInfoIPVtep.rootid, hostInfoIPVtep.rootpw, hostInfoIPVtep.hostkey, hostInfoIPVtep.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/unassignIPToVxLANBridge.sh`,
            vnet_name, vnetRecord.vnetnum, ip.trim()
        ]
    }
    let results = await xforge(xforgeArgsBridgeRoute);
    if (!results.result) {
        params.consoleHandlers.LOGERROR(`Unable to remove the IP route for Vnet ${vnet_name} from IP host ${hostnameIPVtep} onto the Vnet bridge.`); 
        return CMD_CONSTANTS.FALSE_RESULT();
    }
    await dbAbstractor.unallocateIP(ip, vm_name);

    const xforgeArgsVMIPCommand = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfoVM.hostaddress, hostInfoVM.rootid, hostInfoVM.rootpw, hostInfoVM.hostkey, hostInfoVM.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/unassignVMIPViaVxLAN.sh`,
            vm_name, vnet_name, vnetRecord.vnetnum, ip.trim()
        ]
    }

    results = await xforge(xforgeArgsVMIPCommand);
    if (results.result) {
        const vmips = vm.ips.trim() != '' ? vm.ips.split(',') : [], finalVMIPs = vmips.filter(assinged => assinged !== ip);
        if (await dbAbstractor.addOrUpdateVMToDB(vm.name, vm.description, vm.hostname, vm.os, 
            vm.cpus, vm.memory, vm.disks, vm.creationcmd, vm.name_raw, vm.vmtype, finalVMIPs.join(","))) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, ...(CMD_CONSTANTS.FALSE_RESULT())};}
    } else {
        params.consoleHandlers.LOGWARN(`IP ${ip} was removed from the VM ${vm_name_raw}. But internal VM command to configure the network card failed.`)
        return {...results, ...(CMD_CONSTANTS.TRUE_RESULT())};
    }
}