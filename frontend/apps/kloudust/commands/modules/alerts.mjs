/**
 * Returns HTML for the cloud alerts
 * 
 * (C) 2023 TekMonks. All rights reserved.
 * License: See enclosed license.txt file.
 */

const RESOURCES_PATH = $$.libutil.getModulePath(import.meta)+"/resources";

const HTML_TEMPLATE = `
<style>
::-webkit-scrollbar {
    width: 0.5em !important;
    height: 0.5em !important;
    scroll-behavior: smooth !important;
}
::-webkit-scrollbar-track {
    -webkit-box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.3) !important;
    box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.3) !important;
    margin: 5em;
    border-radius: 1em !important;
}
::-webkit-scrollbar-thumb {
    background-color: darkgrey !important;
    border-radius: 1em !important;
    background-clip: padding-box;
}

body {height: 100%; margin: 0;}

div#body {
    overflow: hidden;
    max-height: 100%;
    box-sizing: border-box;
    color: #DCDCDC;
    background-color: #4C4C4C;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
}

span#header {
    display: flex;
    flex-direction: row;
}
div#clear {
    padding: 0.4em 0.6em;
    background-color: #2395EC;
    border-radius: 0.2em;
    margin: 1em;
    cursor: pointer;
    height: 1em;
    width: 0.8em;
    display: flex;
    justify-content: center;
}
div#close {
    padding: 0.2em 0.6em;
    background-color: #BC5205;
    border-radius: 0.2em;
    margin: 1em;
    cursor: pointer;
}

div#main {
    display: flex;
    flex-direction: column;
    width: 100%;
    box-sizing: border-box;
    height: 100%;
    overflow-y: auto;
    max-height: 100%;
}

div#alertpartition {
    font-size: 0.98rem;
    margin: 0.5rem;
}

div#alertcontainer {
    margin: 0em 1.5em;
    border: 1px solid white;
    border-radius: 1em;
    overflow: clip;
    height: 0;
}
div#alertcontainer.visible {height: auto;}

div#alertdiv {
    padding: 0.5em;
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    align-items: center;
}
div#main div#alertdiv:nth-child(odd) {background-color: #858585;}
span#alertmessage {
    width: calc(100% - 2.5em);
    font-family: monospace;
    user-select: text;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
}
span#alerticon {
    margin-right: 1em;
    height: 1.5em;
    width: 1.5em;
}
span#alerticon img {height: 100%;}
</style>

<div id="body">
<span id="header">
<div id="clear" onclick='event.stopPropagation(); 
    monkshu_env.apps[APP_CONSTANTS.APP_NAME].cmdmanager.clearAlerts(this);
    monkshu_env.apps[APP_CONSTANTS.APP_NAME].cmdmanager.reloadForm(this)'><img src='{{{clear_icon}}}'></div>
<div id="close" onclick='event.stopPropagation(); monkshu_env.apps[APP_CONSTANTS.APP_NAME].cmdmanager.closeForm(this)'>X</div>
</span>

<div id="main">
{{^alert_stacks}}
<div id="alertdiv"><span id="alerticon"><img src="{{{info_icon}}}"></span><span id="alertmessage">No alerts.</span></div>
{{/alert_stacks}}
{{#alert_stacks}}
    <div id="alertpartition" onclick="
        const containerThis = this.nextElementSibling;
        containerThis.classList.toggle('visible');
        if (containerThis.classList.contains('visible')) this.innerText = this.innerText.replace('>','⌄');
        else this.innerText = this.innerText.replace('⌄','>');
    ">&gt;&nbsp;{{{heading}}}</div>
    <div id="alertcontainer">
    {{#alerts}}
    <div id="alertdiv"><span id="alerticon"><img src="{{{alerticon}}}"></span><span id="alertmessage">{{{message}}}</span></div>
    {{/alerts}}
    </div>
{{/alert_stacks}}
</div>

</div>
`;

async function getHTML(_formJSON, cmdmanager) {
    const alertsObject = cmdmanager.getAlerts();
    const alertIDsSorted = Object.keys(alertsObject).sort((a, b) => a - b);
    let alertStackObjects; for (const alertID of alertIDsSorted) {
        const alertStackObject = {heading: $$.libutil.encodeHTMLEntities(alertsObject[alertID][0].message), alerts: []};
        for (const alert of alertsObject[alertID]) {
            if (alert.type == cmdmanager.ALERT_ERROR) alert.error = true;
            alert.alerticon = alert.error?`${RESOURCES_PATH}/alerts_error.svg`:`${RESOURCES_PATH}/alerts_info.svg`;
            alert.message = $$.libutil.encodeHTMLEntities(alert.message).replaceAll(/\r?\n/g, "<br/>");
            alertStackObject.alerts.push(alert);
        }
        if (!alertStackObjects) alertStackObjects = []; alertStackObjects.push(alertStackObject);
    }
    const html = await $$.librouter.expandPageData(HTML_TEMPLATE, undefined, {alert_stacks: alertStackObjects, 
        clear_icon: `${RESOURCES_PATH}/alerts_clear.svg`, info_icon: `${RESOURCES_PATH}/alerts_info.svg`});
    return html;
}

export const alerts = {getHTML};