/* 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const path = require("path");

const colors = {
    red: s => `\x1b[031m${s}\x1b[0m`,
    green: s => `\x1b[032m${s}\x1b[0m`,
    yellow: s => `\x1b[033m${s}\x1b[0m`,
    blue: s => `\x1b[034m${s}\x1b[0m`
}

exports.COLORED_OUT = false;
exports.COLORS = colors;
const _getColoredMessage = (s, colorfunc) => exports.COLORED_OUT && (!global.LOG) ? colorfunc(s) : s;

exports.env = {};
exports.ROOTDIR = path.resolve(`${__dirname}/../`);
exports.DBDIR = path.resolve(`${exports.ROOTDIR}/db`);
exports.LIBDIR = path.resolve(`${exports.ROOTDIR}/lib`);
exports.APIDIR = path.resolve(`${exports.ROOTDIR}/apis`);
exports.CONFDIR = path.resolve(`${exports.ROOTDIR}/conf`);
exports.CONF = require(`${exports.CONFDIR}/kloudust.json`);
exports.CMDDIR = path.resolve(`${exports.ROOTDIR}/lib/cmd`);
exports.KDHOST_SYSTEMDIR = "/kloudust/system";
exports.MONKSHU_BACKEND_LIBDIR = CONSTANTS.LIBDIR||`${exports.LIBDIR}/3p/monkshu/backend/server/lib`;

exports.ROLES = Object.freeze({CLOUD_ADMIN: "cloudadmin", ORG_ADMIN: "orgadmin", USER: "user"});
exports.LOGINAPP_ORG_ADMIN = "admin";
exports.DEFAULT_PROJECT = "default";    // every org should have this and every user for an org should be part of this project

exports.COLORS = colors;
exports.UNAUTH_MSG = "User is not authorized for this action";
exports.SUCCESS_MSG = "Success, done.";
exports.FAILED_MSG = "Failed.";
exports.LOGBARE = (s, color=colors.green) => (LOG?LOG.info:console.info).apply(LOG?LOG:console,
    [_getColoredMessage(`${s}${LOG?"":"\n"}`, color)]);
exports.LOGINFO = s => (LOG?LOG.info:console.info).apply(LOG?LOG:console,
    [_getColoredMessage(`[INFO] ${s}${LOG?"":"\n"}`, colors.green)]);
exports.LOGERROR = e => (LOG?LOG.error:console.error).apply(LOG?LOG:console,
    [_getColoredMessage(`[ERROR] ${_getErrorMessage(e)}${LOG?"":"\n"}`, colors.red)]);
exports.LOGWARN = s => (LOG?LOG.warn:console.warn).apply(LOG?LOG:console,
    [_getColoredMessage(`[WARN] ${s}${LOG?"":"\n"}`, colors.yellow)]);
exports.LOGEXEC = s => (LOG?LOG.info:console.info).apply(LOG?LOG:console,
    [_getColoredMessage(`[EXEC] ${s}${LOG?"":"\n"}`, colors.blue)]);
exports.LOGUNAUTH = _ => (LOG?LOG.error:console.error).apply(LOG?LOG:console,
    [_getColoredMessage(`[ERROR] ${exports.UNAUTH_MSG}${LOG?"":"\n"}`, colors.red)]);
exports.UNDER_MONKSHU = true;

exports.EXITOK = s => exports.LOGINFO((s?s+" ":"")+exports.SUCCESS_MSG);
exports.EXITFAILED = s => exports.LOGERROR((s?s+" ":"")+exports.FAILED_MSG); 

function _getErrorMessage(e) {
    if (e instanceof Error) return `${e.message}\n[ERROR] ${e.stack}`;

    const type = typeof e; const keys = Object.keys(e);
    if (type === 'function' || type === 'object' && !!e && keys.length) return JSON.stringify(e);

    return e;
}
