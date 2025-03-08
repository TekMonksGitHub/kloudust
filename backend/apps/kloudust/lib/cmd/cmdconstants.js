/**
 * Constants for Kloudust commands.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

exports.FALSE_RESULT = (err="", out="") => {return {result: false, err, out}};
exports.TRUE_RESULT = (out="", err="") => {return {result: true, err, out}};
exports.SCRIPT_JSONOUT_SPLITTER = "-----KLOUDUST_JSON_OUT-----";
exports.PROJECT_EXCLUDED_COMMANDS = ["getUserProjects", "addHost", "rebootHost", "addImage", "addUser", "lookupHost", 
    "listHostResources", "listVMsForHost", "customCmd", "changeUserRole", "liveMigrate", "listVMImages","listVlans","listVmHosts","createFirewall","firewallvm"]
