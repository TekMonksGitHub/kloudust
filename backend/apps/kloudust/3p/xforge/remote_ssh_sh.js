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
const {ShellCommandClient} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/pyshell/pyshellclient.js`);

const agentConf = {
    "shellexecprefix_win32": ["cmd.exe", "/s", "/c"],
    "shellexecprefix_linux": ["/bin/sh","-c"],
    "shellexecprefix_darwin": ["/bin/sh","-c"],
    "shellexecprefix_freebsd": ["/bin/sh","-c"],
    "shellexecprefix_sunos": ["/bin/sh","-c"]
}

const DEFAULT_PYSHELL_POLL_FREQUENCY = 500, DEFAULT_PYSHELL_PORT_INCREMENT = 2, 
    DEFAULT_PYSHELL_PROCESS_TIMEOUT = 1800, HIGHEST_PYSHELL_PORT = 64998;
const DEFAULT_KDHOST_FIREWALL_TABLE = "kdhostfirewall";

let ACTIVE_DEPLOYMENTS = {};

/**
 * Runs remote SSH script on given host
 * @param {object} conf Contains {user, password, port, host, hostkey, 
 *                                pyshellport: if provided is used as the pyshell API port,
 *                                aeskey: if provided this AES key is used for PyShell,
 *                                pyshell_poll_frequency: how often the API polls in milliseconds, 
 *                                timeout: timeout for the process or script in seconds}
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

    if (streamer) streamer.LOGINFO(`Executing remote script: ${expanded_remote_script.path}`);
    const agentExecResult = forceSSH ? false : (await _agentExec(conf, expanded_remote_script, KLOUD_CONSTANTS.KDHOST_SYSTEMDIR+"/pyshell", streamer));
    const agentExecWorked = agentExecResult && (!agentExecResult.deploy_failed);
    if (!agentExecWorked) {
        if (streamer) streamer.LOGWARN(`Script ${expanded_remote_script.path} is using SSH to execute. Agent exec failed, performance hit!!`);
        const processExecResult = await _processExec( agentConf["shellexecprefix_"+process.platform], script, 
            expanded_remote_script, [conf.user, conf.password, conf.host, conf.hostkey, conf.port||22], streamer);
        callback(processExecResult.exit_code, processExecResult.stdout, processExecResult.stderr);
    } else {
        if (streamer) streamer.LOGINFO(`Agent exec was used for remote script: ${expanded_remote_script.path}`);
        callback(agentExecResult.exit_code, agentExecResult.stdout, agentExecResult.stderr);
    }
}

async function _agentExec(conf, expanded_remote_script, deployPath, streamer) {
    const aesKey = conf.aeskey || (conf.user + conf.password + 
        (conf.user.length + conf.password.length < 30 ? 
        new Array(30 - conf.user.length + conf.password.length).fill(0).join('') : ''));
    let pyshellport = conf.pyshellport || (parseInt(conf.port||22)+DEFAULT_PYSHELL_PORT_INCREMENT);
    if ((!conf.pyshellport) && (pyshellport > HIGHEST_PYSHELL_PORT)) pyshellport = parseInt(conf.port)-DEFAULT_PYSHELL_PORT_INCREMENT;
    const pyShellURL = `${conf.host}:${pyshellport}`; agentURL = conf.apiurl || `http://${pyShellURL}`;
    const pyshellclient = new ShellCommandClient(agentURL, aesKey);
    let health = {}; try {  health = await pyshellclient.healthCheck(); } catch (err) {health.status = "bad";}
    if (health.status != "healthy") {   // try to deploy or redeploy
        streamer.LOGINFO(`Pyshell not found on http://${pyShellURL}. Redeploying.`);
        const deploymentKey = `${conf.user}@${conf.host}:${conf.port||22}`;
        try {
            if (!ACTIVE_DEPLOYMENTS[deploymentKey]) ACTIVE_DEPLOYMENTS[deploymentKey] =  pyshellclient.deploy(
                conf.host, conf.port||22, conf.user, conf.password, deployPath, conf.user, aesKey, "0.0.0.0", 
                pyshellport, conf.timeout||DEFAULT_PYSHELL_PROCESS_TIMEOUT, DEFAULT_KDHOST_FIREWALL_TABLE);    // opens the NFT port as well for PyShell
            const deployResult = await ACTIVE_DEPLOYMENTS[deploymentKey]; delete ACTIVE_DEPLOYMENTS[deploymentKey];
            if (deployResult.exit_code != 0) {
                if (streamer) streamer.LOGERROR(`Pyshell deployment failed due to error code ${deployResult.exit_code}\nSTDERR\n${deployResult.stderr}`);
                return ({deploy_failed: true, exit_code: deployResult.exit_code, stdout: "", stderr: "PyShell Deployment Error"});
            } else if (streamer) streamer.LOGINFO(`Pyshell deployment result\nSTDOUT\n${deployResult.stdout}\n\nSTDERR\n${deployResult.stderr}`);

        } catch (err) {
            if (streamer) streamer.LOGERROR(`Pyshell deployment failed with error ${err}`);
            return ({exit_code: 1, stdout: "", stderr: err});
        }
    }
    try {
        if (streamer) streamer.LOGINFO(`[PyShell] [${pyShellURL}] Executing ${expanded_remote_script.path} via Pyshell agent.`);
        const pyshellStreamCollector = { stdout: s=>streamer.LOGINFO(`[PyShell] [${pyShellURL}] [OUT] ${s}`),
            stderr: s=>streamer.LOGERROR(`[PyShell] [${pyShellURL}] [ERROR] ${s}`) };
        const result = expanded_remote_script.ispython ?    // we run in polling mode to avoid HTTP timeout issues
            await pyshellclient.executePyCommand(expanded_remote_script.data, undefined, 
                conf.pyshell_poll_frequency||DEFAULT_PYSHELL_POLL_FREQUENCY,  pyshellStreamCollector) :
            await pyshellclient.executeScript(expanded_remote_script.data, expanded_remote_script.path, 
                undefined, undefined, conf.pyshell_poll_frequency||DEFAULT_PYSHELL_POLL_FREQUENCY,  pyshellStreamCollector);
        return ({exit_code: result.exit_code, stdout: result.stdout, stderr: result.stderr});
    } catch (err) {
        if (streamer) streamer.LOGERROR(`[PyShell] [${pyShellURL}] Execution failed with exception ${err}`);
        return ({exit_code: 1, stdout: "", stderr: err});;
    }
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
        if (KLOUD_CONSTANTS.CONF.LOG_REMOTE_SSH_FILES) fs.promises.writeFile(tmpFile, data);
        return({err: null, result: {...(typeof remote_script === "object"?remote_script:{}), path: tmpFile, data}}); 
    } catch (err) { return {err, result: null}; }
}

function _replaceAll(str, find, replace) {
    const newfind = find.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    const newstr = str.replace(new RegExp(newfind, 'g'), replace);
    return newstr;
}