/**
 * Kloudust's VM recovery library - contains the helpers for VM recovery.
 *
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);

/**
 * Saves the VM's current config (XML, cores, memory, disks) to /kloudust/metadata on its host.
 * @param {object} vm The VM from the DB, with its disks already updated
 * @param {object} hostInfo The host the VM is on
 * @param {object} consoleHandlers The console handlers
 * @returns {boolean} true on success, false otherwise
 */
exports.saveVMMetadata = async function(vm, hostInfo, consoleHandlers) {
    const detachedDisks = (vm.disks||[]).filter(disk => disk.attached === false).map(disk => disk.diskname);
    const results = await xforge({
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/saveVMMetadata.sh`, vm.name, detachedDisks.join(" ")
        ]
    });
    if (!results.result) consoleHandlers.LOGWARN(`Unable to save the metadata for VM ${vm.name}.`);
    return results.result;
}
