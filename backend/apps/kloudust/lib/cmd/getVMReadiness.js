/**
 * getVMReadiness.js - Reports whether a VM is ready for guest-agent-dependent operations.
 *
 * Params - 0 - VM Name, 1 - maximum wait for the guest agent in seconds (optional)
 *
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Returns {result, status}, where status is true only when the guest agent is ready.
 * @param {array} params The incoming params - must include the VM name.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {
        params.consoleHandlers.LOGUNAUTH();
        return {...CMD_CONSTANTS.FALSE_RESULT(), status: false};
    }

    const vm_name_raw = params[0], max_wait_raw = params[1], vm_name = createVM.resolveVMName(vm_name_raw);
    if (!vm_name_raw) {
        const error = "Missing VM name";
        params.consoleHandlers.LOGERROR(error);
        return {...CMD_CONSTANTS.FALSE_RESULT(error), status: false};
    }

    const max_wait = _getMaxWait(max_wait_raw);
    if (!max_wait) {
        const error = "Guest-agent readiness timeout must be a positive whole number of seconds";
        params.consoleHandlers.LOGERROR(error);
        return {...CMD_CONSTANTS.FALSE_RESULT(error), status: false};
    }

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {
        const error = "Bad VM name or VM not found";
        params.consoleHandlers.LOGERROR(error);
        return {...CMD_CONSTANTS.FALSE_RESULT(error), status: false};
    }

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname);
    if (!hostInfo) {
        const error = "Bad hostname or host not found";
        params.consoleHandlers.LOGERROR(error);
        return {...CMD_CONSTANTS.FALSE_RESULT(error), status: false};
    }

    return exports.checkReadiness(vm_name, hostInfo, params.consoleHandlers, max_wait);
}

/** Runs the bounded guest-agent readiness probe for a VM whose host is already resolved. */
exports.checkReadiness = async function(vm_name, hostInfo, consoleHandlers,
        max_wait=KLOUD_CONSTANTS.CONF.MAX_GUEST_AGENT_CHECK_WAIT) {
    const results = await xforge({
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/guestCheck.sh`,
            vm_name, max_wait
        ]
    });

    const output = results.result ? `${results.stdout}\nVM is ready for Guest-agent operations!!` 
        : "VM is still booting and not ready for Guest-agent operations!!";
    return {result: true, status: results.result, out: output, stdout: output};
}

function _getMaxWait(max_wait_raw) {
    if (max_wait_raw === undefined || max_wait_raw === null || max_wait_raw === "")
        return KLOUD_CONSTANTS.CONF.MAX_GUEST_AGENT_CHECK_WAIT;
    const max_wait = Number(max_wait_raw);
    return Number.isSafeInteger(max_wait) && max_wait > 0 ? max_wait : null;
}
