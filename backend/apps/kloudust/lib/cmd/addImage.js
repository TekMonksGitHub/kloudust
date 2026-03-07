/** 
 * addImage.js - Adds the given image to the host catalog
 * 
 * Params - 
 * 0 - name - The resource identifying name 
 *      should use format osname_major_minor_architecture
 *      eg ubuntu-server_22_04_amd64
 *  1 - URI - usually the download URL, 
 *  2 - processor architecture eg amd64, 
 *  3 - longer description, 
 *  4 - extra information usually this is the image type, 
 *      eg centos8:img where centos8 is KVM OS variant and img
 *      implies it is a cloud image not an ISO
 *  5 - run as a job - if true then runs the operation as async 
 *      job in the backend,
 *  6 - retry automatically on failure if this is set to true
 * 
 * The command will update the database and the hosts local
 * catalog. The hosts' local catalog is not supposed to be 
 * the master. The image URI in the database is the master image
 * location and the hosts are supposed to be able to use it 
 * if the image is not available locally (eg download from it to
 * recache the image locally).
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const jobs = require(`${KLOUD_CONSTANTS.LIBDIR}/jobs.js`);
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const VMIMAGE = "vm";

/**
 * Adds the given image to the catalog
 * @param {array} params The incoming params, see above for params
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }

    const [imgname, imguri, processorarchitecture, description, extrainfo, runasjob, retryjob] = [...params];

    const hostinfos = await dbAbstractor.getHostsMatchingProcessorArchitecture(processorarchitecture.toLowerCase());
    if ((!hostinfos) || (!hostinfos.length)) {
        params.consoleHandlers.LOGWARN(`No hosts found matching processor architecture for image ${imgname}.`);
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    if (!await dbAbstractor.addHostResource(imgname, imguri, processorarchitecture.toLowerCase(), description||"", 
        extrainfo||"", VMIMAGE)) return CMD_CONSTANTS.FALSE_RESULT();

    const returnResult = {result: true, out: "", err: ""}, updateTimestamp = Date.now();
    for (const hostinfo of hostinfos) {        
        const xforgeArgs = {
            colors: KLOUD_CONSTANTS.COLORED_OUT, 
            file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
            console: params.consoleHandlers,
            other: [
                hostinfo.hostaddress, hostinfo.rootid, hostinfo.rootpw, hostinfo.hostkey, hostinfo.port,
                `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/addImage.sh`,
                imguri, imgname.toLowerCase()
            ]
        }

        const runAsJob = runasjob.toLowerCase() == "true", retryOnFailure = retryjob.toLowerCase() == "true";
        const update_function = async _ => {
            const hostUpdateResults = await xforge(xforgeArgs);
            returnResult.out += hostUpdateResults.out; returnResult.err += hostUpdateResults.err; 
            if (!hostUpdateResults.result) {    // on error at least update other hosts, it relieves cloud network pressure later for recovery
                params.consoleHandlers.LOGERROR(`Error updating host ${hostinfo.hostname} with image ${imgname}${retryOnFailure?", retrying":""}`);
                if (!runAsJob) returnResult.result = false;    // jobs run async to the execution call so no sense they update results
                if (retryOnFailure) jobs.add(update_function);  // on failure add the job back so the host does get updated eventually
            } else await dbAbstractor.updateHostSynctime(hostinfo.hostname, updateTimestamp);
        }
     
        if (runAsJob) jobs.add(update_function, undefined, true); else await update_function();
    }

    return returnResult;
}

/** VM Image DB type */
module.exports.VMIMAGE = VMIMAGE;