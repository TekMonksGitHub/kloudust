/** 
 * powerOpVM.js - Performs the given power operation on the VM
 * 
 * Params - 0 - VM Name, 1 - Operation - start, stop, reboot, 
 *  forcestop, autostart, noautostart, pause, resume, hardboot
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const POWER_OP_PARAMS_MAP = {
    "start": "start", "stop": "shutdown", "reboot": "reboot", "forcestop": "destroy", 
    "autostart": "autostart", "noautostart": "autostart --disable", "pause": "managedsave",
    "resume": "resume", "hardboot": "reset", "default": "start"
}

/**
 * Performs the given power operation on the VM
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey, VM name, [start|pause|stop|forcestop|reboot|autostart|noautostart] - default is start
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const vm_name_raw = params[0], vm_name = createVM.resolveVMName(vm_name_raw), power_op = (params[1]||"default").toLowerCase();

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}
    
    const gateway = vm.ips.replace(/\d+$/, '1');
    const vlan = await dbAbstractor.getVlanFromGateway(gateway);

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/powerOpVM.sh`,
            vm_name, POWER_OP_PARAMS_MAP[power_op],vlan.vlanid
        ] 
    }

    return await xforge(xforgeArgs);
}