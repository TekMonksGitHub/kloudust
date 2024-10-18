/** 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }

    const [org, project] = [...params];
    const buckets = await dbAbstractor.listBucketsForOrgOrProject(org, project);

    const buckets_ret = []; if (buckets) for (const bucket of buckets) buckets_ret.push({...bucket, creationcmd: undefined});

    let out = "bucket information from the database follows.";
    for (const bucket of buckets_ret) out += "\n"+JSON.stringify(bucket);

    return {result: true, stdout: out, out, err: "", stderr: "", buckets: buckets_ret};
}