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

    if(!await dbAbstractor.getFirewallRuleset(ruleset_name)){
        params.consoleHandlers.LOGERROR(`Firewall ruleset ${ruleset_name} does not exists!`);
        return CMD_CONSTANTS.FALSE_RESULT();
    }
    
    if(!await dbAbstractor.deleteFirewallRuleset(ruleset_name)){
        params.consoleHandlers.LOGERROR(`Failed to delete ruleset ${ruleset_name} from db`);
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    params.consoleHandlers.LOGINFO(`Deleted ruleset ${ruleset_name}!`);
    return CMD_CONSTANTS.TRUE_RESULT();
};


