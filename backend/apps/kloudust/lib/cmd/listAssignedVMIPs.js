/** 
 * listAssignedVMIPs.js - Lists the VM's assigned IPs
 * 
 * Params - 0 - The VM Name
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);

/**
 * Lists the host catalog
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const vm_name_raw = params[0];
    const vm_name = createVM.resolveVMName(vm_name_raw);
    const vm = await dbAbstractor.getVM(vm_name); 

    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    if (vm.ips.trim().length === 0) { const err = "No assigned IPs found"; params.consoleHandlers.LOGERROR(err); return CMD_CONSTANTS.FALSE_RESULT(err); }

    const out = `Assigned IP follow\n${JSON.stringify(vm.ips)}`; 

    return {result: true, err: "", out, stdout: out, ips: vm.ips};
}