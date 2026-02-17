/** 
 * getVMVnets.js - Returns the Vnets a VM is in
 * 
 * Params - 0 - The VM Name
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const addVMVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/addVMVnet.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);


/**
 * Returns the VM Vnets
 * @param {array} params The incoming params - must have vm_name
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const vm_name_raw = params[0];

    let backbone = createVnet.resolveVnetName(createVnet.getInternetBackboneVnet());
    let vnet_names = await addVMVnet.getVMVnetNames(vm_name_raw);
    vnet_names = vnet_names.filter(vnet_name=>vnet_name!==backbone);
    vnet_names = vnet_names.map(vnet=>createVnet.unresolveVnetName(vnet));

    const out = `VM Vnets follow\n${JSON.stringify(vnet_names)}`; 

    return {result: true, err: "", out, stdout: out, vnets:vnet_names};
}
