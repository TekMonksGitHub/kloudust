/* 
 * (C) 2018 TekMonks. All rights reserved.
 * License: See enclosed license file.
 */
import {util} from "/framework/js/util.mjs";
import {monkshu_component} from "/framework/js/monkshu_component.mjs";

const COMPONENT_PATH = util.getModulePath(import.meta), INPUT_NODES = ["input", "select"];

function elementConnected(host) {
	Object.defineProperty(host, "value", {get: _=>JSON.stringify(_getValue(host)), 
		set: value=>_setValue(JSON.parse(value), host)});
	const style = host.getAttribute("style")||"";
	const value = host.getAttribute("value")||"";
	const vnets = value.trim() === "" ? [] : JSON.parse(value);
	const data = {style_start: "<style>", style_end: "</style>", style, vnets};
	vnet_ip.setDataByHost(host, data);
}

function elementRendered(host) {
	const shadowRoot = vnet_ip.getShadowRootByHost(host);
	_addFirstVnetIPRow(shadowRoot);
	_refreshVnetOptions(shadowRoot);
}

function addRow(callingRow) {
	const shadowRoot = vnet_ip.getShadowRootByContainedElement(callingRow);
	const templateRow = shadowRoot.querySelector("template#vnetsrowtemplate");
	const nodesToInject = templateRow.content.cloneNode(true);
	if (callingRow.nextSibling) callingRow.parentNode.insertBefore(nodesToInject, callingRow.nextSibling);
	else callingRow.parentNode.appendChild(nodesToInject);
	console.debug(JSON.stringify(_getValue(vnet_ip.getHostElementByContainedElement(callingRow))));
	_refreshVnetOptions(shadowRoot);
}

function removeRow(callingRow) {
	const shadowRoot = vnet_ip.getShadowRootByContainedElement(callingRow);
	const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
	callingRow.remove();
	const allRows = vnetsContainer.querySelectorAll("span#vnetsrow");
	if (!allRows.length) _addFirstVnetIPRow(shadowRoot);
	_refreshVnetOptions(shadowRoot);
}

function _getValue(host) {
	const shadowRoot = vnet_ip.getShadowRootByHost(host);
	const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
	const allRows = vnetsContainer.querySelectorAll("span#vnetsrow");
	const vnets = []; for (const row of allRows) {
		const objectRow = {}; for (const childNode of row.childNodes) {
			if (INPUT_NODES.includes(childNode.nodeName.toLowerCase())) {
				if (childNode.value.trim() != '') objectRow[childNode.id] = childNode.value;
				else objectRow.skip = true;
			}
		}
		if (!objectRow.skip) vnets.push(objectRow);
	}
	return vnets;
}

function _setValue(vnets, host) {
	const shadowRoot = vnet_ip.getShadowRootByHost(host);
	const templateRow = shadowRoot.querySelector("template#vnetsrowtemplate");
	const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
	for (const vnet of vnets) {
		const nodesToInject = templateRow.content.cloneNode(true);
		for (const [key, value] of Object.entries(vnet)) nodesToInject.querySelector(`#${key}`).value = value;
		vnetsContainer.appendChild(nodesToInject);
	}
	_refreshVnetOptions(shadowRoot);
}

function _addFirstVnetIPRow(shadowRoot) {
	const templateRow = shadowRoot.querySelector("template#vnetsrowtemplate");
	const nodesToInject = templateRow.content.cloneNode(true);
	const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
	vnetsContainer.appendChild(nodesToInject);
}

function _getAvailableVnets(shadowRoot) {
    const host = shadowRoot.host;
    const value = host.getAttribute("value") || "";
    return value.trim() === "" ? [] : JSON.parse(value);
}

function _refreshVnetOptions(shadowRoot) {
    const allVnets = _getAvailableVnets(shadowRoot);
    const selects = [...shadowRoot.querySelectorAll("select#vnet")];
    const selected = new Set(selects.map(s => s.value).filter(v => v));
    for (const select of selects) {
        const current = select.value;
        select.innerHTML = '<option value="">Select VNet</option>';
        for (const vnet of allVnets.vnets) {
            if (vnet === current || !selected.has(vnet)) {
                const opt = document.createElement("option");
                opt.value = vnet;
                opt.text = vnet;
                if (vnet === current) opt.selected = true;
                select.appendChild(opt);
            }
        }
    }
}

export const vnet_ip = {trueWebComponentMode: true, elementConnected, elementRendered, addRow, removeRow}
monkshu_component.register("vnet-ip", `${COMPONENT_PATH}/vnet-ip.html`, vnet_ip);
