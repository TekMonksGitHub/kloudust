/** Returns the explicitly configured frontend-safe settings. */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();
    }
    const frontendConfig = KLOUD_CONSTANTS.CONF.FRONTEND_CONFIG || {};
    return {result: true, err: "", out: "Frontend configuration loaded", stdout: "Frontend configuration loaded", frontendConfig};
}
