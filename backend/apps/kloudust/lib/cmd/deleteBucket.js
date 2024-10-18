/** 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);


module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const bucket_name_raw = params[0];

    const bucket = await dbAbstractor.getBucket(bucket_name_raw);
    if (!bucket) {params.consoleHandlers.LOGERROR("Bad bucket name or bucket not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostInfo = await dbAbstractor.getHostEntry('host1'); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const results = await exports.deleteBucket(bucket_name_raw, hostInfo, params.consoleHandlers);
    
    if (results.result) {
        if (await dbAbstractor.deleteBucket(bucket_name_raw)) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
}

exports.deleteBucket = async function(bucket_name, hostInfo, console) {
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey,  
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/deleteBucket.sh`,bucket_name,KLOUD_CONSTANTS.env.userid,exports.resolveBucketName(bucket_name)
        ]
    }
    const results = await xforge(xforgeArgs);
    return results;
}

exports.resolveBucketName = bucket_name_raw => bucket_name_raw?`${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}_${bucket_name_raw}`.toLowerCase().replace(/\s/g,"_"):null;
