/**
 * Interprets and runs table list files. Renders the
 * UI for the tables. This component is a table UI generator
 * basically.
 * 
 * tabledef attribute contains the table as a Base64 JSON. It can
 * have second level mustache using {{{mustache_start}}} and {{{mustache_end}}}
 * to wrap the second level templates.
 * 
 * Each tabledef should either contain a static table as a table object or
 * have its load_javascript return such a table. The structure of this object is
 * { keys: [list of keys whose value will be combined with the i18nPrefix to generate header titles], 
 *   table: [array of objects in {key (same as keys above): value} pairs] }
 * 
 * Each row's data is sent back when the row is clicked. This data is the row object
 * in the table array above corresponding to that row. Then the onclickrow_html is shown
 * when the row is clicked and clickrow_javascript is ran once the HTML has been shown.
 * 
 * In case of VMs form for example, onclickrow_html style is static, then an iconlist is
 * used to generate HTML to display the icons and added to onclickrow_html during its 
 * load_javascript method. So when row is clicked the icons are shown and clicking them 
 * opens the command (as that's what iconlist does).
 * 
 * Then the clickrow_javascript sets the VM's _vms_form_data inside APP_CONSTANTS.ENV._vms_form_data
 * which is then used inside the VM's resize, etc forms to hard code the VM name when the operation
 * is called in such a manner, pinning the VM for that operation.
 *  
 * (C) 2023 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const COMPONENT_PATH = $$.libutil.getModulePath(import.meta);

const i18n = {
    "en": {ClickToCopy: "Shift+click to copy", Copied: "Copied"},
    "hi": {ClickToCopy: "Shift+click to copy", Copied: "Copied"},
    "ja": {ClickToCopy: "Shift+click to copy", Copied: "Copied"},
    "zh": {ClickToCopy: "Shift+click to copy", Copied: "Copied"}
}

async function elementConnected(host) {
    const tableDefinition = $$.libutil.base64ToString(host.dataset.tabledef);
    const expandedData = await $$.librouter.expandPageData(tableDefinition, undefined, {mustache_start: "{{{", mustache_end: "}}}"});
    let tableObject = JSON.parse(expandedData);
    if (tableObject.style) tableObject.style = _getArrayAsJoinedString(tableObject.style);
    const tableData = await _runOnLoadJavascript(tableObject);
    table_list.setDataByHost(host, {...tableObject, ...tableData});
    for (const lang of Object.keys(i18n)) await $$.libi18n.setI18NObject(lang, i18n[lang]);
}

async function close(element) {
    const onclose = await table_list.getAttrValue(table_list.getHostElement(element), "onclose");
    if (onclose && onclose.trim() != "") new Function(onclose)();
}

async function hidePopup(event) {
    const shadowRoot = table_list.getShadowRootByContainedElement(event.target);
    const divOnclick = shadowRoot.querySelector("div#onclick_html"), divHider = shadowRoot.querySelector("div#hider");
    divOnclick.classList.remove("visible"); divHider.classList.remove("visible");
}

async function rowClicked(event, rowdataJSON) {
    const rowDataJSON = rowdataJSON?$$.libutil.base64ToString(rowdataJSON):undefined, rowData = JSON.parse(rowDataJSON||"{}");
    await _displayRowOnClickHTML(event, rowData);
    _runRowOnClickJavascript(event, rowData);
}

async function _displayRowOnClickHTML(event, rowData) {
    const containedElement = event.target, host = table_list.getHostElement(containedElement);
    const data = table_list.getDataByHost(host); let onclickHTML = _getArrayAsJoinedString(data.onclickrow_html);
    if (onclickHTML == "") return; onclickHTML = (await $$.librouter.getMustache()).render(onclickHTML, rowData);
    const wrapper = document.createElement("div"); wrapper.id="onclickrow_html"; wrapper.append(...$$.libutil.htmlToDOMNodes(onclickHTML));

    const shadowRoot = table_list.getShadowRootByContainedElement(containedElement);
    const divOnclick = shadowRoot.querySelector("div#onclick_html"), divHider = shadowRoot.querySelector("div#hider");
    divOnclick.replaceChildren(wrapper); const emHeight = parseFloat(getComputedStyle(divOnclick).fontSize), popupEmHeight = 4*emHeight;
    const yCalc = event.y+10+popupEmHeight >= window.innerHeight ? window.innerHeight - popupEmHeight + 5 : event.y+10; 
    divOnclick.style.top = yCalc; divHider.classList.add("visible"); divOnclick.classList.add("visible");
}

async function _runRowOnClickJavascript(event, rowData) {
    const tableObject = table_list.getDataByContainedElement(event.target);
    if (!tableObject.clickrow_javascript) return;
    const onclickjs = _getArrayAsJoinedString(tableObject.clickrow_javascript);
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    await (new AsyncFunction(onclickjs))(rowData, tableObject);
}

async function _runOnLoadJavascript(tabledef) {
    if (!tabledef.load_javascript) return tabledef.table||{};
    const onloadjs = _getArrayAsJoinedString(tabledef.load_javascript);

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const load_js_result = await (new AsyncFunction(onloadjs))(tabledef);
    if (!load_js_result) {
        LOG.error(`Form load JS failed`);
        return {};
    } 

    const tableObject = {headers: [], rows: []};
    for (const key of load_js_result.keys) 
        tableObject.headers.push(await $$.libi18n.get(`${tabledef.i18nPrefix}_${key}`));
    for (const row of load_js_result.table) {
        const rowData = []; for (const key of load_js_result.keys) rowData.push(row[key]||"");
        rowData.rowdata_json_base64 = $$.libutil.stringToBase64(JSON.stringify(row)); tableObject.rows.push(rowData);
    }
    return tableObject;
}

const _getArrayAsJoinedString = (array, skipEOLs) => array?(Array.isArray(array)?array:[array]).join(skipEOLs?"":"\n"):"";

export const table_list = {trueWebComponentMode: true, elementConnected, close, rowClicked, hidePopup};
$$.libmonkshu_component.register("table-list", `${COMPONENT_PATH}/table-list.html`, table_list);