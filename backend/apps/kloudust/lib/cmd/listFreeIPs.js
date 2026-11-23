/** Lists public IP addresses that are available for assignment. */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();
    }
    const results = await dbAbstractor.getAssignableIPs();
    if (results === false) return CMD_CONSTANTS.FALSE_RESULT("Unable to list free IP addresses");
    const ips = (results || []).map(record => record.ip);
    const out = `${ips.length} free IP address(es) found`;
    return {result: true, err: "", out, stdout: out, ips};
}
