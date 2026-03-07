/** 
 * restoreSnapshot.js - Restores a VM snapshot, will stop the VM during
 * the restore process. Will leave it stopped, unless param 3 below is 
 * set to "start"
 * 
 * Params - 0 - VM name, 1 - snapshot name, 
 * 2 - start, optional, will restart the VM post restore automatically,
 * 
 * Restoring a snapshot doesn't delete it, so a 
 * snapshot can be restored as many times as needed
 * and needs an explicit delete to be released.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Restores a VM snapshot
 * @param {array} params The incoming params - must be - VM name, Snapshot name
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    const [vm_name_raw, snapshot_name, start, shutdown_timeout_raw] = [...params], 
        vm_name = createVM.resolveVMName(vm_name_raw), shutdown_timeout = shutdown_timeout_raw||KLOUD_CONSTANTS.CONF.DEFAULT_VM_SHUTDOWN_WAIT; 
    const snapshotInfo = vm_name && snapshot_name?await dbAbstractor.getSnapshot(vm_name, snapshot_name):null;
    if (!snapshotInfo) {
        const error = "Snapshot not found."; params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error); }
    
    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {const error = "Bad VM name or VM not found"; params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error); }
    
    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/restoreSnapshot.sh`,
            vm_name, snapshot_name, start?.trim().toLowerCase()=="start"?"restart":"undefined", shutdown_timeout
        ]
    }

    return await xforge(xforgeArgs);
}