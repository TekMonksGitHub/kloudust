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
 * @param {string} remote_script The script to run, path to it
 * @param {object} extra_params The array of parameters
 * @param {Object} streamer If set, output will be streamed to it as it happens, must have member functions 
 *                          LOGINFO, LOGERROR, LOGWARN etc.
 * @param {object} callback err = exitCode in case or error or null otherwise,stdout,stderr
 * @param {boolean} forceSSH If true then SSH is forced and agent is skipped
 */
exports.runRemoteSSHScript = (conf, remote_script, extra_params, streamer, callback, forceSSH) => {
    const script = path.normalize(`${__dirname}/ssh_cmd.${process.platform == "win32"?"bat":"sh"}`);

    _expandExtraParams(extra_params, remote_script, async (err, expanded_remote_script) => {
        if (err) {callback(1, '', err.toString()); return;}

        LOG.debug(`Executing remote script ${agentConf["shellexecprefix_"+process.platform].join(" ")} ${script} ${conf.user} [hostpassword] [hostkey] ${expanded_remote_script} ${conf.host}`);
        const agentExecWorked = forceSSH ? false : await _agentExec(conf, expanded_remote_script, KLOUD_CONSTANTS.KDHOST_SYSTEMDIR+"/pyshell");
        if (!agentExecWorked) _processExec( agentConf["shellexecprefix_"+process.platform], script, 
            [conf.user, conf.password, conf.host, conf.hostkey, conf.port||22, expanded_remote_script], 
            streamer, callback );
        else callback(agentExecWorked.exit_code, agentExecWorked.stdout, agentExecWorked.stderr);
    });
}

async function _agentExec(conf, expanded_remote_script, deployPath) {
    const aesKey = conf.user + conf.password + 
        (conf.user.length + conf.password.length < 30 ? 
        new Array(30 - conf.user.length + conf.password.length).fill(0).join('') : '');
    const agentURL = `http://${conf.host}:${parseInt(conf.port)+1}`;
    const pyshellclient = new ShellCommandClient(agentURL, aesKey);
    let health = {}; try {  health = await pyshellclient.healthCheck(); } catch (err) {health.status = "bad";}
    if (health.status != "healthy") {
        const deployResult = await pyshellclient.deploy(conf.host, conf.port||22, conf.user,
            conf.password, deployPath, conf.user, aesKey, "0.0.0.0", (conf.port||22)+1, 
            conf.timeout||1800);
        if (deployResult.exit_code != 0) return false;
    }
    const script = await fs.promises.readFile(expanded_remote_script, "utf8");
    const remote_script_path = `/tmp/${path.basename(expanded_remote_script)}`;
    const result = await pyshellclient.executeScript(script, remote_script_path);
    return result;
}

function _processExec(cmdProcessorArray, script, paramsArray, streamer, callback) {
    const spawnArray = cmdProcessorArray.slice(0);

    const quoter = process.platform == "win32" ? '"':"'";
    const paramsArrayCopy = []; paramsArray.forEach((element, i) => { paramsArrayCopy[i] = quoter+element+quoter;});
    let scriptCmd = quoter+script+quoter + " " + paramsArrayCopy.join(" ");
    scriptCmd = process.platform == "win32" ? '"'+scriptCmd+'"' : scriptCmd;
    spawnArray.push(scriptCmd);
    const shellProcess = spawn(spawnArray[0], spawnArray.slice(1), {windowsVerbatimArguments: true});

    let stdout = "", stderr = "";

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
        callback(exitCode?exitCode:null, stdout, stderr)
    });

    shellProcess.on("error", error => {
        if (stderr.trim() == "Access is denied" && process.platform == "win32") exitCode = 1; // fix plink fake success issue on Windows
        if (streamer) streamer.LOGINFO(`[SSH_CMD PID:${shellProcess.pid}] [ERROR] Error: ${error}`);
        callback(1, stdout, stderr+"\n"+error)
    });
}

function _expandExtraParams(extra_params, remote_script, callback) {
    if (!extra_params || !extra_params.length) {callback(null, remote_script); return;}

    fs.readFile(remote_script, "utf-8", (err, data) => {
        if (err) {callback(err, null); return;}

        for (const [i,param] of extra_params.entries()) data = _replaceAll(data, "{"+i+"}", param);

        const tmpFile = path.resolve(os.tmpdir()+"/"+(Math.random().toString(36)+'00000000000000000').slice(2, 11));
        fs.writeFile(tmpFile, data, err => {
            if (err) {callback(err, null); return;}
            else callback(null, tmpFile);
        });
    });
}

function _replaceAll(str, find, replace) {
    find = find.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");;

    str = str.replace(new RegExp(find, 'g'), replace);
    return str;
}