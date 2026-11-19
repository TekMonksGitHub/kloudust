/**
 * accessVMConsole.js - Browser console (VNC over websocket) access to a VM.
 * connect returns the host IP, websocket port and a random VNC password for this session,
 * close ends the session.
 *
 * Params - 0 - VM Name, 1 - Operation - connect or close
 *
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const crypt = require(`${KLOUD_CONSTANTS.MONKSHU_BACKEND_LIBDIR}/crypt.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const PASSWORD_LENGTH = 8; // VNC max is 8
const PASSWORD_EXPIRY_SECONDS = 3600;
const OPERATIONS = ["connect", "close"];

/**
 * Connects or closes console access to the VM
 * @param {array} params The incoming params - must be - VM name, connect or close
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}

    const vm_name = createVM.resolveVMName(params[0]), operation = (params[1]||"").toLowerCase();
    if (!OPERATIONS.includes(operation)) {
        const error = `Operation must be one of ${OPERATIONS.join(", ")}`;
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }
    if (operation == "connect" && !KLOUD_CONSTANTS.CONF.VNC_CONSOLE_ENABLED) {
        const error = "Console access is disabled";
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    const password = operation == "connect" ? crypt.encrypt(vm_name, undefined, undefined, true).toString("base64url").slice(0, PASSWORD_LENGTH) : "";
    const results = await _runConsoleScript(vm_name, operation, password, params.consoleHandlers);
    if (!results.result) return CMD_CONSTANTS.FALSE_RESULT(results.err, results.out);
    if (operation == "close") return CMD_CONSTANTS.TRUE_RESULT(results.out, results.err);

    if (!results.port) {
        const error = "Unable to read the console port from the host";
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error, results.out);
    }
    return {...CMD_CONSTANTS.TRUE_RESULT(results.out, results.err), host: results.hostaddress, port: results.port, password};
}

async function _runConsoleScript(vm_name, operation, password, consoleHandlers) {
    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT("Bad VM name or VM not found");}

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname);
    if (!hostInfo) {consoleHandlers.LOGERROR("Bad hostname or host not found"); return CMD_CONSTANTS.FALSE_RESULT("Bad hostname or host not found");}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/accessVMConsole.sh`,
            vm_name, operation, password, CMD_CONSTANTS.SCRIPT_JSONOUT_SPLITTER, PASSWORD_EXPIRY_SECONDS
        ]
    }

    const results = await xforge(xforgeArgs);
    const [out, jsonOut] = (results.stdout||"").split(CMD_CONSTANTS.SCRIPT_JSONOUT_SPLITTER);
    let port; if (jsonOut) try {port = JSON.parse(jsonOut.trim()).port;} catch (err) {consoleHandlers.LOGERROR(`Bad console script output ${jsonOut}`);}
    return {result: results.result, out: out.trim(), err: results.stderr||"", port, hostaddress: hostInfo.hostaddress};
}
