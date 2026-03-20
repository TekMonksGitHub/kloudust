/**
 * applyFirewallRuleset.js – Applies a firewall ruleset to a vm's vnet
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
    if ((!vm_name_raw) || (!ruleset_name_raw)) { params.consoleHandlers.LOGERROR("Missing VM name or ruleset name"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vm_name = createVM.resolveVMName(vm_name_raw);
    const ruleset_name = createFirewallRuleset.resolveRulesetName(ruleset_name_raw);
    const vnet_name_raw = vnet_name_raw_in || createVnet.getInternetBackboneVnet();
    const vnet_name = createVnet.resolveVnetName(vnet_name_raw);
    if (!vnet_name) { params.consoleHandlers.LOGERROR("Unable to resolve the Vnet name"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) { params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vnet = await dbAbstractor.getVnet(vnet_name);
    if (!vnet) { params.consoleHandlers.LOGERROR("Bad Vnet name or Vnet not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const ruleset = await dbAbstractor.getFirewallRuleset(ruleset_name);
    if (!ruleset) { params.consoleHandlers.LOGERROR("Bad ruleset name or ruleset not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vm_vnet_rulesets = await dbAbstractor.getVMVnetFirewall(vm.name, vnet.name);
    if (vm_vnet_rulesets.includes(ruleset.id)) {    // already applied, return true
        params.consoleHandlers.LOGWARN(`Vnet ${vnet.name} of VM ${vm.name} already has firewall ${ruleset.name} applied to it!`); 
        return CMD_CONSTANTS.TRUE_RESULT(); 
    }

    const vm_host = await dbAbstractor.getHostEntry(vm.hostname);
    if (!vm_host) { params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const rules_json = JSON.stringify(JSON.stringify(JSON.parse(ruleset.rules_json).reverse()));    // double stringify to make it a valid command line argument

    const xforgeArgs = { 
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`, 
        console: params.consoleHandlers,
        other: [
            vm_host.hostaddress, vm_host.rootid, vm_host.rootpw, vm_host.hostkey, vm_host.port, 
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/applyFirewallRuleset.sh`, 
            rules_json, vnet.vnetnum, vm.name, ruleset.name
        ] 
    };
    
    const results = await xforge(xforgeArgs);

    if (results.result) {
        params.consoleHandlers.LOGINFO(`Firewall ruleset ${ruleset.name} was applied to Vnet ${vnet.name} for VM ${vm_name_raw}`);
        const insertResult = await dbAbstractor.addVMVnetFirewall(vm.name, vnet.name, ruleset.name);
        if (!insertResult) { params.consoleHandlers.LOGERROR("DB insert failed!"); return {...results, ...CMD_CONSTANTS.FALSE_RESULT()}}
    } else params.consoleHandlers.LOGERROR(`Firewall ruleset ${ruleset.name} could not be applied to Vnet ${vnet.name} for VM ${vm_name_raw}`);

    return results;
}