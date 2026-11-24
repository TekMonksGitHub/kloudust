/** Returns optional feature settings used by Kloudust components. */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {
        params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();
    }
    const optionalFeatures = KLOUD_CONSTANTS.CONF.OPTIONAL_FEATURES || {};
    return {result: true, err: "", out: "Optional features loaded", stdout: "Optional features loaded", optionalFeatures};
}
