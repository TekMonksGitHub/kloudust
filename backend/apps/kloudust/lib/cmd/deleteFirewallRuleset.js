/**
 * deleteFirewallRuleset.js – deletes a firewall ruleset
 *
 * Params:
 *  0 - ruleset name
 *
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const createFirewallRuleset = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createFirewallRuleset.js`);

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    
    const [ruleset_name_raw] = params;
    
    if (!ruleset_name_raw) { params.consoleHandlers.LOGERROR("Missing ruleset name"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const ruleset_name = createFirewallRuleset.resolveRulesetName(ruleset_name_raw);

    const ruleset = await dbAbstractor.getFirewallRuleset(ruleset_name);

    if(!ruleset){
        const error = `Firewall ruleset ${ruleset_name_raw} does not exists!`
        params.consoleHandlers.LOGERROR(error);
        return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    const firewallVM = await dbAbstractor.getVMsForRuleset(ruleset.name);

    if(firewallVM && firewallVM.length > 0){
        const error = `Firewall ruleset ${ruleset_name_raw} is still in use by some VMs, please remove the ruleset from VMs before deleting!`
        params.consoleHandlers.LOGERROR(error);
        return CMD_CONSTANTS.FALSE_RESULT(error);
    }
    
    if(!await dbAbstractor.deleteFirewallRuleset(ruleset_name)){
        const error = `Failed to delete ruleset ${ruleset_name_raw} from db!`
        params.consoleHandlers.LOGERROR(error);
        return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    params.consoleHandlers.LOGINFO(`Deleted ruleset ${ruleset_name_raw}!`);
    return CMD_CONSTANTS.TRUE_RESULT(`Deleted ruleset ${ruleset_name_raw}!`);
};


