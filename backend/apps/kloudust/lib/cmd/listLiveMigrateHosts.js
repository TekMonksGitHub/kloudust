/**
 * listLiveMigrateHosts.js - Lists compatible destination hosts for live migration.
 *
 * Params
 * 0 - VM name
 *
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const liveMigrateHostHelper = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/liveMigrateHostHelper.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {
        params.consoleHandlers.LOGUNAUTH();
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    const vm_name_raw = params[0];
    if (!vm_name_raw) {
        params.consoleHandlers.LOGERROR("Missing VM name");
        return CMD_CONSTANTS.FALSE_RESULT("Missing VM name");
    }

    const results = await liveMigrateHostHelper.getCompatibleHostsForLiveMigration(vm_name_raw);
    if (!results.result) {
        params.consoleHandlers.LOGERROR(results.error || "Unable to locate compatible live migration hosts");
        return CMD_CONSTANTS.FALSE_RESULT(results.error || "Unable to locate compatible live migration hosts");
    }

    const out = `Compatible live migration hosts follow\n${JSON.stringify(results.hosts)}`;
    params.consoleHandlers.LOGINFO(out);

    return {result: true, err: "",stderr: "", out, stdout: out, resources: results.hosts, hosts: results.hosts, 
        sourceHost: results.sourceHost?.hostname, sourceVendor: results.sourceVendor};
}