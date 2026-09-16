/** 
 * listVMImages.js - Lists the VM images we can instantiate.
 * 
 * Params - 0 - The image type, defaults to VM images.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const addImage = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/addImage.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Lists the host catalog
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const vmImageType = params[0] || addImage.VMIMAGE;

    const hostResources = await dbAbstractor.getHostResources(vmImageType); 
    const orgCatalogs = await dbAbstractor.getOrgCatalogs(roleman.getNormalizedOrg(KLOUD_CONSTANTS.env.org())); 
    if (!hostResources) {const err = "No registered host resources found"; params.consoleHandlers.LOGERROR(err); 
        return CMD_CONSTANTS.FALSE_RESULT(err); }

    const out = `Host resource information follows\n${JSON.stringify(hostResources)}`; 

    params.consoleHandlers.LOGINFO(out);
    return {result: true, stderr: "", err: "", out, stdout: out, resources: hostResources, orgCatalogs};
}