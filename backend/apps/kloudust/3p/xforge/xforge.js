/**
 * >>>>> NOT REAL XFORGE!!! <<<<<<<
 * 
 * Stub to migrate Kloudust to be independent of XForge. This 
 * provides an interface compatible to XForge in-process args.
 * 
 * License: See enclosed LICENSE file.
 * (C) 2023 Tekmonks
 */

const remote_ssh = require(`${__dirname}/remote_ssh_sh.js`);

const PYSHELL_POLL_FREQUENCY = 500, PYSHELL_PORT_INCREMENT = 2, PYSHELL_PROCESS_TIMEOUT = 1800;

/**
 * XForge compatible bridge.
 * @param {Object} xforge_args We use two properties - {other: [Strings], console: Object}. Other is the 
 *                             command line params for the remote SSH scripts in space delimited format (same
 *                             as a regular terminal command line) and console is a console handler having 
 *                             functions like LOGINFO, LOGWARN, LOGERROR, LOGUNAUTH etc for handling 
 *                             streaming output. The console handler is unique to Kloudust and not part of 
 *                             typical XForge commands.
 * 
 *                             Optionally: agent_config can be set, which if provided is used to derive 
 *                             the agent AES key and port
 * @returns Results object containing {result: true or false, exitcode: remote exit code, out: remote out, err: remote errors}
 */
exports.xforge = async function(xforge_args) {
    try {
        const remoteCommand = xforge_args.other;

        const [host, user, password, hostkey, port, scriptPath] = [...remoteCommand].slice(0, 6);
        const sshArgs = [...remoteCommand].slice(5);    // this is because all Kloudust files start from param 1 so we need param 0 to be the script itself
        const agent_config = xforge_args.agent_config;
        const results = await ssh_cmd(host, user, password, hostkey, port, scriptPath, sshArgs, xforge_args.console, agent_config);

        (xforge_args.console?xforge_args.console.LOGINFO:KLOUD_CONSTANTS.LOGINFO)("Success, done.");
        return results;
	} catch (err) { 
		(xforge_args.console?xforge_args.console.LOGERROR:KLOUD_CONSTANTS.LOGERROR)(
            `Build failed with remote exit code: ${err.exitCode}, due to error: ${err.stderr}`);
        const exitCode = 1, stdout = err.stdout||'', stderr = err.stderr||err.toString();
        return {result: false, exitCode, stdout, stderr, out: stdout, err: stderr}; 
	}
}

exports.getAgentConfig = function(host, user, new_password, new_sshport) {
    let pyshellPort = parseInt(new_sshport)+PYSHELL_PORT_INCREMENT;
    if (pyshellPort > 64998) pyshellPort = parseInt(new_sshport)-PYSHELL_PORT_INCREMENT;
    return {
        host, port: pyshellPort, poll_frequency: PYSHELL_POLL_FREQUENCY, timeout: PYSHELL_PROCESS_TIMEOUT, apiurl: `http://${host}:${pyshellPort}`,
        aeskey: (user + new_password + (user.length + new_password.length < 30 ? new Array(30 - user.length + new_password.length).fill(0).join('') : '')), 
    };
}

function ssh_cmd(host, user, password, hostkey, port=22, shellScriptPath, scriptParams, streamer, agent_config={}) {
    (streamer?streamer.LOGINFO:KLOUD_CONSTANTS.LOGINFO)(`[SSH_CMD]: ${user}@${host}:${port} -> ${scriptParams.join(" ")}`);
    const aeskey = agent_config.aeskey || (user + password + (user.length + password.length < 30 ? 
        new Array(30 - user.length + password.length).fill(0).join('') : ''));
    const pyshellport = agent_config.port || (parseInt(port)+PYSHELL_PORT_INCREMENT);
    const pyshell_poll_frequency = agent_config.poll_frequency || PYSHELL_POLL_FREQUENCY;
    const timeout = agent_config.timeout || PYSHELL_PROCESS_TIMEOUT;
    const remote_ssh_conf = {user, password, host, hostkey, port, aeskey, pyshellport, pyshell_poll_frequency, timeout};

    return new Promise((resolve, reject) => {
        remote_ssh.runRemoteSSHScript(remote_ssh_conf, shellScriptPath, scriptParams, streamer, (exit_code,stdout,stderr) => {
            if (exit_code == 0) resolve({result: true, exitCode: 0, stdout, stderr, out: stdout, err: stderr});
            else reject({result: false, exitCode: exit_code, stdout, stderr, out: stdout, err: stderr});
        });
    });
}
