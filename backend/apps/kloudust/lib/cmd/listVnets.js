/** 
 * listVnets.js - Lists the vnets for the current org and project.
 * 
 * (C) 2025 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const vnet = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Lists the host catalog
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const vnets = await vnet.listVnets();
    let err = "", out = ""; if (!vnets) err = "Error loading the list of Vnets"; else out = `${vnets.length} Vnets found`;
    return {result: vnets?true:false, err, out, stdout: out, stderr: err, resources: vnets};
}