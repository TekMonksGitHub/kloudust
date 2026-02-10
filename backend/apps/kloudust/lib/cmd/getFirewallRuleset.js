/** 
 * listFirewallRulesets.js - Lists the firewall rulesets for the current org and project.
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const createFirewallRuleset = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createFirewallRuleset.js`);

/**
 * Lists the host catalog
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [ruleset_name_raw] = params;
    if (!ruleset_name_raw) { params.consoleHandlers.LOGERROR("Missing ruleset name!"); return CMD_CONSTANTS.FALSE_RESULT(); }
    const ruleset_name = createFirewallRuleset.resolveRulesetName(ruleset_name_raw);
    let ruleset = await dbAbstractor.getFirewallRuleset(ruleset_name);
    let err = "", out = ""; if (!ruleset) err = `Error loading ruleset ${ruleset_name_raw}`; else out = `Ruleset ${ruleset_name_raw} found`;
    return {result: ruleset?true:false, err, out, stdout: out, stderr: err, ruleset: JSON.parse(ruleset.rules_json)};
}