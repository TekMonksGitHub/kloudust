/**
 * Main constant for the app.
 * (C) 2015 TekMonks. All rights reserved.
 * License: See enclosed license.txt file.
 */
const FRONTEND = new URL(window.location).protocol + "//" + new URL(window.location).host;
const BACKEND = new URL(window.location).protocol + "//" + new URL(window.location).hostname + ":9090";
const APP_NAME = "kloudust";
const APP_PATH = `${FRONTEND}/apps/${APP_NAME}`;
const API_PATH = `${BACKEND}/apps/${APP_NAME}`;
const CONF_PATH = `${FRONTEND}/apps/${APP_NAME}/conf`;
const INDEX_HTML = APP_PATH+"/index.html";
const MAIN_HTML = APP_PATH+"/main.html";
const LOGIN_HTML = APP_PATH+"/login.html";
const LOGINRESULT_HTML = APP_PATH+"/loginresult.html";

export const APP_CONSTANTS = {
    FRONTEND, BACKEND, APP_PATH, APP_NAME, CONF_PATH, API_PATH,
    INDEX_HTML, MAIN_HTML, LOGIN_HTML, LOGINRESULT_HTML, 

    ENV: {},

    LIB_PATH: APP_PATH+"/js",
    DIALOGS_PATH: APP_PATH+"/dialogs",
    COMMANDS_PATH: APP_PATH+"/commands",
    FORMS_PATH: APP_PATH+"/commands/forms",
    FORM_MODULES_PATH: APP_PATH+"/commands/modules",

    SESSION_NOTE_ID: "com_monkshu_ts",

    // Login constants
    MIN_PASS_LENGTH: 8,
    API_LOGIN: API_PATH+"/login",
    API_KLOUDUSTCMD: API_PATH+"/kloudustcmd",
    USERID: "userid",
    USERPW: "pw",
    MIN_PW_LENGTH: 10,
    TIMEOUT: 3600000,
    USERNAME: "username",
    USERORG: "userorg",
    LOGGEDIN_USEROLE: "userrole",
    USER_ROLE: "user",
    GUEST_ROLE: "guest",
    ACTIVE_PROJECT: "project",
    DEFAULT_PROJECT: "default",
    ASSIGNED_PROJECTS_SESSION_KEY: "_org_kloudust_projects_assigned_",
    KLOUDUST_ROLES: Object.freeze({cloudadmin: "cloudadmin", orgadmin: "orgadmin", user: "user"}),

    TKMLOGIN_LIB: `${APP_PATH}/3p/tkmlogin.mjs`,

    PERMISSIONS_MAP: {
        user:[window.location.origin, MAIN_HTML, LOGIN_HTML, LOGINRESULT_HTML, APP_PATH+$$.MONKSHU_CONSTANTS.ERROR_HTML], 
        guest:[window.location.origin, LOGIN_HTML, LOGINRESULT_HTML, $$.MONKSHU_CONSTANTS.ERROR_HTML]
    },
    API_KEYS: {"*":"fheiwu98237hjief8923ydewjidw834284hwqdnejwr79389"},
    KEY_HEADER: "X-API-Key"
}