/** 
 * deleteVM.js - Deletes the given VM. Will not delete the snapshots
 * of this VM. This is on purpose so that the VM could potentially be
 * recreated later from the snapshots. It will also delete the Vnet 
 * relationships in the DB for this VM.
 * 
 * Params - 0 - VM Name
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const deleteVMVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/deleteVMVnet.js`);
const unassignIPToVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/unassignIPToVM.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const getVMVnets = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/getVMVnets.js`);
const vnet = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const removeFirewallRuleset = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/removeFirewallRuleset.js`);
const createFirewallRuleset = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createFirewallRuleset.js`);

/**
 * Deletes the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const vm_name_raw = params[0], vm_name = createVM.resolveVMName(vm_name_raw);

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const getVMVnetsParams = [vm.name_raw]; getVMVnetsParams.consoleHandlers = params.consoleHandlers;
    const vmVnets = await getVMVnets.exec(getVMVnetsParams);

    for (const vmVnet of vmVnets.vnets) {
        const vnetName = await vnet.resolveVnetName(vmVnet);
        const vmVnetFirewall = await dbAbstractor.getVMVnetFirewall(vm.name, vnetName);
        if(vmVnetFirewall.length !== 0){
            for (const vmvnetfw of vmVnetFirewall) {
                const ruleset = await dbAbstractor.getFirewallRulesetById(vmvnetfw);
                const removeFirewallRulesetParams = [vm.name_raw, createFirewallRuleset.unresolveRulesetName(ruleset.name), vmVnet]; removeFirewallRulesetParams.consoleHandlers = params.consoleHandlers;
                const remove_result = await removeFirewallRuleset.exec(removeFirewallRulesetParams);
                if (!remove_result.result) { params.consoleHandlers.LOGERROR(`Firewall ruleset ${ruleset.name} could not be removed from ${vnetName} of VM ${vm_name_raw}`); return {...remove_result, ...CMD_CONSTANTS.FALSE_RESULT()}; }                
            }
        }
    }

    const removeRelationshipsResult = await dbAbstractor.removeAllVMVnetIPRelationships(vm.name);
    if (!removeRelationshipsResult) { params.consoleHandlers.LOGERROR("DB failed to remove all VM-Vnet-IP relationships for the VM"); return CMD_CONSTANTS.FALSE_RESULT(); }

    if(vm.ips.trim() !== ""){
        const vnetName = await vnet.resolveVnetName(createVnet.getInternetBackboneVnet());
        const vmVnetFirewall = await dbAbstractor.getVMVnetFirewall(vm.name, vnetName);
            if(vmVnetFirewall.length !== 0){
            for (const vmvnetfw of vmVnetFirewall) {
                const ruleset = await dbAbstractor.getFirewallRulesetById(vmvnetfw);
                const removeFirewallRulesetParams = [vm.name_raw, createFirewallRuleset.unresolveRulesetName(ruleset.name),""]; removeFirewallRulesetParams.consoleHandlers = params.consoleHandlers;
                const remove_result = await removeFirewallRuleset.exec(removeFirewallRulesetParams);
                if (!remove_result.result) { params.consoleHandlers.LOGERROR(`Firewall ruleset ${ruleset.name} could not be removed from ${vnetName} of VM ${vm_name_raw}`); return {...remove_result, ...CMD_CONSTANTS.FALSE_RESULT()}; }                
            }
        }
    } 

    if (vm.ips.trim() !== "") { const allIps = vm.ips.split(",").map(ip => ip.trim()); for (const ip of allIps) { await unassignIPToVM.exec([vm_name_raw, ip]) }}
    
    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const results = await exports.deleteVMFromHost(vm_name, hostInfo, params.consoleHandlers);
    
    if (results.result) {
        if (!await deleteVMVnet.deleteResourceRelationshipForAllVNets(vm_name, deleteVMVnet.VNET_VM_RELATION))
            params.consoleHandlers.LOGERROR("DB failed to delete all Vnets to VM relationship for VM "+vm_name);
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