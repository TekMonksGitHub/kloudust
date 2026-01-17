/**
 * removeFirewallRuleset.js – removes a firewall ruleset from a vm's vnet
 *
 * Params:
 *  0 - ruleset name
 *  1 - vm_name
 *  2 - vnet_name
 *
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const { xforge } = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const createFirewallRuleset = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createFirewallRuleset.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);

module.exports.exec = async function (params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }

    const [vm_name_raw, ruleset_name_raw, vnet_name_raw_in] = params;

    const ruleset_name = createFirewallRuleset.resolveRulesetName(ruleset_name_raw);
    const vm_name = createVM.resolveVMName(vm_name_raw);
    const vnet_name_raw = vnet_name_raw_in || createVnet.getInternetBackboneVnet();
    const vnet_name = createVnet.resolveVnetName(vnet_name_raw);

    if (!ruleset_name || !vm_name || !vnet_name_raw) { params.consoleHandlers.LOGERROR("Missing ruleset name or VM name or Vnet name"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) { params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vnet = await dbAbstractor.getVnet(vnet_name);
    if (!vnet) { params.consoleHandlers.LOGERROR("Bad Vnet name or Vnet not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const ruleset = await dbAbstractor.getFirewallRuleset(ruleset_name);
    if (!ruleset) { params.consoleHandlers.LOGERROR("Bad ruleset name or ruleset not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vm_vnet_rulesets = await dbAbstractor.getVMVnetFirewall(vm.name, vnet.name);
    if (!vm_vnet_rulesets.includes(ruleset.id)) { params.consoleHandlers.LOGERROR(`Firewall ${ruleset.name} is not applied to Vnet ${vnet.name} of VM ${vm.name}`);return CMD_CONSTANTS.FALSE_RESULT(); }

    const hostInfoVM = await dbAbstractor.getHostEntry(vm.hostname);
    if (!hostInfoVM) { params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const xforgeArgsRemoveRuleset = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [ hostInfoVM.hostaddress, hostInfoVM.rootid, hostInfoVM.rootpw, hostInfoVM.hostkey, hostInfoVM.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/removeFirewallRuleset.sh`,
            vnet.vnetnum, vm.name, ruleset.name
        ]
    };

    const remove_result = await xforge(xforgeArgsRemoveRuleset);

    if (remove_result.result) {
        const deleteResult = await dbAbstractor.removeVMVnetFirewall(vm.name, vnet.name, ruleset.name);
        if (!deleteResult) { params.consoleHandlers.LOGERROR("DB delete failed!"); return CMD_CONSTANTS.FALSE_RESULT(); }
        params.consoleHandlers.LOGINFO(`Firewall ruleset ${ruleset.name} was removed from Vnet ${vnet.name} of VM ${vm_name_raw}`);
        return { ...remove_result, ...(CMD_CONSTANTS.TRUE_RESULT()) };
    } else {
        params.consoleHandlers.LOGERROR(`Firewall ruleset ${ruleset.name} could not be removed from Vnet ${vnet.name} of VM ${vm_name_raw}`);
        return { ...remove_result, ...(CMD_CONSTANTS.FALSE_RESULT()) };
    }
};
