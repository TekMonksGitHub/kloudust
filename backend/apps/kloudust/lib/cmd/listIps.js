/** 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Lists the host catalog
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const vmName = exports.resolveVMName(params[0]);
    const vmDetail = await dbAbstractor.getVM(vmName);
    if(!vmDetail){const err = "No vm found"; params.consoleHandlers.LOGERROR(err); 
        return CMD_CONSTANTS.FALSE_RESULT(err); }

    const gateway = vmDetail.ips.replace(/\d+$/, '1');
    const vmHost = await dbAbstractor.getVlanHostnameFromGateway(gateway);
    if(!vmHost){const err = "No host found"; params.consoleHandlers.LOGERROR(err); 
        return CMD_CONSTANTS.FALSE_RESULT(err); }
    
    const hostips =await dbAbstractor.getHostIps(vmHost.hostname);
    if(!hostips){const err = "No ip found"; params.consoleHandlers.LOGERROR(err); 
        return CMD_CONSTANTS.FALSE_RESULT(err); }
   
    const vmHostDetail = await dbAbstractor.getHostEntry(vmHost.hostname);
    if(!vmHostDetail){const err = "No host details found"; params.consoleHandlers.LOGERROR(err); 
        return CMD_CONSTANTS.FALSE_RESULT(err); }
    const availableIps = hostips.filter(a=>a.externalip != vmHostDetail.hostaddress);
    const out = `Host resource information follows\n${JSON.stringify(availableIps)}`; 

    params.consoleHandlers.LOGINFO(out);
    return {result: true, err: "", out, stdout: out, resources: availableIps};
}

exports.resolveVMName = vm_name_raw => vm_name_raw?`${vm_name_raw}_${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}`.toLowerCase().replace(/\s/g,"_"):null;