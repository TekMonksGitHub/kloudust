/**
 * Main webapp entry point. 
 * (C) 2015 TekMonks. All rights reserved.
 * License: See enclosed license.txt file.
 */
 
import {APP_CONSTANTS as AUTO_APP_CONSTANTS} from "./constants.mjs";

const apiman = $$.libapimanager;

const init = async hostname => {
	window.APP_CONSTANTS = (await import ("./constants.mjs")).APP_CONSTANTS; 
	window.monkshu_env.apps[AUTO_APP_CONSTANTS.APP_NAME] = AUTO_APP_CONSTANTS.ENV;
	const mustache = await $$.librouter.getMustache();
	window.APP_CONSTANTS = JSON.parse(mustache.render(JSON.stringify(AUTO_APP_CONSTANTS), {hostname}));
	await _readConfig(); 

	window.LOG = (await import ("/framework/js/log.mjs")).LOG;
	if (!$$.libsession.get($$.MONKSHU_CONSTANTS.LANG_ID)) $$.libsession.set($$.MONKSHU_CONSTANTS.LANG_ID, "en");
	
	// setup permissions and roles
	$$.libsecurityguard.setPermissionsMap(APP_CONSTANTS.PERMISSIONS_MAP);
	$$.libsecurityguard.setCurrentRole($$.libsecurityguard.getCurrentRole() || APP_CONSTANTS.GUEST_ROLE);

	// register backend API keys
	apiman.registerAPIKeys(APP_CONSTANTS.API_KEYS, APP_CONSTANTS.KEY_HEADER); 	

	// setup debug mode for the framework
	if (APP_CONSTANTS.INSECURE_DEVELOPMENT_MODE) $$.MONKSHU_CONSTANTS.setDebugLevel($$.MONKSHU_CONSTANTS.DEBUG_LEVELS.refreshOnReload);

	// setup remote logging
	/*const API_GETREMOTELOG = APP_CONSTANTS.API_PATH+"/getremotelog", API_REMOTELOG = APP_CONSTANTS.API_PATH+"/log";
	let remoteLogResponse = false; try {remoteLogResponse = await apiman.rest(API_GETREMOTELOG, "GET")} catch (err) {};
	const remoteLogFlag = remoteLogResponse?remoteLogResponse.remote_log:false;
	LOG.setRemote(false, API_REMOTELOG);*/
}

const main = async _ => {
	await _addPageLoadInterceptors(); await _registerComponents();

	const decodedURL = new URL($$.librouter.decodeURL(window.location.href)), 
		justURL = new URL(`${decodedURL.protocol}//${decodedURL.hostname}${decodedURL.pathname}`).href;
	if ($$.libsecurityguard.isAllowed(justURL)) $$.librouter.loadPage(decodedURL.href);
	else $$.librouter.loadPage(APP_CONSTANTS.LOGIN_HTML);
}

const interceptPageLoadData = _ => $$.librouter.addOnLoadPageData("*", async (data, _url) => {
	data.APP_CONSTANTS = APP_CONSTANTS; 
	data["APP_ENV"] = _ => (key, render) => $$.libutils.getObjProperty(APP_CONSTANTS.ENV, render(key));
});

async function _readConfig() {
	const conf = await $$.requireJSON(`${APP_CONSTANTS.CONF_PATH}/app.json`);
	for (const key of Object.keys(conf)) APP_CONSTANTS[key] = conf[key];
}

const _registerComponents = async _ => { for (const component of APP_CONSTANTS.COMPONENTS) 
	await import(`${APP_CONSTANTS.APP_PATH}/${component}/${component.substring(component.lastIndexOf("/")+1)}.mjs`); }

async function _addPageLoadInterceptors() {
	const interceptors = await $$.requireJSON(`${APP_CONSTANTS.CONF_PATH}/pageLoadInterceptors.json`);
	for (const interceptor of interceptors) {
		const modulePath = interceptor.module, functionName = interceptor.function;
		let module = await import(`${APP_CONSTANTS.APP_PATH}/${modulePath}`); module = module[Object.keys(module)[0]];
		(module[functionName])();
	}
}

export const application = {init, main, interceptPageLoadData};