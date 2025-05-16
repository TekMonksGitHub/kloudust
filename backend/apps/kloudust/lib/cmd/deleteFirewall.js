/** 
 * createFirewall.js - 
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const firewallVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/firewallvm.js`);

/**
 * Lists the host catalog
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [ruleset_name] = [...params]
    if(!ruleset_name){params.consoleHandlers.LOGERROR("Please provide the ruleset name"); return CMD_CONSTANTS.FALSE_RESULT("Please provide the ruleset name");}
   
    const firewallResources = await dbAbstractor.getFirewallResources(ruleset_name);

    for (const resource of firewallResources) {
        if(resource.resourcetype === "vm"){
            const vm_name = await dbAbstractor.getVMNameFromID(resource.resourceid);
            const locparams = ["remove",vm_name,ruleset_name];
            locparams.consoleHandlers = params.consoleHandlers;
            await firewallVM.exec(locparams);  
        }
    }

    const dbUpdateSuccess = await dbAbstractor.deleteFirewallRules(ruleset_name);
    
    if (dbUpdateSuccess) return { result: true };

    params.consoleHandlers.LOGERROR("DB failed");
    return CMD_CONSTANTS.FALSE_RESULT();
}