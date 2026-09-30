/**
 * Returns HTML for the MonkVision dashboard
 *
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const AUTH_REQUEST = "kloudust:monkvision-auth-request", AUTH_RESPONSE = "kloudust:monkvision-auth-response";
let authMessageListener;

const HTML_TEMPLATE = monkvisionFrontendURL => `
<style>
html, body {
    height: 100%;
    margin: 0;
    padding: 0;
}

div#body {
    width: 100%;
    height: 100vh;
    margin: 0;
    padding: 0;
    overflow: hidden;
}

iframe#monkvision {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
}
</style>

<div id="body">
    <iframe
        id="monkvision"
        src="${monkvisionFrontendURL}">
    </iframe>
</div>
`;

async function getHTML(_formJSON, cmdmanager) {
    _setupMonkvisionAuthBridge();
    const html = await $$.librouter.expandPageData(
        HTML_TEMPLATE(APP_CONSTANTS.MONKVISION_FRONTEND_URL),
        undefined,
        {}
    );

    return html;
}

function _setupMonkvisionAuthBridge() {
    if (authMessageListener) return;
    const monkvisionOrigin = new URL(APP_CONSTANTS.MONKVISION_FRONTEND_URL).origin;
    authMessageListener = event => {
        const iframe = document.getElementById("monkvision");
        if (event.origin !== monkvisionOrigin || event.source !== iframe?.contentWindow) return;

        if (event.data?.type === AUTH_REQUEST) {
            const savedLoginResponse = $$.libsession.get(APP_CONSTANTS.MONKVISION_LOGIN_RESULT_KEY);
            const loginResponse = savedLoginResponse && JSON.parse(JSON.stringify(savedLoginResponse));
            if (loginResponse) iframe.contentWindow.postMessage({type: AUTH_RESPONSE, loginResponse}, monkvisionOrigin);
        }
    };
    window.addEventListener("message", authMessageListener);
}

export const monitoring = {getHTML};
