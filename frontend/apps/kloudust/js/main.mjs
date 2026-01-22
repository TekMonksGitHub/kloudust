/**
 * Post login main page support. 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed license.txt file.
 */

import {cmdlist} from "./cmdlist.mjs";
import {cmdmanager as cmdman} from "./cmdmanager.mjs";

const LEFTBAR_COMMANDS = `${APP_CONSTANTS.FORMS_PATH}/main_leftbar.json`, 
    MAIN_COMMANDS = `${APP_CONSTANTS.FORMS_PATH}/main_content.json`;

let _hostingDiv, _initialContentTemplate, _closingClass, _animationWait;

/**
 * Registers the hosting DIV which will host all content
 * @param {element} div The hosting DIV
 * @param {element} initialContentTemplate HTML5 template element hosting initial content
 * @param {string} closingClass Optional: The class to add when closing (useful for effects)
 * @param {number} animationWait Optional: The wait time for the animation (useful for effects)
 */
function registerHostingDivAndInitialContentTemplate(div, initialContentTemplate, closingClass, animationWait=0) {
    _hostingDiv = div; _initialContentTemplate = initialContentTemplate; _closingClass = closingClass; _animationWait = animationWait;
}

/**
 * Shows the given content. Must be either HTML string or
 * a DOM subtree of nodes. If no content given then same as 
 * hiding and going back to home content.
 * @param {string|Object} contentNode The content to show
 * @param {boolean} disableAnimation Whether to disable animation, default is false
 */
function showContent(contentNode, disableAnimation=false) { 
    if (!_hostingDiv) {LOG.error(`Asked to show content but no hosting DIV is registered`); return;}
    if (_closingClass && (!disableAnimation)) _hostingDiv.classList.add(_closingClass);
    const _refreshWithNewContent = _ => {
        $$.libutil.removeAllChildElements(_hostingDiv); 
        const content = contentNode ? (typeof contentNode === "string" ? _getHTMLNodesToInsert(contentNode) : contentNode) : 
            _initialContentTemplate.content.cloneNode(true);
        _hostingDiv.appendChild(content);
        if (_closingClass && (!disableAnimation)) _hostingDiv.classList.remove(_closingClass);
    }
    if (_animationWait && (!disableAnimation)) setTimeout(_refreshWithNewContent, _animationWait); else _refreshWithNewContent();
}

/**
 * Hides open content
 * @param {boolean} disableAnimation Whether to disable animation, default is false
 */
function hideOpenContent(disableAnimation) {showContent(undefined, disableAnimation);}

/** Plugs in our data interceptor which loads initial main and leftbar contents */
const interceptPageLoadData = _ => $$.librouter.addOnLoadPageData(APP_CONSTANTS.MAIN_HTML, async (data, _url) => {
    const mustache = await $$.librouter.getMustache(), mainPageData = {};
    mainPageData.welcomeHeading = mustache.render(await $$.libi18n.get("WelcomeHeading"), {user: $$.libsession.get(APP_CONSTANTS.USERNAME)});
	mainPageData.leftbarCommands = await cmdlist.fetchCommands(LEFTBAR_COMMANDS); 
    mainPageData.mainCommands = await cmdlist.fetchCommands(MAIN_COMMANDS);
    const projectsLookupResult = await window.monkshu_env.frameworklibs.apimanager.rest(APP_CONSTANTS.API_KLOUDUSTCMD, 
        'POST', {cmd: 'getUserProjects'}, true);
    mainPageData.userprojects = projectsLookupResult?projectsLookupResult.projects:[];

    const selectedProject = $$.libsession.get(APP_CONSTANTS.ACTIVE_PROJECT) || mainPageData.userprojects[0]?.name;
    const selectProjectIndex = mainPageData.userprojects.findIndex(prj=>prj.name==selectedProject);
    mainPageData.userprojects[selectProjectIndex].selected = true;
    $$.libsession.set(APP_CONSTANTS.ACTIVE_PROJECT, selectedProject);

    data.mainPageData = mainPageData;
    
    for (const cmd of [...mainPageData.leftbarCommands, ...mainPageData.mainCommands]) try{
        cmdman.registerCommand(cmd); } catch (err) {LOG.error(`Error registering command ${cmd.id}.`);}
});

function activeProjectChanged(new_project) {
    $$.libsession.set(APP_CONSTANTS.ACTIVE_PROJECT, new_project);
}

function _getHTMLNodesToInsert(htmlContent) {
    const wrapper = document.createElement("div"); wrapper.innerHTML = htmlContent;
    return wrapper;
}

export const main = {interceptPageLoadData, registerHostingDivAndInitialContentTemplate, showContent,
    cmdClicked: (_element, id) => cmdman.cmdClicked(id), hideOpenContent, activeProjectChanged};
