/**
 * Handles Kloudust UI commands. Registers and runs them.
 *  
 * (C) 2022 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

import {apimanager as apiman} from "/framework/js/apimanager.mjs";

const REGISTERED_COMMANDS = {};

/**
 * Registers the given command object.
 * @param {Object} cmdObject Command object
 * @throws Error if the same object is already registered
 */
function registerCommand(cmdObject) {
    if (REGISTERED_COMMANDS[cmdObject.id]) throw new Error(`Command ${cmdObject.id} is already registered.`);
    REGISTERED_COMMANDS[cmdObject.id] = cmdObject;
}

/**
 * Handles command clicked event
 * @param {string} id The ID of the command clicked 
 * @returns The command output
 */
function cmdClicked(id) {
    const command = REGISTERED_COMMANDS[id]; if (!command) {LOG.error(`Commands ${id} not found.`); return;}

    const html = `<span>${JSON.stringify(command)}</span>
        <span onclick="window.monkshu_env.apps[APP_CONSTANTS.APP_NAME].main.hideOpenContent()">Click to close</span>`;
    monkshu_env.apps[APP_CONSTANTS.APP_NAME].main.showContent(html);
}

async function _runKloudustCommand(paramObject, command) {
    const mustache = await router.getMustache();
    const cmd = mustache.render(command, paramObject);
    _processCommandOutput(`Running command - ${cmd}`, true);
    const cmdResult = await apiman.rest(APP_CONSTANTS.API_KLOUDUSTCMD, "POST", {cmd}, true, false);
    if (cmdResult) {_processCommandOutput(cmdResult.out); _processCommandOutput(cmdResult.err); _processCommandOutput(`Success! Exit code: ${cmdResult.exitCode}`);}
    else _processCommandOutput(`Command Failed.${cmdResult.err?"Error was\n"+cmdResult.err:""}`);
}

function _processCommandOutput(text, firstLineOfNewCommand) {
    const consoleOut = document.querySelector("div#output > div#console");
    if (firstLineOfNewCommand && consoleOut.innerHTML.trim() != "") consoleOut.innerHTML = consoleOut.innerHTML + "<br>\n<br>\n";

    const linebreakEscapedText = text.trim().replace(/(?:\r\n|\r|\n)/g, '<br>');
    if (text && text.trim != "") {
        consoleOut.innerHTML = consoleOut.innerHTML.trim() != "" ?
            consoleOut.innerHTML + "<br>\n" + linebreakEscapedText : linebreakEscapedText;
    }
}

export const cmdmanager = {registerCommand, cmdClicked};