/** 
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
    
    const listOfVlans = await dbAbstractor.getlistOfVlans(); 
    if (!listOfVlans) {const err = "No vlan found"; params.consoleHandlers.LOGERROR(err); 
        return CMD_CONSTANTS.FALSE_RESULT(err); }

    const out = `Host resource information follows\n${JSON.stringify(listOfVlans)}`; 

    params.consoleHandlers.LOGINFO(out);
    return {result: true, err: "", out, stdout: out, resources: listOfVlans};
}