/** 
 * assignIPToVM.js - Assigns the given IP to the given VM. The IP must be 
 * routable to one of the Kloudust hosts by the network backbone.
 * 
 * Params - 0 - VM Name, 1 - IP, 2 - VxLAN name to use for routing, should
 *  typically not be needed, 3 - DNS1 (not needed, defaults to 8.8.8.8), 
 *  4 - DNS2 (not needed, defaults to 8.8.4.4), 5 - MTU (not needed, defaults to 1200)
 * 
 * (C) 2024 Tekmonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const vnet = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const addVMVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/addVMVnet.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const DEFAULT_VM_MTU = 1200, WILDCARD_IP_VTEP_HOSTNAME = "*", DNS1_DEFAULT="8.8.8.8", DNS2_DEFAULT="4.4.4.4";

/**
 * Assign IP to the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, ip_raw, vnet_name_raw_in, dns1_in, dns2_in, vm_mtu_raw] = [...params];   // vm_mtu_raw is undocumented for a reason - should really NOT be used
    const vm_mtu = vm_mtu_raw || DEFAULT_VM_MTU, dns1 = dns1_in || DNS1_DEFAULT, dns2 = dns2_in || DNS2_DEFAULT;
    const vm_name = createVM.resolveVMName(vm_name_raw);
    const vnet_name_raw = vnet_name_raw_in || createVnet.getInternetBackboneVnet();
    const vnet_name = createVnet.resolveVnetName(vnet_name_raw);
    if (!vnet_name) {params.consoleHandlers.LOGERROR("Unable to locate VxLAN for the VM"); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}
    
    let ip_to_assign = await dbAbstractor.getAssignableIPs(vm.hostname);
    if(ip_to_assign.length == 0) ip_to_assign = await dbAbstractor.getAssignableIPs();
    if(ip_to_assign.length == 0) { params.consoleHandlers.LOGERROR("Could not find any assignable IPs"); return CMD_CONSTANTS.FALSE_RESULT(); }

    let ip = ip_to_assign[0].ip;
    // resolve the two hostinfos - for VM and for IP termination host
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
            vm.name, KLOUD_CONSTANTS.CONF.MAX_GUEST_AGENT_CHECK_WAIT
        ]
    }

    let guestCheck = await xforge(xforgeArgsGuestCheck);

    if (!guestCheck.result) {
        params.consoleHandlers.LOGERROR(`QEMU Guest agent is not running inside the vm ${vm.name}`); 
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    const hostnameIPVtep = await dbAbstractor.getHostForIP(ip, true);
    if (!hostnameIPVtep) {params.consoleHandlers.LOGERROR("Unable to locate Vtep host for IP "+ip); return CMD_CONSTANTS.FALSE_RESULT();}
    const hostInfoIPVtep = hostnameIPVtep == WILDCARD_IP_VTEP_HOSTNAME ? hostInfoVM : await dbAbstractor.getHostEntry(hostnameIPVtep);       
    if (!hostInfoIPVtep) {params.consoleHandlers.LOGERROR("Unable to locate Vtep hostinfo for IP "+ip); return CMD_CONSTANTS.FALSE_RESULT();}

    // expand the Vnet to both the hosts - VM host and IP Vtep host
    const paramsAddVMVnet = [vm_name_raw, vnet_name_raw, true]; paramsAddVMVnet.consoleHandlers = params.consoleHandlers;
    if (!(await addVMVnet.exec(paramsAddVMVnet)).result) { // this expands the IP Vnet to the VM host and also connects the VM to it
        params.consoleHandlers.LOGERROR(`Unable to expand the IP Vnet ${vnet_name} to VM host ${hostInfoVM.hostname}`); return CMD_CONSTANTS.FALSE_RESULT();
    }
    if ((hostInfoIPVtep.hostname != hostInfoVM.hostname) &&     // no need to expand if Vtep and VM hosts are the same
            (!(await vnet.expandVnetToHost(vnet_name, hostInfoIPVtep, params.consoleHandlers, true)))) {
        params.consoleHandlers.LOGERROR(`Unable to expand the IP Vnet ${vnet_name} to IP Vtep host ${hostInfoIPVtep.hostname}`); return CMD_CONSTANTS.FALSE_RESULT();
    }
    const vnetRecord = await dbAbstractor.getVnet(vnet_name);

    // now map the given IP's route through the VxLAN bridge on the IP host vtep
    const xforgeArgsBridgeRoute = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfoIPVtep.hostaddress, hostInfoIPVtep.rootid, hostInfoIPVtep.rootpw, hostInfoIPVtep.hostkey, hostInfoIPVtep.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/assignIPToVxLANBridge.sh`,
            vnet_name, vnetRecord.vnetnum, ip.trim()
        ]
    }
    let results = await xforge(xforgeArgsBridgeRoute);
    if (!results.result) {
        params.consoleHandlers.LOGERROR(`Unable to route the IP for Vnet ${vnet_name} on IP host ${hostnameIPVtep} onto the Vnet bridge.`); 
        return CMD_CONSTANTS.FALSE_RESULT();
    }
    await dbAbstractor.allocateIP(ip, vm_name); // at this point it is allocated regardless if the VM config works or not

    // finally try to configure the VM network card and route for this IP
    const xforgeArgsVMIPCommand = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfoVM.hostaddress, hostInfoVM.rootid, hostInfoVM.rootpw, hostInfoVM.hostkey, hostInfoVM.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/assignVMIPViaVxLAN.sh`,
            vm_name, vnet_name, vnetRecord.vnetnum, ip.trim(), dns1, dns2, vm_mtu
        ]
    }

    results = await xforge(xforgeArgsVMIPCommand);
    if (results.result) {
        const vmips = vm.ips.trim() != '' ? vm.ips.split(',') : [], finalVMIPs = [...vmips, ip];
        if (await dbAbstractor.addOrUpdateVMToDB(vm.name, vm.description, vm.hostname, vm.os, 
            vm.cpus, vm.memory, vm.disks, vm.creationcmd, vm.name_raw, vm.vmtype, finalVMIPs.join(','))) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, ...(CMD_CONSTANTS.FALSE_RESULT())};}
    } else {
        params.consoleHandlers.LOGWARN(`IP ${ip} was allocated to VM ${vm_name_raw}. But internal VM command to configure the network card failed. The user will need to manually configure.`)
        return {...results, ...(CMD_CONSTANTS.TRUE_RESULT())};
    }
}