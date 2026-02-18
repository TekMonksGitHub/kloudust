/** 
 * listVMsForOrgOrProject.js - Lists the VMs for project or org.
 * 
 * Params - 0 - org, 1 - project, 
 * 2 - comma seperated list of VM types, if skipped then regular VMs are returned, and if "*" then
 *  all VM types are returned  
 * 
 * If the project is skipped then all VMs for the ORG
 * are returned if the call is from ORG or Cloud admin.
 * 
 * Else VMs for the currently logged in project only are
 * returned.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const addVMVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/addVMVnet.js`);
const createFirewallRuleset = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createFirewallRuleset.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const getVMVnets = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/getVMVnets.js`);

/**
 * Lists the VMs
 * @param {array} params The incoming params, as documented above
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }

    const [org, project, vmtypes_raw] = [...params];
    const vmtypes = vmtypes_raw ? vmtypes_raw.split(",") : [createVM.VM_TYPE_VM];
    const vms = await dbAbstractor.listVMsForOrgOrProject(vmtypes, org, project);

    const vms_ret = []; if (vms) for (const vm of vms) vms_ret.push({...vm, creationcmd: undefined, vnets : await addVMVnet.getVMVnets(vm.name_raw)});

    for (const vm of vms_ret) {
        const getVMVnetsParams = [vm.name_raw]; getVMVnetsParams.consoleHandlers = params.consoleHandlers;
        const vnet_result = await getVMVnets.exec(getVMVnetsParams);
        vm.vnets = vnet_result.vnets;
        const vm_rulesets = await dbAbstractor.getVMFirewalls(vm.name);
        vm.rulesets = vm_rulesets.map(ruleset=>createFirewallRuleset.unresolveRulesetName(ruleset));
        vm.private_ips = await dbAbstractor.getVMPrivateIPs(vm.name);    
    }

    let out = "VM information from the database follows.";
    for (const vm of vms_ret) out += "\n"+JSON.stringify(vm);

    return {result: true, stdout: out, out, err: "", stderr: "", vms: vms_ret};
}
