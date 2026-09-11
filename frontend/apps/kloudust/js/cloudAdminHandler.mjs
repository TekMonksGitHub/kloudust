/**
 * Application-level handler for cloudAdmin.
 *
 * Centralizes request data that must be added to every Kloudust command API
 * call, without requiring each form to implement the same logic.
 */

const REST_WRAPPED_FLAG = "__kloudust_override_org_rest_wrapped__";

const _isCloudAdmin = _ => $$.libsession.get(APP_CONSTANTS.LOGGEDIN_USEROLE) == APP_CONSTANTS.KLOUDUST_ROLES.cloudadmin;
const _getOverrideOrg = _ => _isCloudAdmin() ? $$.libsession.get(APP_CONSTANTS.USERORG) : undefined;
const _isKloudustCommandAPI = url => url == APP_CONSTANTS.API_KLOUDUSTCMD;

const _addOverrideOrg = request => {
    const overrideOrg = _getOverrideOrg();
    return overrideOrg ? {...(request||{}), override_org: overrideOrg} : request;
};

/**
 * Wraps the framework API manager so all Kloudust command requests carry the
 * selected cloud-admin organization. Other APIs and non-cloud-admin requests
 * are left unchanged.
 */
const installKloudustAPIHelper = _ => {
    const managers = [window.monkshu_env?.frameworklibs?.apimanager, 
        $$.libapimanager].filter((manager, index, all) => manager && all.indexOf(manager) == index);

    for (const manager of managers) {
        if (manager[REST_WRAPPED_FLAG] || typeof manager.rest != "function") continue;
        const originalRest = manager.rest.bind(manager);
        manager.rest = (...args) => {
            const requestURL = typeof args[0] == "string" ? args[0] : args[0]?.url;
            if (!_isKloudustCommandAPI(requestURL)) return originalRest(...args);

            if (typeof args[0] == "object") args[0] = {...args[0], req: _addOverrideOrg(args[0].req)};
            else args[2] = _addOverrideOrg(args[2]);
            return originalRest(...args);
        }; manager[REST_WRAPPED_FLAG] = true;
    }
};

export const cloudAdminHandler = {installKloudustAPIHelper};
