/** 
 * exportVM.js - export an existing VM to the given SFTP server.
 * 
 * Params - 0 - VM Name,
 * 1 - SFTP Username
 * 2 - SFTP Host,
 * 3 - SFTP Password
 * 4 - Remote destination directory [ optional, default is /home/SFTP_USER/ ]
 * 5 - SFTP Port [ optional, default is 22 ]

 * 
 * (C) 2022 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * export the given VM
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    let [vm_name_raw, sftp_user, sftp_host, sftp_pass, destination_dir, sftp_port] = [...params];
    const vm_name = createVM.resolveVMName(vm_name_raw);
    if (!(sftp_host && sftp_pass && sftp_user)) { params.consoleHandlers.LOGERROR(
        "SFTP details are missing for VM export"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT();}

    const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname for the VM or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}
    
    if(!destination_dir) destination_dir = sftp_user.trim() == "root" ? "/root/" : `/home/${sftp_user}/`;
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/exportVM.sh`,
            vm_name, sftp_user, sftp_host, sftp_pass, destination_dir || `/home/${sftp_user}/`, sftp_port || 22,
        ]
    }

    return await xforge(xforgeArgs);
}