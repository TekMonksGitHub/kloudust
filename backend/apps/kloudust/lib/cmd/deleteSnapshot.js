/** 
 * deleteSnapshot.js - Deletes a VM snapshot
 * 
 * Params - 0 - vm name, 1 - snapshot name
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
 * Deletes a VM snapshot
 * @param {array} params The incoming params - must be - VM name, Snapshot name
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [vm_name_raw, snapshot_name] = [...params], vm_name = createVM.resolveVMName(vm_name_raw); 
    const snapshotInfo = vm_name && snapshot_name?await dbAbstractor.getSnapshot(vm_name, snapshot_name):null;
    if (!snapshotInfo) {
        const error = "Snapshot not found."; params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error); }

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {const error = "Bad VM name or VM not found"; params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error); }
    
    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {
        const error = "Bad hostname or host not found"; params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error); }

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/deleteSnapshot.sh`,
            vm_name, snapshot_name
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (await dbAbstractor.deleteSnapshot(vm_name, snapshot_name)) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
}