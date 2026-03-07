/** 
 * getVMInfo.js - Queries the given VM information and prints it
 * 
 * Params - 0 - VM Name, 1 - if set to verifyhost, then host is cross verified
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
 * Queries the given VM information and prints it
 * @param {array} params The incoming params - must be VM name
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const vm_name_raw = params[0], vm_name = createVM.resolveVMName(vm_name_raw), verifyhost = params[1];

    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) {params.consoleHandlers.LOGERROR("Bad VM name or VM not found"); return CMD_CONSTANTS.FALSE_RESULT("Bad VM name or VM not found");}
    const vm_ret = {...vm, creationcmd: undefined};

    let out = "VM information from the database follows." + "\n"+JSON.stringify(vm_ret, null, 4);

    if (verifyhost?.trim().toLowerCase() == "verifyhost") {
        const hostInfo = await dbAbstractor.getHostEntry(vm.hostname); 
        if (!hostInfo) {params.consoleHandlers.LOGERROR("Bad hostname or host not found"); return CMD_CONSTANTS.FALSE_RESULT();}

        out += "\n"+"VM information from the specific host follows.";
        const xforgeArgs = {
            colors: KLOUD_CONSTANTS.COLORED_OUT, 
            file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
            console: params.consoleHandlers,
            other: [
                hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
                `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/getVMInfo.sh`,
                vm_name
            ]
        }

        const xforgeResults = await xforge(xforgeArgs); 
        out += "\n"+xforgeResults.stdout; return {...xforgeResults, out, stdout: out, vm: vm_ret};
    } else return {result: true, out, stdout: out, stderr: "", err: "", vm: vm_ret};
}