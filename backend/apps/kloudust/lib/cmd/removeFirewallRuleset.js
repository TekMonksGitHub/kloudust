/**
 * removeFirewallRuleset.js – Removes a firewall ruleset to a vm's vnet
 *
 * Params:
 *  0 - vm_name
 *  1 - ruleset_name
 *  2 - vnet_name: Optional - if not provided then Internet backbone Vnet is assumed
 *
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const createFirewallRuleset = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createFirewallRuleset.js`);

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }

    const [vm_name_raw, ruleset_name_raw, vnet_name_raw_in] = params;
    if (!vm_name_raw || !ruleset_name_raw) { params.consoleHandlers.LOGERROR("Missing VM name or ruleset name"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vm_name = createVM.resolveVMName(vm_name_raw);
    const ruleset_name = createFirewallRuleset.resolveRulesetName(ruleset_name_raw);
    const vnet_name_raw = vnet_name_raw_in || createVnet.getInternetBackboneVnet();
    const vnet_name = createVnet.resolveVnetName(vnet_name_raw);
    if (!vm_name || !ruleset_name || !vnet_name) { params.consoleHandlers.LOGERROR("Invalid VM, ruleset or Vnet name"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) { params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vnet = await dbAbstractor.getVnet(vnet_name);
    if (!vnet) { params.consoleHandlers.LOGERROR("Bad Vnet name or Vnet not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const ruleset = await dbAbstractor.getFirewallRuleset(ruleset_name);
    if (!ruleset) { params.consoleHandlers.LOGERROR("Bad ruleset name or ruleset not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vm_vnet_rulesets = await dbAbstractor.getVMVnetFirewall(vm.name, vnet.name);
    if (!vm_vnet_rulesets.includes(ruleset.id)) { params.consoleHandlers.LOGERROR(`Vnet ${vnet.name} of VM ${vm.name} does not have firewall ${ruleset.name} applied to it!`); return CMD_CONSTANTS.FALSE_RESULT(); }

    const host = await dbAbstractor.getHostEntry(vm.hostname);
    if (!host) { params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const xforgeArgsRemoveRuleset = { 
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`, 
        console: params.consoleHandlers,
        other: [
            host.hostaddress, host.rootid, host.rootpw, host.hostkey, host.port, 
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/removeFirewallRuleset.sh`,
            vnet.vnetnum, vm.name, ruleset.name
        ] 
    };
    
    const results = await xforge(xforgeArgsRemoveRuleset);
    if (!results.result) params.consoleHandlers.LOGERROR(`Firewall ruleset ${ruleset.name} could not be removed from ${vnet.name} for VM ${vm_name_raw}`);
    else {
        const deleteResult = await dbAbstractor.removeVMVnetFirewall(vm.name, vnet.name, ruleset.name);
        if (!deleteResult) { params.consoleHandlers.LOGERROR("DB delete failed!"); return {...results, ...CMD_CONSTANTS.FALSE_RESULT()}; }
        else params.consoleHandlers.LOGINFO(`Firewall ruleset ${ruleset.name} was removed from Vnet ${vnet.name} for VM ${vm_name_raw}`);
    }
    
    return results;
}