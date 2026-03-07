/** 
 * deleteImage.js - Deletes the given image from the host catalog
 * 
 * Params - 0 - name - The resource identifying name 
 *      should use format osname_major_minor_architecture
 *      eg ubuntu-server_22_04_amd64
 * 
 * The command will update the database and the hosts local
 * catalog. The hosts' local catalog is not supposed to be 
 * the master.
 * 
 * (C) 2023 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Adds the given image to the catalog
 * @param {array} params The incoming params, see above for params
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }

    const imgname = params[0], resource = await dbAbstractor.getHostResource(imgname);

    if (!resource) {
        const warning = `No image named ${imgname} was found, treating the deletion as success.`;
        params.consoleHandlers.LOGWARN(warning);
        return {...CMD_CONSTANTS.TRUE_RESULT(), out: warning};
    } else if (!await dbAbstractor.deleteHostResource(imgname)) {
        const error = `Database error in deleting the image ${imgname}.`;
        params.consoleHandlers.LOGERROR(error);
        return {...CMD_CONSTANTS.FALSE_RESULT(), err: error}
    }

    const hostinfos = await dbAbstractor.getHostsMatchingProcessorArchitecture(resource.processorarchitecture);
    if ((!hostinfos) || (!hostinfos.length)) {
        params.consoleHandlers.LOGWARN(`No hosts found matching processor architecture for image ${imgname}.`);
        return CMD_CONSTANTS.TRUE_RESULT();
    }

    const returnResult = {result: true, out: "", err: ""}, updateTimestamp = Date.now();
    for (const hostinfo of hostinfos) {        
        const xforgeArgs = {
            colors: KLOUD_CONSTANTS.COLORED_OUT, 
            file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
            console: params.consoleHandlers,
            other: [
                hostinfo.hostaddress, hostinfo.rootid, hostinfo.rootpw, hostinfo.hostkey, hostinfo.port,
                `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/deleteImage.sh`, imgname.toLowerCase() 
            ]
        }

        const hostUpdateResults = await xforge(xforgeArgs);
        returnResult.out += hostUpdateResults.out; returnResult.err += hostUpdateResults.err; 
        if (!hostUpdateResults.result) {    // on error at least update other hosts, it relieves cloud network pressure later for recovery
            params.consoleHandlers.LOGERROR(`Error deleting image from host ${hostinfo.hostname} for image ${imgname}`);
            returnResult.result = false;    // jobs run async to the execution call so no sense they update results
        } else await dbAbstractor.updateHostSynctime(hostinfo.hostname, updateTimestamp);
    }

    return returnResult;
}