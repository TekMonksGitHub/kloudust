/** 
 * Main entry point into Kloudust.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
if (!global.KLOUD_CONSTANTS) global.KLOUD_CONSTANTS = require(`${__dirname}/lib/constants.js`);

const utils = require(`${KLOUD_CONSTANTS.LIBDIR}/utils.js`);
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const processargs = require(`${KLOUD_CONSTANTS.MONKSHU_BACKEND_LIBDIR}/processargs.js`);

const CMD_LINE_ARGS = { "__description": "Kloudust - (C) TekMonks\nHybrid Cloud Platform.",
    "k": {long: "color", required: false, help: "Colored console option."}, 
    "b": {long: "batch", required: true, help: "Batch command execution, each line is a new command."},
    "u": {long: "user", required: true, help: "User ID. The value is required if specified."},
    "p": {long: "password", required: true, help: "Password for the user. The value is required if user is specified."},
    "t": {long: "otp", required: true, help: "One time code for the user. The value is required if user is specified."},
    "j": {long: "project", required: true, help: "Project name. The value is required if specified."},
    "s": {long: "setup", required: false, help: "Running in setup mode. Only allowed from command line."},
    "e": {long: "execute", required: true, help: "Single command to execute. The value is required if specified."} };

let initComplete = false;   // init flag

/** Inits the Kloudust runtime. Can check for double initialization so safe to call multiple times. */
exports.initAsync = async _ => {
    if (initComplete) return; 
    for (const initModule of KLOUD_CONSTANTS.CONF.INIT_MODULES) {
        const module = require(KLOUD_CONSTANTS.ROOTDIR+"/"+initModule);
        await module.initAsync();
    }
    initComplete= true;
}

/**
 * Command line args are documented below. In process args is an object with
 * the long property name and it's value as the argument value.
 * 
 * Command line arguments
 * "k": {long: "color", required: false, help: "Colored console option."}, 
 * "b": {long: "batch", required: true, help: "Batch command execution, each line is a new command."},
 * "u": {long: "user", required: true, help: "User ID. The value is required if specified."},
 * "p": {long: "password", required: true, help: "Password for the user. The value is required if user is specified."},
 * "t": {long: "otp", required: true, help: "One time code for the user. The value is required if user is specified."},
 * "j": {long: "project", required: true, help: "Project name. The value is required if specified."},
 * "s": {long: "setup", required: false, help: "Running in setup mode. Only allowed from command line."},
 * "e": {long: "execute", required: true, help: "Single command to execute. The value is required if specified."}
 * 
 * In process example
 *  {"user": "id@email.com", "project": "project_id", "execute": "command_to_execute"}
 * 
 * @param {Object} inprocessArgs The in-process arguments object as documented above
 * @returns {result: true or false, out: the out stream concatenated, err: the error stream contatenated}
 */
exports.kloudust = async function(inprocessArgs) {
    const args = inprocessArgs||processargs.getArgs(CMD_LINE_ARGS);

    if (args.color) KLOUD_CONSTANTS.COLORED_OUT = true;

    await exports.initAsync(); // init Kloudust this is needed to login the user below

    const consoleHandler = _createConsoleHandler(args.consoleStreamHandler);

    if (!args.user) {_showHelpAndExit(consoleHandler); return {result: false, err: "", out: ""};}
    else if (!await exports.loginUser(args, consoleHandler)) return {result: false, err: "User login failed.", out: ""};

    if (args.batch) {
        consoleHandler.LOGBARE(CMD_LINE_ARGS.__description);

        const fileToExec = args.batch[0]
        consoleHandler.LOGINFO(`Starting batch file execution`);
        let out = "", err = "";
        for (const execLine of fileToExec.split(";")) {
            if (execLine.trim() == "" || execLine.trim().startsWith("#")) continue;    // skip empty or comment lines
            const results = await _execCommand(utils.parseArgs(execLine), consoleHandler, args.project); 
            out += `${results.out}\n`; err += `${results.err}\n`
            if (!results.result) {consoleHandler.EXITFAILED(); return {...CONSTANTS.FALSE_RESULT, out, err};}
        }

        consoleHandler.EXITOK(); return {...CONSTANTS.TRUE_RESULT, out, err};
    } else if (args.execute) {
        consoleHandler.LOGBARE(CMD_LINE_ARGS.__description);

        const results = await _execCommand(utils.parseArgs(args.execute[0]), consoleHandler, args.project);
        if (results.result) {consoleHandler.EXITOK(); return {...results, ...CONSTANTS.TRUE_RESULT};}
        else {consoleHandler.EXITFAILED(); return {...results, ...CONSTANTS.FALSE_RESULT};}
    } else {_showHelpAndExit(consoleHandler); return {...CONSTANTS.FALSE_RESULT, err: "", out: ""};} // nothing to do
}

exports.loginUser = async function(args, consoleHandler) {
    if (!args.user) { consoleHandler.LOGERROR(`User not authorized as user ID is missing."`); consoleHandler.EXITFAILED(); return false; }
    const asyncStore = args.getAsyncStore?args.getAsyncStore():{};

    const userObject = await dbAbstractor.loginUser(args.user[0], args.project?.[0]);
    if (!userObject) {  
        consoleHandler.LOGERROR(`User ${args.user[0]} not found in the cloud.`); 
        if (args.role?.[0] == KLOUD_CONSTANTS.LOGINAPP_ORG_ADMIN) { // if user is org admin, register the org and the user into the Kloudust DB
            const roleAssigned = await roleman.canBeSetupMode() ? KLOUD_CONSTANTS.ROLES.CLOUD_ADMIN : KLOUD_CONSTANTS.ROLES.ORG_ADMIN;
            _setupKloudustEnvironment(asyncStore, args.name[0], args.user[0], args.org[0], roleAssigned, args.project?.[0]);
            if (await _execCommand(["addUser", args.user[0], args.name[0], args.org[0], roleAssigned], consoleHandler)) {
                consoleHandler.LOGINFO(`User ${args.user[0]} from org ${args.org[0]} added to the cloud as ${roleAssigned}.`); 
                if (await _execCommand(["initOrg"], consoleHandler)) {
                    consoleHandler.LOGINFO(`Initiated ${args.org[0]} with user ${args.user[0]}.`);
                    return true;
                }
            } else consoleHandler.LOGERROR(`User ${args.user[0]} not found in the cloud and adding to Kloudust failed.`); 
        } else consoleHandler.LOGERROR(`User ${args.user[0]} not found in the cloud and not org admin, skipping.`); 
        consoleHandler.EXITFAILED(); return false; 
    }
    
    asyncStore.org = userObject.org;
    KLOUD_CONSTANTS.env.org = _=> asyncStore.org; // the project check below needs this
    const project_check = (userObject.role == KLOUD_CONSTANTS.ROLES.ORG_ADMIN || 
        userObject.role == KLOUD_CONSTANTS.ROLES.CLOUD_ADMIN) ? true : await dbAbstractor.checkUserBelongsToProject(email, project);  
    if (!project_check) {   // not part of this project  
        consoleHandler.LOGERROR(`User not authorized for the project ${args.project?.[0]||"undefined"}.`); 
        consoleHandler.EXITFAILED();
        return false;  
    }

    _setupKloudustEnvironment(asyncStore, userObject.name, userObject.id, userObject.org, userObject.role, args.project?.[0]);
    
    return true;
}

function _showHelpAndExit(consoleHandler) {
    consoleHandler.LOGBARE(processargs.helpInformation(CMD_LINE_ARGS), KLOUD_CONSTANTS.COLORS.red); 
    consoleHandler.EXITFAILED();
}

async function _execCommand(params, consoleHandler, project) {
    const command = params[0]; const cmdParams = params.slice(1); cmdParams.consoleHandlers = consoleHandler;
    if (!CMD_CONSTANTS.PROJECT_EXCLUDED_COMMANDS.includes(command) && (!project)) {
        consoleHandler.LOGERROR(`Error, project name is needed for this command.`); 
        return {result: false, out: "", err: "Missing project name."};
    }

    try {
        const requireFunction = CONSTANTS.LIBDIR ?  // try to load command modules in debug mode if available
            module => require(`${CONSTANTS.LIBDIR}/utils.js`).requireWithDebug(
                module, KLOUD_CONSTANTS.CONF.DEBUG_MODE) : module => require(module);
        const module = requireFunction(`${KLOUD_CONSTANTS.CMDDIR}/${command}.js`);
        const result = await module.exec(cmdParams);
        return result;
    } catch (err) {
        consoleHandler.LOGERROR(`${err.toString()}${err.stack?"\n"+err.stack:""}`); 
        return {result: false, out: "", err: err.toString()};
    }
}

function _setupKloudustEnvironment(asyncContextStore, name, id, org, role, project) {
    asyncContextStore.username = name; asyncContextStore.id = id; asyncContextStore.org = org;
    asyncContextStore.role = role; asyncContextStore.project = project; 

    KLOUD_CONSTANTS.env.username = _ => asyncContextStore.username;
    KLOUD_CONSTANTS.env.userid = _ => asyncContextStore.id.toLocaleLowerCase();
    KLOUD_CONSTANTS.env.org = _ => asyncContextStore.org;
    KLOUD_CONSTANTS.env.role = _ => asyncContextStore.role;
    KLOUD_CONSTANTS.env.prj = _ => asyncContextStore.project||KLOUD_CONSTANTS.DEFAULT_PROJECT;
}

function _createConsoleHandler(consoleStreamHandler) {
    if (!consoleStreamHandler) {return {
        LOGERROR: s => KLOUD_CONSTANTS.LOGERROR(s), LOGWARN: s => KLOUD_CONSTANTS.LOGWARN(s), 
        LOGINFO: s => KLOUD_CONSTANTS.LOGINFO(s), LOGBARE: s => KLOUD_CONSTANTS.LOGBARE(s), 
        LOGEXEC: s => KLOUD_CONSTANTS.LOGEXEC(s), LOGUNAUTH: s => KLOUD_CONSTANTS.LOGUNAUTH(s),
        EXITOK: s => KLOUD_CONSTANTS.EXITOK(s), EXITFAILED: s => KLOUD_CONSTANTS.EXITFAILED(s)
    };} else {return {
        LOGERROR: err => consoleStreamHandler(undefined, undefined, err), 
        LOGWARN: warn => consoleStreamHandler(undefined, warn, undefined), 
        LOGINFO: info => consoleStreamHandler(info, undefined, undefined),
        LOGBARE: info => consoleStreamHandler(info, undefined, undefined), 
        LOGEXEC: exec => consoleStreamHandler(`[EXEC] ${exec}`, undefined, undefined), 
        LOGUNAUTH: _ => consoleStreamHandler(undefined, undefined, KLOUD_CONSTANTS.UNAUTH_MSG),
        EXITOK: _ => consoleStreamHandler(KLOUD_CONSTANTS.SUCCESS_MSG, undefined, undefined), 
        EXITFAILED: _ => consoleStreamHandler(undefined, undefined, KLOUD_CONSTANTS.FAILED_MSG)
    };}
}
