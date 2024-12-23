/** 
 * createDockerVM.js - Creates Docker VM.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const { xforge } = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const hostchooser = require(`${KLOUD_CONSTANTS.LIBDIR}/hostchooser.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const mustache = require('mustache');
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);

module.exports.exec = async function (dockerFile, port, params, dockerImageName, dockerBuild) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }

    const hostInfo = await hostchooser.getHostFor();
    if (!hostInfo) { params.consoleHandlers.LOGERROR("Unable to find a suitable host."); return CMD_CONSTANTS.FALSE_RESULT(); }

    const result = await _writeDockerFile(params, dockerFile, hostInfo, dockerImageName);
    if (!result.result) {
        const error = `Error writing docker file.`;
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    const [bucket_name, bucket_description, bucket_size, password, cloudinit, vmtype] = [...params];

    let { VM_NAME, VM_DESC, VM_CORE, VM_MEMORY, VM_DISK, VM_IMG, VM_RUNCMD } = KLOUD_CONSTANTS.S3DOCKERCONF.DOCKER_VM_PARAM;
    let dockerVMrunCmd = mustache.render(VM_RUNCMD, {
        dockerImageName: dockerImageName,
        hostPort: port,
        containerPort: port,
        dockerBuildName: dockerBuild
    })
    let cloudinitvm = cloudinit.replace(/hostname:\s*,|runcmd:\s*null/g, match => {
        if (match.startsWith("hostname")) return `hostname: ${VM_NAME},`;
        if (match.startsWith("runcmd")) return `runcmd: ${dockerVMrunCmd}`;
    });
    const createVM_params = [VM_NAME, VM_DESC, VM_CORE, VM_MEMORY, VM_DISK, VM_IMG, cloudinitvm, "false", "", "", "", vmtype, "false", "", params.consoleHandlers]
    const dockerVM = await createVM.exec(createVM_params);
    if (!dockerVM.result) {
        const error = `Error creating docker vm.`;
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    const portReachable_params = {};
    portReachable_params.consoleHandlers = params.consoleHandlers;
    portReachable_params.vm_name = VM_NAME;

    let isPortReachable = await _portReachable(portReachable_params, hostInfo);
    if (!isPortReachable.result) {
        const error = `Docker vm is not reachable`;
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }
    return isPortReachable;
}
const _writeDockerFile = async (params, dockerFile, hostInfo, dockerImageName) => {
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/writeDockerFile.sh`, dockerFile, dockerImageName
        ]
    }
    const results = await xforge(xforgeArgs);
    return results;
}
const _portReachable = async (params, hostInfo) => {
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/portReachable.sh`, params.vm_name, KLOUD_CONSTANTS.S3DOCKERCONF.PYTHON_HTTP_SERVER_PORT, KLOUD_CONSTANTS.S3DOCKERCONF.S3STORAGE_DEFAULT_PORT
        ]
    }
    const results = await xforge(xforgeArgs);
    return results;
}