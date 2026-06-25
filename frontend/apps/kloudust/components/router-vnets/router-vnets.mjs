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
	router_vnets.setDataByHost(host, data);
}

function elementRendered(host) {
	const shadowRoot = router_vnets.getShadowRootByHost(host);
	_addFirstRouterVnetRow(shadowRoot);
}

function addRow(callingRow) {
	const shadowRoot = router_vnets.getShadowRootByContainedElement(callingRow);
	const templateRow = shadowRoot.querySelector("template#vnetsrowtemplate");
	const nodesToInject = templateRow.content.cloneNode(true);
	if (callingRow.nextSibling) callingRow.parentNode.insertBefore(nodesToInject, callingRow.nextSibling);
	else callingRow.parentNode.appendChild(nodesToInject);
	console.debug(JSON.stringify(_getValue(router_vnets.getHostElementByContainedElement(callingRow))));
}

function removeRow(callingRow) {
	const shadowRoot = router_vnets.getShadowRootByContainedElement(callingRow);
	const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
	callingRow.remove();
	const allRows = vnetsContainer.querySelectorAll("span#vnetsrow");
	if (!allRows.length) _addFirstRouterVnetRow(shadowRoot);
}

function _getValue(host) {
	const shadowRoot = router_vnets.getShadowRootByHost(host);
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
	const shadowRoot = router_vnets.getShadowRootByHost(host);
	const templateRow = shadowRoot.querySelector("template#vnetsrowtemplate");
	const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
	for (const vnet of vnets) {
		const nodesToInject = templateRow.content.cloneNode(true);
		for (const [key, value] of Object.entries(vnet)) nodesToInject.querySelector(`#${key}`).value = value;
		vnetsContainer.appendChild(nodesToInject);
	}
}

function _addFirstRouterVnetRow(shadowRoot) {
	const templateRow = shadowRoot.querySelector("template#vnetsrowtemplate");
	const nodesToInject = templateRow.content.cloneNode(true);
	const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
	vnetsContainer.appendChild(nodesToInject);
}

export const router_vnets = {trueWebComponentMode: true, elementConnected, elementRendered, addRow, removeRow}
monkshu_component.register("router-vnets", `${COMPONENT_PATH}/router-vnets.html`, router_vnets);
