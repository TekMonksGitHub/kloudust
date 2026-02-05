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
    
    let rulesets = await dbAbstractor.listFirewallRulesets();

    if(rulesets && rulesets.length > 0) rulesets = rulesets.map(ruleset=>{return {name:createFirewallRuleset.unresolveRulesetName(ruleset.name), description: ruleset.description, created_at : ruleset.timestamp}}); 

    let err = "", out = ""; if (!rulesets) err = "Error loading the list of Vnets"; else out = `${rulesets.length} rulesets found`;
    
    return {result: rulesets?true:false, err, out, stdout: out, stderr: err, rulesets: rulesets};
}