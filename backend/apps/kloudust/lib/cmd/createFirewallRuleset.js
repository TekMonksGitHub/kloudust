/**
 * createFirewallRuleset.js – creates a firewall ruleset
 *
 * Params:
 *  0 - ruleset name
 *  1 - rules JSON (stringified)
 *
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    const [ruleset_name_raw, rules_json_raw] = params;

    if (!ruleset_name_raw || !rules_json_raw) { params.consoleHandlers.LOGERROR("Missing ruleset name or rules JSON"); return CMD_CONSTANTS.FALSE_RESULT(); }

    let rules_json = JSON.stringify(JSON.parse(rules_json_raw));

    const ruleset_name = exports.resolveRulesetName(ruleset_name_raw);

    if(await dbAbstractor.getFirewallRuleset(ruleset_name)){
        params.consoleHandlers.LOGERROR(`Firewall ruleset ${ruleset_name} already exists!`);
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    if(!await dbAbstractor.addOrUpdateFirewallRuleset(ruleset_name,rules_json)){
        params.consoleHandlers.LOGERROR(`Failed to add ruleset ${ruleset_name} to db!`);
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    params.consoleHandlers.LOGINFO(`Added ruleset ${ruleset_name}!`);
    return CMD_CONSTANTS.TRUE_RESULT();
};


exports.resolveRulesetName = ruleset_name_raw => ruleset_name_raw?`${ruleset_name_raw}_${KLOUD_CONSTANTS.env.org()}_${KLOUD_CONSTANTS.env.prj()}`.toLowerCase().replace(/\s/g,"_"):null;
