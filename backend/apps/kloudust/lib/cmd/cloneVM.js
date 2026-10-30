/** 
 * cloneVM.js - Clones a VM on the same host
 * 
 * Params
 * 0 - The VM name of the VM to clone
 * 1 - The VM name of the cloned VM
 * 2 - Optional: Number of clones to make, assumed to be one
 * 3 - Optional: The new hosting project for this VM, only works if org or cloud admins are logged in
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const deleteVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/deleteVM.js`);
const addVMVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/addVMVnet.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Clones a VM on the same host
 * @param {array} params The incoming params - must be - VM name, Cloned VM name
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, cloned_vm_name_raw, number_of_clones_raw, hosting_project] = [...params];
    const number_of_clones = parseInt(number_of_clones_raw) || 1;
    const vm_name = createVM.resolveVMName(vm_name_raw);
    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname);
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const finalResults = [];
    for (let i = 0; i < number_of_clones; i++) {
        const clone_vm_name_raw = i > 0 ? `${cloned_vm_name_raw}${i+1}` : cloned_vm_name_raw;
        const clone_vm_name = createVM.resolveVMName(clone_vm_name_raw, hosting_project);
        const results = await _cloneVMReal(vm, clone_vm_name, hostInfo, hosting_project, clone_vm_name_raw, params); 
        finalResults.push(results);
        if (!results.result) return _getFinalResult(finalResults);    // failed
    }
    return _getFinalResult(finalResults);
}

function _getFinalResult(allResults) {
    const finalResult = {result: true, out: "", err: "", stdout: "", stderr: ""};
    for (const result of allResults) {
        if (finalResult.result) finalResult.result = result.result; // once false we are false
        finalResult.out += result.out + "\n"; finalResult.stdout = finalResult.out;
        finalResult.err += result.err + "\n"; finalResult.stderr = finalResult.err;
    }
    return finalResult;
}

async function _cloneVMReal(vm, clone_vm_name, hostInfo, hosting_project, clone_vm_name_raw, params) {
    const availableHosts = await dbAbstractor.getAvailableHosts(vm.cpus, vm.memory, vm.disk, vm.arch,
        {cpu_factor: KLOUD_CONSTANTS.CONF.VCPU_TO_PHYSICAL_CPU_FACTOR, mem_factor: KLOUD_CONSTANTS.CONF.VMEM_TO_PHYSICAL_MEM_FACTOR});
    let currentHostCanHost = false; for (const availableHost of availableHosts) if (availableHost.hostname == hostInfo.hostname) currentHostCanHost = true;
    if (!currentHostCanHost) {
        const error = "The cloud host is out of capacity for VM cloning. Unable to clone.";
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    const copyNetworks = !hosting_project || hosting_project == KLOUD_CONSTANTS.env.prj();
    if (!copyNetworks) params.consoleHandlers.LOGWARN(`Clone ${clone_vm_name} is in another project, VNets and firewalls of ${vm.name} are not copied to it.`);
    const {vnets, firewalls} = copyNetworks ? await _getVnetsAndFirewalls(vm) : {vnets: [], firewalls: {}};

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/cloneVM.sh`,
            vm.name, clone_vm_name, clone_vm_name_raw, Object.keys(firewalls).join(" ")
        ]
    }

    const results = await xforge(xforgeArgs);
    if (!results.result) return results;

    if (!await dbAbstractor.addOrUpdateVMToDB(clone_vm_name, vm.description, vm.hostname, vm.arch,
            vm.os, vm.cpus, vm.memory, vm.disks, vm.creationcmd, clone_vm_name_raw, vm.vmtype,
            undefined, hosting_project, undefined, CMD_CONSTANTS.VM_POWER_STATES.STOPPED)) {
        params.consoleHandlers.LOGERROR(`DB failed, removing clone ${clone_vm_name} from the host`);
        await deleteVM.deleteVMFromHost(clone_vm_name, hostInfo, params.consoleHandlers);
        return {...results, result: false};
    }

    for (const vnet of vnets) {
        if (!await dbAbstractor.addVnetResource(vnet, clone_vm_name, "vnetvm"))
            params.consoleHandlers.LOGERROR(`DB failed to add clone ${clone_vm_name} to VNet ${vnet}`);
        for (const ruleset of firewalls[vnet]||[]) if (!await dbAbstractor.addVMVnetFirewall(clone_vm_name, vnet, ruleset))
            params.consoleHandlers.LOGERROR(`DB failed to add firewall ${ruleset} on VNet ${vnet} to clone ${clone_vm_name}`);
    }
    return results;
}

async function _getVnetsAndFirewalls(vm) {
    const backbone = createVnet.resolveVnetName(createVnet.getInternetBackboneVnet()), firewalls = {};
    const vnets = await addVMVnet.getVMVnetNames(vm.name_raw);
    for (const vnet of vnets) {
        if (vnet == backbone) continue; // clones get no public IPs and deleteVM only removes backbone firewalls of VMs with public IPs
        const rulesets = await Promise.all((await dbAbstractor.getVMVnetFirewall(vm.name, vnet) || []).map(
            id => dbAbstractor.getFirewallRulesetById(id)));
        const names = rulesets.filter(ruleset => ruleset).map(ruleset => ruleset.name);
        if (names.length) firewalls[vnet] = names;
    }
    return {vnets, firewalls};
}