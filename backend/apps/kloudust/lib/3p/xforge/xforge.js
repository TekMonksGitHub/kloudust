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

/**
 * XForge compatible bridge.
 * @param {Object} xforge_args We use two properties - {other: [Strings], console: Object}. Other is the 
 *                             command line params for the remote SSH scripts in space delimited format (same
 *                             as a regular terminal command line) and console is a console handler having 
 *                             functions like LOGINFO, LOGWARN, LOGERROR, LOGUNAUTH etc for handling 
 *                             streaming output. The console handler is unique to Kloudust and not part of 
 *                             typical XForge commands.
 * @returns Results object containing {result: true or false, exitcode: remote exit code, out: remote out, err: remote errors}
 */
exports.xforge = async function(xforge_args) {
    try {
        const remoteCommand = xforge_args.other;

        const [host, user, password, hostkey, port, scriptPath] = [...remoteCommand].slice(0, 6);
        const sshArgs = [...remoteCommand].slice(5);    // this is because all Kloudust files start from param 1 so we need param 0 to be the script itself
        const results = await ssh_cmd(host, user, password, hostkey, port, scriptPath, sshArgs, xforge_args.console);

        (xforge_args.console?xforge_args.console.LOGINFO:KLOUD_CONSTANTS.LOGINFO)("Success, done.");
        return results;
	} catch (err) { 
		(xforge_args.console?xforge_args.console.LOGERROR:KLOUD_CONSTANTS.LOGERROR)(
            `Build failed with remote exit code: ${err.exitCode}, due to error: ${err.stderr}`);
        const exitCode = 1, stdout = err.stdout||'', stderr = err.stderr||err.toString();
        return {result: false, exitCode, stdout, stderr, out: stdout, err: stderr}; 
	}
}

function ssh_cmd(host, user, password, hostkey, port=22, shellScriptPath, scriptParams, streamer) {
    (streamer?streamer.LOGINFO:KLOUD_CONSTANTS.LOGINFO)(`[SSH_CMD]: ${user}@${host}:${port} -> ${scriptParams.join(" ")}`);
    return new Promise((resolve, reject) => {
        remote_ssh.runRemoteSSHScript({user, password, host, hostkey, port}, shellScriptPath, scriptParams, streamer, (exit_code,stdout,stderr) => {
            if (exit_code == 0) resolve({result: true, exitCode: 0, stdout, stderr, out: stdout, err: stderr});
            else reject({result: false, exitCode: exit_code, stdout, stderr, out: stdout, err: stderr});
        });
    });
}