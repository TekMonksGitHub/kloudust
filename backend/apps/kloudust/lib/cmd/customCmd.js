/** 
 * customCmd.js - Runs a custom command on the DB or host.
 * Only cloud admins can run this.
 * 
 * Params - 0 - sql, the SQL to run, 1 - hostname - the hostname to run on, 
 * 2 - cmd - the command to run on the host
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const os = require("os");
const path = require("path");
const fspromises = require("fs").promises;
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Runs a custom command (script) on the host with given params
 * @param {array} params The incoming params - must be - hostname, script path, additional params for the script
 */
module.exports.exec = async function(params) {
    if (!roleman.isCloudAdminLoggedIn()) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}

    const paramsQuoted = []; for (const param of params) paramsQuoted.push(`"${param}"`);
    params.consoleHandlers.LOGWARN(`Warning!!! Custom command is being run by user ${KLOUD_CONSTANTS.env.userid()}. The command is ${["customCmd", ...paramsQuoted].join(" ")}`);

    const [sql, hostname, cmd] = [...params];
    let out = "", resultSQL;
    if (sql.trim() != "") {
        resultSQL = await dbAbstractor.runSQL(sql.trim());
        if (!resultSQL) {const err = "DB SQL failed: "+sql; params.consoleHandlers.LOGERROR(err); return CMD_CONSTANTS.FALSE_RESULT(err);}
        out += "Database output follows\n"+JSON.stringify(resultSQL);
    }

    if (hostname && cmd) {
        const hostInfo = await dbAbstractor.getHostEntry(hostname); 
        if (!hostInfo) {const err = "Bad hostname or host not found"; params.consoleHandlers.LOGERROR(err); return CMD_CONSTANTS.FALSE_RESULT(err);}

        const tmpFile = path.resolve(os.tmpdir()+"/"+(Math.random().toString(36)+'00000000000000000').slice(2, 11));
        try {await fspromises.writeFile(tmpFile, cmd, "utf8")} catch (err) {
            params.consoleHandlers.LOGERROR(err); return CMD_CONSTANTS.FALSE_RESULT(err);}

        const xforgeArgs = {
            colors: KLOUD_CONSTANTS.COLORED_OUT, 
            file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
            console: params.consoleHandlers,
            other: [
                hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
                tmpFile
            ]
        }

        const xforgeResults = await xforge(xforgeArgs);
        out += `${out!=""?"\n\n":""}Host output follows for host ${hostname}\n${xforgeResults.out}`;
        return {...xforgeResults, out, stdout: out, resultSQL};
    } else return {...CMD_CONSTANTS.TRUE_RESULT(), out, err: "", stdout: out, stderr: "", resultSQL};
    
}