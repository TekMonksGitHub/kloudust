/** 
 * remote_ssh_sh.js, Runs remote SSH scripts
 * 
 * License: See enclosed LICENSE file.
 * 
 * (C) 2018 TekMonks. All rights reserved.
 */
const os = require("os");
const fs = require("fs");
const path = require("path");
const spawn = require("child_process").spawn;
const {ShellCommandClient} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/pyshell/pyshellclient.js`);
const agentConf = {
    "shellexecprefix_win32": ["cmd.exe", "/s", "/c"],
    "shellexecprefix_linux": ["/bin/sh","-c"],
    "shellexecprefix_darwin": ["/bin/sh","-c"],
    "shellexecprefix_freebsd": ["/bin/sh","-c"],
    "shellexecprefix_sunos": ["/bin/sh","-c"]
}

/**
 * Runs remote SSH script on given host
 * @param {object} conf Contains {user, password, port, host and hostkey}
 * @param {string} remote_script The script to run, path to it or an object of format {data, path, ispython}. 
 *                               ispython, if true means run it as in-process python code if run via agent (faster).
 *                               Python scripts must start with #!/usr/bin/env python3 to be safe to be executed via
 *                               agent in-process else shell out-of-process.
 * @param {object} extra_params The array of parameters - these are ALWAYS expanded
 * @param {Object} streamer If set, output will be streamed to it as it happens, must have member functions 
 *                          LOGINFO, LOGERROR, LOGWARN etc.
 * @param {object} callback err = exitCode in case or error or null otherwise,stdout,stderr
 * @param {boolean} forceSSH If true then SSH is forced and agent is skipped
 */
exports.runRemoteSSHScript = async (conf, remote_script, extra_params, streamer, callback, forceSSH) => {
    const script = path.normalize(`${__dirname}/ssh_cmd.${process.platform == "win32"?"bat":"sh"}`);

    const expandResult = await _expandExtraParams(extra_params, remote_script);
    if (expandResult.err) {callback(1, '', err.toString()); return;}
    const expanded_remote_script = expandResult.result;

    LOG.debug(`Executing remote script: ${expanded_remote_script.path}`);
    const agentExecWorked = forceSSH ? false : await _agentExec(conf, expanded_remote_script, KLOUD_CONSTANTS.KDHOST_SYSTEMDIR+"/pyshell");
    if (!agentExecWorked) {
        LOG.warn(`Script ${expanded_remote_script.path} is using SSH to execute. Agent exec failed, performance hit!!`);
        const processExecResult = await _processExec( agentConf["shellexecprefix_"+process.platform], script, 
            expanded_remote_script, [conf.user, conf.password, conf.host, conf.hostkey, conf.port||22], streamer);
        callback(processExecResult.exit_code, processExecResult.stdout, processExecResult.stderr);
    } else callback(agentExecWorked.exit_code, agentExecWorked.stdout, agentExecWorked.stderr);
}

async function _agentExec(conf, expanded_remote_script, deployPath) {
    const aesKey = conf.user + conf.password + 
        (conf.user.length + conf.password.length < 30 ? 
        new Array(30 - conf.user.length + conf.password.length).fill(0).join('') : '');
    const pyshellport = parseInt(conf.port||22)+2, agentURL = `http://${conf.host}:${pyshellport}`;
    const pyshellclient = new ShellCommandClient(agentURL, aesKey);
    let health = {}; try {  health = await pyshellclient.healthCheck(); } catch (err) {health.status = "bad";}
    if (health.status != "healthy") {
        const deployResult = await pyshellclient.deploy(conf.host, conf.port||22, conf.user,
            conf.password, deployPath, conf.user, aesKey, "0.0.0.0", pyshellport, 
            conf.timeout||1800);
        if (deployResult.exit_code != 0) return false;
    }
    try {
        const result = expanded_remote_script.ispython ? 
            await pyshellclient.executePyCommand(expanded_remote_script.data) :
            await pyshellclient.executeScript(expanded_remote_script.data, expanded_remote_script.path);
        return result;
    } catch (err) {return false;}
}

function _processExec(cmdProcessorArray, sshScript, remoteScript, paramsArray, streamer) {
    return new Promise(async resolve => {
        try {await fs.promises.writeFile(remoteScript.path, remoteScript.data, "utf8")} 
        catch (err) {resolve({exit_code: 1, stdout: "", stderr: err})}
        const spawnArray = cmdProcessorArray.slice(0);

        const quoter = process.platform == "win32" ? '"':"'";
        const paramsArrayCopy = []; paramsArray.forEach((element, i) => { paramsArrayCopy[i] = quoter+element+quoter;}); paramsArrayCopy.push(remoteScript.path);
        let scriptCmd = quoter+sshScript+quoter + " " + paramsArrayCopy.join(" ");
        scriptCmd = process.platform == "win32" ? '"'+scriptCmd+'"' : scriptCmd;
        spawnArray.push(scriptCmd);
        
        let stdout = "", stderr = "";
        const shellProcess = spawn(spawnArray[0], spawnArray.slice(1), {windowsVerbatimArguments: true});
        shellProcess.stdout.on("data", data => {
            const outStr = String.fromCharCode.apply(null, data);
            stdout += `[SSH_CMD PID:${shellProcess.pid}] [OUT]\n${outStr}`;
            if (streamer) streamer.LOGINFO(`[SSH_CMD PID:${shellProcess.pid}] [OUT] ${outStr}`);
        });

        shellProcess.stderr.on("data", data => {
            const errStr = String.fromCharCode.apply(null, data);
            stderr += `[SSH_CMD PID:${shellProcess.pid}] [ERROR]\n${errStr}`;
            if (streamer) streamer.LOGWARN(`[SSH_CMD PID:${shellProcess.pid}] [ERROR] ${errStr}`);
        });

        shellProcess.on("exit", exitCode => {
            if (stderr.trim() == "Access is denied" && process.platform == "win32") exitCode = 1; // fix plink fake success issue on Windows
            if (streamer) streamer.LOGINFO(`[SSH_CMD PID:${shellProcess.pid}] [EXIT] Code: ${exitCode}`);
            resolve({exit_code: exitCode, stdout, stderr});
        });

        shellProcess.on("error", error => {
            if (stderr.trim() == "Access is denied" && process.platform == "win32") exitCode = 1; // fix plink fake success issue on Windows
            if (streamer) streamer.LOGINFO(`[SSH_CMD PID:${shellProcess.pid}] [ERROR] Error: ${error}`);
            resolve({exit_code: 1, stdout, stderr: stderr+"\n"+error})
        });
    });
}

async function _expandExtraParams(extra_params, remote_script) {        
    const tmpFile = path.resolve(os.tmpdir()+"/"+(Math.random().toString(36)+'00000000000000000').slice(2, 11)) +
        (remote_script.path ? `.${path.extname(remote_script.path)}` : "");

    try {
        let data = typeof remote_script === "string" ? await fs.promises.readFile(remote_script, "utf8") : remote_script.data;
        if (extra_params?.length) for (const [i,param] of extra_params.entries()) data = _replaceAll(data, "{"+i+"}", param);
        return({err: null, result: {...(typeof remote_script === "object"?remote_script:{}), path: tmpFile, data}}); 
    } catch (err) { return {err, result: null}; }
}

function _replaceAll(str, find, replace) {
    const newfind = find.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    const newstr = str.replace(new RegExp(newfind, 'g'), replace);
    return newstr;
}