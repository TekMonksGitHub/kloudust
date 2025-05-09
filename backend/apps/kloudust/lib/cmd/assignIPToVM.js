/** 
 * assignIPToVM.js - Assigns the given IP to the given VM. The IP must be routable
 * to the host (KD doesn't handle that).
 * 
 * Params - 0 - VM Name, 1 - IP
 * 
 * (C) 2024 Tekmonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const { xforge } = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Assign IP to the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function (params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    const [vm_name_raw, ip] = [...params];

    const allVms = await dbAbstractor.listVMsForOrgOrProject('vm');
    const ans = allVms.filter(a => a.publicip == ip)
    if (ans.length) {
        params.consoleHandlers.LOGERROR("ip already assigned"); return CMD_CONSTANTS.FALSE_RESULT("ip already assigned");
    }

    const vm_name = createVM.resolveVMName(vm_name_raw);

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) { params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const gateway = vm.ips.replace(/\d+$/, '1');

    const ipHostname = await dbAbstractor.getAssignedIpHostname(ip);
    if (!ipHostname) { params.consoleHandlers.LOGERROR("Bad ip for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT(); }


    const hostInfo = await dbAbstractor.getHostEntry(ipHostname.host);
    if (!hostInfo) { params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vlanName = await dbAbstractor.getVlanFromGateway(gateway);
    if (!vlanName) { params.consoleHandlers.LOGERROR("Not found the vlan with this gatway"); return CMD_CONSTANTS.FALSE_RESULT(); }

    let vlanGateway;
    const vlanDetail = await dbAbstractor.getVlanFromHostname(vlanName.name, ipHostname.host);
    if (!vlanDetail) {
        const presentVlan = await dbAbstractor.getVlan(vlanName.name);
        const isVlanCreated = await createVnet.createAnotherVlan(vlanName.name, presentVlan.description, presentVlan.vlanid - 1, hostInfo, params);
        if (!isVlanCreated.result) return isVlanCreated;
        const curretVlanDetail = await dbAbstractor.getVlanFromHostname(vlanName.name, ipHostname.host);
        vlanGateway = curretVlanDetail.vlangateway;
    }else{
        vlanGateway = vlanDetail.vlangateway;
    }
    const isVxlanSetup = await module.exports.setupVxlanIfNeeded(params, vm.hostname, ipHostname.host);
    if (!isVxlanSetup) {
        params.consoleHandlers.LOGERROR(`VXLAN setup failed, Check if the host IP is assigned; if not, add an internal IP. If the internal IP is already added, ensure that the IPs are correct,check the ips of ${vmHostname} or ${vlanDetails.hostname}`);
        return CMD_CONSTANTS.FALSE_RESULT("Vm creation failed, Check if the host IP is assigned; if not, add an internal IP. If the internal IP is already added, ensure that the IPs are correct");
    }

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/assignIPToVM.sh`,
            vm.ips, ip,vlanGateway
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (await dbAbstractor.addOrUpdateVMToDB(vm.name, vm.description, vm.hostname, vm.os,
            vm.cpus, vm.memory, vm.disks, vm.creationcmd, vm.name_raw, vm.vmtype, vm.ips, ip)) return results;
        else { params.consoleHandlers.LOGERROR("DB failed"); return { ...results, result: false }; }
    } else return results;
}

module.exports.setupVxlanIfNeeded=async function (params, vmHostname, ipHostname) {
    if (ipHostname == vmHostname) return true;

    const vxlan = await dbAbstractor.getVxlan(vmHostname, ipHostname);
    if (vxlan) return true;

    const primaryHost = await dbAbstractor.getHostEntry(vmHostname);
    const secondaryHost = await dbAbstractor.getHostEntry(ipHostname);
    if (!primaryHost || !secondaryHost) return false;


    const vxlanId = await dbAbstractor.getVxlanId();
    let primaryHostLocalIp = await dbAbstractor.getLocalIp(vmHostname);
    if (!primaryHostLocalIp) primaryHostLocalIp = primaryHost.hostaddress;
    let secondaryHostLocalIp = await dbAbstractor.getLocalIp(ipHostname);
    if (!secondaryHostLocalIp) secondaryHostLocalIp = secondaryHost.hostaddress;
    if (!(await createVM.executeXforge(params, primaryHost, secondaryHost.hostaddress, vxlanId, primaryHostLocalIp))) return false;
    if (!(await createVM.executeXforge(params, secondaryHost, primaryHost.hostaddress, vxlanId, secondaryHostLocalIp))) {
        const deleteResult = await createVM.deleteVxlan(params, primaryHost, vxlanId);
        if (deleteResult) {
            params.consoleHandlers.LOGERROR("vm cannot create in this vlan.")
            return false;
        }
    };

    return await dbAbstractor.addOrUpdateVxlanHostMappingToDB(vxlanId, primaryHost.hostname, secondaryHost.hostname);
}


exports.VM_TYPE_VM = "vm";
