/**
 * Handles Kloudust UI commands. Registers and runs them.
 *  
 * (C) 2022 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

import {rolemanager as roleman} from "./rolemanager.mjs";

const REGISTERED_COMMANDS = {}, KLOUDUST_CMDLINE = "kloudust_cmdline", FRONTEND_MODULE = "frontend_module",
    ALERT_OBJECT_KEY = "__com_tekmonks_kloudust_frontend_alerts", ALERT_ERROR = "error", ALERT_INFO = "info",
    RAW_COMMANDLINE_COMMAND = "RAW_COMMANDLINE", TABLE_DISPLAY = "table_display", apiman = $$.libapimanager;

const cmd_stack = [];

/**
 * Registers the given command object.
 * @param {Object} cmdObject Command object
 */
function registerCommand(cmdObject) {
    REGISTERED_COMMANDS[cmdObject.id] = cmdObject;

    // plug ourselves into the enviornment if not present
    if (!monkshu_env.apps[APP_CONSTANTS.APP_NAME].cmdmanager) monkshu_env.apps[APP_CONSTANTS.APP_NAME].cmdmanager = cmdmanager;
}

/**
 * Handles command clicked event
 * @param {string} id The ID of the command clicked 
 * @returns The command output
 */
async function cmdClicked(id) {
    const command = REGISTERED_COMMANDS[id]; if (!command) {LOG.error(`Commands ${id} not found.`); return;}

    try {
        const formJSON = await $$.requireJSON(`${APP_CONSTANTS.FORMS_PATH}/${id}.form.json`, APP_CONSTANTS.INSECURE_DEVELOPMENT_MODE?true:undefined);
        const html = await _getFormHTML(formJSON);
        monkshu_env.apps[APP_CONSTANTS.APP_NAME].main.showContent(html, true);
        if (!cmd_stack.length) cmd_stack.push(id); else if (cmd_stack[cmd_stack.length-1] != id) cmd_stack.push(id);
    } catch (err) {LOG.error(`Error loading command files for ${id}: ${err}`); return;}
}

function closeForm() {
    const _currentForm = cmd_stack.pop(), nextForm = cmd_stack.pop();
    if (nextForm) cmdClicked(nextForm); else monkshu_env.apps[APP_CONSTANTS.APP_NAME].main.hideOpenContent(); 
}

function reloadForm() {
    const currentForm = cmd_stack.pop()
    cmdClicked(currentForm);
}

async function formSubmitted(id, values) {
    closeForm();    // close the form

    const form = await $$.requireJSON(`${APP_CONSTANTS.FORMS_PATH}/${id}.form.json`); 
    if (form.type != KLOUDUST_CMDLINE) return;  // no need to call backend in this case

    if (values._override_form_command) form.command = values._override_form_command;
    let command = form.command == RAW_COMMANDLINE_COMMAND?"":form.command;
    const cmdLineMap = form.kloudust_cmdline_params;
    for (const param of cmdLineMap) command += form.command == RAW_COMMANDLINE_COMMAND?values[param]+" ":" "+('"'+values[param]+'"'||'""');
    command = command.trim();
    
    const project = $$.libsession.get(APP_CONSTANTS.ACTIVE_PROJECT, APP_CONSTANTS.DEFAULT_PROJECT);
    const alertID = Date.now();
    _processCommandOutput(alertID, `Running command for project ${project} - ${command}`, false);
    const cmdResult = await apiman.rest(APP_CONSTANTS.API_KLOUDUSTCMD, "POST", {cmd: command, project}, true);
    if (cmdResult?.result) {
        _processCommandOutput(alertID, `Success. Command output follows.`);
        if ((cmdResult.out||"").trim() != "") _processCommandOutput(alertID, cmdResult.out); 
        if ((cmdResult.err||"").trim() != "") _processCommandOutput(alertID, cmdResult.err); 
        _processCommandOutput(alertID, `Exit code: ${cmdResult.exitcode}`);
    } else _processCommandOutput(alertID, `Command Failed for project ${project} - ${command}${cmdResult?.err?". Error was\n"+cmdResult.err:""}`, true);
}

function addAlert(id, text, isError) {
    const formattedAlert = {type: isError?ALERT_ERROR:ALERT_INFO, message: text};
    const alertObject = $$.libsession.get(ALERT_OBJECT_KEY, {});
    const thisAlertStack = alertObject[id]||[];
    thisAlertStack.push(formattedAlert);
    alertObject[id] = thisAlertStack;
    $$.libsession.set(ALERT_OBJECT_KEY, alertObject);
}

function getAlerts() {
    const alertObject = $$.libsession.get(ALERT_OBJECT_KEY, {});
    return $$.libutil.clone(alertObject);
}

const clearAlerts = _ => $$.libsession.set(ALERT_OBJECT_KEY, {});

function _processCommandOutput(id, text, isError=false) {
    if (isError) addAlert(id, text, true);
    else addAlert(id, text);
}

async function _getFormHTML(formJSON) {
    let html = "";

    if (formJSON.type.toLowerCase() == KLOUDUST_CMDLINE) {
        const base64FormJSON = $$.libutil.stringToBase64(JSON.stringify(formJSON.form)), id = formJSON.id;
        if (formJSON.i18n) for (const [lang, i18nObject] of Object.entries(formJSON.i18n)) await $$.libi18n.setI18NObject(lang, i18nObject);

        html = `<form-runner id="${id}" data-form='${base64FormJSON}'
            onclose='monkshu_env.apps[APP_CONSTANTS.APP_NAME].cmdmanager.closeForm()'
            onsubmit='monkshu_env.apps[APP_CONSTANTS.APP_NAME].cmdmanager.formSubmitted("${id}", formdata)'></form-runner>`;
    }

    if (formJSON.type.toLowerCase() == TABLE_DISPLAY) {
        const base64TabledefJSON = $$.libutil.stringToBase64(JSON.stringify(formJSON.tabledef)), id = formJSON.id;
        if (formJSON.i18n) for (const [lang, i18nObject] of Object.entries(formJSON.i18n)) await $$.libi18n.setI18NObject(lang, i18nObject);

        html = `<table-list id="${id}" data-tabledef='${base64TabledefJSON}'
            onclose='monkshu_env.apps[APP_CONSTANTS.APP_NAME].cmdmanager.closeForm()'></table-list>`;
    }
    
    if (formJSON.type.toLowerCase() == FRONTEND_MODULE) {
        const formModule = await import(`${APP_CONSTANTS.FORM_MODULES_PATH}/${formJSON.command}.mjs`);
        html = await formModule[formJSON.command].getHTML(formJSON, cmdmanager);
    }

    return html;
}

export const cmdmanager = {registerCommand, cmdClicked, formSubmitted, closeForm, addAlert, getAlerts, clearAlerts,
    reloadForm, isCloudAdminLoggedIn: roleman.isCloudAdminLoggedIn, ALERT_ERROR, ALERT_INFO};