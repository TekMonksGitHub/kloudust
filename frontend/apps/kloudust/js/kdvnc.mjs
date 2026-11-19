/**
 * VM console window (kdvnc.html) on noVNC core, opened by commands/forms/accessvmconsole.form.json
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

import {RFB, KeyTable, keysyms} from "../3p/novnc.min.mjs";

const KEYS = {ctrl: [KeyTable.XK_Control_L, "ControlLeft"], alt: [KeyTable.XK_Alt_L, "AltLeft"],
    win: [KeyTable.XK_Super_L, "MetaLeft"], tab: [KeyTable.XK_Tab, "Tab"], esc: [KeyTable.XK_Escape, "Escape"]};
const SHIFTED_CHARS = /[A-Z~!@#$%^&*()_+{}|:"<>?]/;

let rfb, connected = false;

async function connect(screen) {
    const sessionKey = `_${window.name}`, env = window.opener?.APP_CONSTANTS?.ENV;
    const session = await env?.[sessionKey]; if (env) delete env[sessionKey];
    if (!session?.result) {_setStatus("Console access failed. Close this window and try again.", "error"); return;}

    const vm = session.vm_name; document.title = `${vm} - ${document.title}`; _setStatus(`Connecting to ${vm}...`);
    const url = `${location.protocol == "https:" ? "wss" : "ws"}://${location.host}/apps/kloudust/vncproxy/${session.host}/${session.port}`;   // via the frontend proxy, see conf/httpd.json
    rfb = new RFB(screen, url, {credentials: {password: session.password}});
    rfb.scaleViewport = true; rfb.resizeSession = true;
    let failure; rfb.addEventListener("securityfailure", _ => failure = "Console password was rejected.");
    rfb.addEventListener("connect", _ => {connected = true; _setStatus(`Connected to ${vm}`, "connected");});
    rfb.addEventListener("disconnect", event => {
        connected = false; if (failure || !event.detail.clean) _setStatus(failure || `Connection to ${vm} lost. Close this window and try again.`, "error");
        else _setStatus(`Disconnected from ${vm}`);
        for (const button of document.querySelectorAll("button.down")) button.classList.remove("down");
    });
}

function sendCtrlAltDel() {rfb?.sendCtrlAltDel(); rfb?.focus();}

function sendKey(key) {rfb?.sendKey(...KEYS[key]); rfb?.focus();}

function toggleKey(button, key) {if (connected) rfb.sendKey(...KEYS[key], button.classList.toggle("down")); rfb?.focus();}

function typeText() {   // no scancode, so QEMU maps each keysym with its keymap - which ignores case, hence the explicit Shift
    for (const char of prompt("Text to type into the VM")||"") {
        const shift = SHIFTED_CHARS.test(char);
        if (shift) rfb?.sendKey(KeyTable.XK_Shift_L, "ShiftLeft", true);
        rfb?.sendKey(keysyms.lookup(char.codePointAt(0)), null);
        if (shift) rfb?.sendKey(KeyTable.XK_Shift_L, "ShiftLeft", false);
    }
    rfb?.focus();
}

function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
    rfb?.focus();
}

function _setStatus(text, state="") {
    const status = document.querySelector("span#status"); status.textContent = status.title = text; status.className = state;
}

export const kdvnc = {connect, sendCtrlAltDel, sendKey, toggleKey, typeText, toggleFullscreen};
