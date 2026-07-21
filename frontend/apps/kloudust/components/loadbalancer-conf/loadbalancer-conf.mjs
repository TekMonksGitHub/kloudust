/* 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed license file.
 */
import {util} from "/framework/js/util.mjs";
import {monkshu_component} from "/framework/js/monkshu_component.mjs";

const COMPONENT_PATH = util.getModulePath(import.meta);

function elementConnected(host) {
	Object.defineProperty(host, "value", {
		get: _ => _getValue(host), 
		set: value => _setValue(value, host)
	});
	const style = host.getAttribute("style") || "";
	const value = host.getAttribute("value") || "";
    let data_vnets = [];
    try {
        const parsed = JSON.parse(value);
        if (parsed.vnets) data_vnets = parsed.vnets;
    } catch(e){}
	const data = {style_start: "<style>", style_end: "</style>", style, vnets: data_vnets};
	loadbalancer_conf.setDataByHost(host, data);
}

function elementRendered(host) {
	const shadowRoot = loadbalancer_conf.getShadowRootByHost(host);
	_addFirstVnetRow(shadowRoot);
	_addFirstBackendRow(shadowRoot);
    _setupVnetListeners(shadowRoot);
}

function _setupVnetListeners(shadowRoot) {
    const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
    vnetsContainer.addEventListener("change", _ => _updateFEVnetOptions(shadowRoot));
    vnetsContainer.addEventListener("input", _ => _updateFEVnetOptions(shadowRoot));
}

function _updateFEVnetOptions(shadowRoot) {
    const feVnetSelect = shadowRoot.querySelector("#fe_vnet");
    const currentSelected = feVnetSelect.value;

    feVnetSelect.innerHTML = '<option value="">VIP VNet</option>';

    const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
    const allRows = vnetsContainer.querySelectorAll("span#vnetrow");
    const seen = new Set();
    for (const row of allRows) {
        const vnetVal = row.querySelector("#vnet").value;
        const ipVal = row.querySelector("#ip").value;
        if (vnetVal && !seen.has(vnetVal)) {
            seen.add(vnetVal);
            const opt = document.createElement("option");
            opt.value = vnetVal;
            opt.text = vnetVal === "PUBLIC_VNET" ? "Public Vnet" : vnetVal;
            opt.dataset.ip = ipVal;
            if (vnetVal === currentSelected) {
                opt.selected = true;
            }
            feVnetSelect.appendChild(opt);
        }
    }

    const selectedOpt = feVnetSelect.options[feVnetSelect.selectedIndex];
    const feIpInput = shadowRoot.querySelector("#fe_ip");
    if (selectedOpt && selectedOpt.dataset.ip) {
        feIpInput.value = selectedOpt.dataset.ip;
    } else {
        feIpInput.value = "";
    }
}

function feVnetChanged(selectElement) {
    const shadowRoot = loadbalancer_conf.getShadowRootByContainedElement(selectElement);
    const selectedOpt = selectElement.options[selectElement.selectedIndex];
    const feIpInput = shadowRoot.querySelector("#fe_ip");
    if (selectedOpt && selectedOpt.dataset.ip) {
        feIpInput.value = selectedOpt.dataset.ip;
    } else {
        feIpInput.value = "";
    }
}

function addVnetRow(callingRow) {
	const shadowRoot = loadbalancer_conf.getShadowRootByContainedElement(callingRow);
	const templateRow = shadowRoot.querySelector("template#vnetrowtemplate");
	const nodesToInject = templateRow.content.cloneNode(true);
	if (callingRow.nextSibling) callingRow.parentNode.insertBefore(nodesToInject, callingRow.nextSibling);
	else callingRow.parentNode.appendChild(nodesToInject);
    _updateFEVnetOptions(shadowRoot);
    _refreshVnetOptions(shadowRoot);
}

function removeVnetRow(callingRow) {
	const shadowRoot = loadbalancer_conf.getShadowRootByContainedElement(callingRow);
	const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
	callingRow.remove();
	const allRows = vnetsContainer.querySelectorAll("span#vnetrow");
	if (!allRows.length) _addFirstVnetRow(shadowRoot);
    _updateFEVnetOptions(shadowRoot);
}

function addBackendRow(callingRow) {
	const shadowRoot = loadbalancer_conf.getShadowRootByContainedElement(callingRow);
	const templateRow = shadowRoot.querySelector("template#backendrowtemplate");
	const nodesToInject = templateRow.content.cloneNode(true);
	if (callingRow.nextSibling) callingRow.parentNode.insertBefore(nodesToInject, callingRow.nextSibling);
	else callingRow.parentNode.appendChild(nodesToInject);
}

function removeBackendRow(callingRow) {
	const shadowRoot = loadbalancer_conf.getShadowRootByContainedElement(callingRow);
	const backendsContainer = shadowRoot.querySelector("div#backendscontainer");
	callingRow.remove();
	const allRows = backendsContainer.querySelectorAll("span#backendrow");
	if (!allRows.length) _addFirstBackendRow(shadowRoot);
}

function _addFirstVnetRow(shadowRoot) {
	const templateRow = shadowRoot.querySelector("template#vnetrowtemplate");
	const nodesToInject = templateRow.content.cloneNode(true);
	const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
	vnetsContainer.appendChild(nodesToInject);
}

function _addFirstBackendRow(shadowRoot) {
	const templateRow = shadowRoot.querySelector("template#backendrowtemplate");
	const nodesToInject = templateRow.content.cloneNode(true);
	const backendsContainer = shadowRoot.querySelector("div#backendscontainer");
	backendsContainer.appendChild(nodesToInject);
}

function _getValue(host) {
	const shadowRoot = loadbalancer_conf.getShadowRootByHost(host);
	
    const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
    const vnetRows = vnetsContainer.querySelectorAll("span#vnetrow");
    const vnets = [];
    for (const row of vnetRows) {
        const vnetVal = row.querySelector("#vnet").value;
        const ipVal = row.querySelector("#ip").value;
        if (vnetVal && ipVal) {
            vnets.push({vnet: vnetVal, ip: ipVal});
        }
    }

    const feVnet = shadowRoot.querySelector("#fe_vnet").value;
    const feIp = shadowRoot.querySelector("#fe_ip").value;
    const fePort = parseInt(shadowRoot.querySelector("#fe_port").value);
    const feProtocol = shadowRoot.querySelector("#fe_protocol").value;
    const feScheduler = shadowRoot.querySelector("#fe_scheduler").value;

    const backendsContainer = shadowRoot.querySelector("div#backendscontainer");
    const backendRows = backendsContainer.querySelectorAll("span#backendrow");
    const backends = [];
    for (const row of backendRows) {
        const ipVal = row.querySelector("#ip").value;
        const portVal = parseInt(row.querySelector("#port").value);
        const weightVal = parseInt(row.querySelector("#weight").value);
        if (ipVal) {
            backends.push({ ip: ipVal, port: isNaN(portVal) ? null : portVal, weight: isNaN(weightVal) ? 1 : weightVal});
        }
    }

    return { vnets, frontend: { vnet: feVnet, ip: feIp, port: isNaN(fePort) ? 80 : fePort, protocol: feProtocol, scheduler: feScheduler }, backends };
}

function _setValue(value, host) {
    if (!value) return;
    const data = typeof value === "string" ? JSON.parse(value) : value;
	const shadowRoot = loadbalancer_conf.getShadowRootByHost(host);

	const vnetTemplate = shadowRoot.querySelector("template#vnetrowtemplate");
	const vnetsContainer = shadowRoot.querySelector("div#vnetscontainer");
    vnetsContainer.innerHTML = "";
    if (data.vnets && data.vnets.length) {
        for (const v of data.vnets) {
            const nodes = vnetTemplate.content.cloneNode(true);
            nodes.querySelector("#vnet").value = v.vnet;
            nodes.querySelector("#ip").value = v.ip;
            vnetsContainer.appendChild(nodes);
        }
    } else {
        _addFirstVnetRow(shadowRoot);
    }

    _updateFEVnetOptions(shadowRoot);

    if (data.frontend) {
        shadowRoot.querySelector("#fe_vnet").value = data.frontend.vnet || "";
        _updateFEVnetOptions(shadowRoot);
        shadowRoot.querySelector("#fe_ip").value = data.frontend.ip || "";
        shadowRoot.querySelector("#fe_port").value = data.frontend.port || "";
        shadowRoot.querySelector("#fe_protocol").value = data.frontend.protocol || "tcp";
        shadowRoot.querySelector("#fe_scheduler").value = data.frontend.scheduler || "rr";
    }

	const backendTemplate = shadowRoot.querySelector("template#backendrowtemplate");
	const backendsContainer = shadowRoot.querySelector("div#backendscontainer");
    backendsContainer.innerHTML = "";
    if (data.backends && data.backends.length) {
        for (const b of data.backends) {
            const nodes = backendTemplate.content.cloneNode(true);
            nodes.querySelector("#ip").value = b.ip;
            nodes.querySelector("#port").value = b.port || "";
            nodes.querySelector("#weight").value = b.weight || 1;
            backendsContainer.appendChild(nodes);
        }
    } else {
        _addFirstBackendRow(shadowRoot);
    }
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
            if (vnet.value === current || !selected.has(vnet.value)) {
                const opt = document.createElement("option");
                opt.value = vnet.value;
                opt.text = vnet.name;
                if (vnet.value === current) opt.selected = true;
                select.appendChild(opt);
            }
        }
    }
}

function handleVnetChange(callingRow) {
    const shadowRoot = loadbalancer_conf.getShadowRootByContainedElement(callingRow);
    const ipField = callingRow.querySelector("#ip");
    const vnetSelect = callingRow.querySelector("#vnet");
    if (vnetSelect.value === "PUBLIC_VNET") {
        ipField.value = "AUTO_SELECTED";
        ipField.disabled = true;
    } else {
        ipField.disabled = false;
        ipField.value = "";
    }
    _refreshVnetOptions(shadowRoot)
}

export const loadbalancer_conf = { trueWebComponentMode: true, elementConnected, elementRendered, addVnetRow, removeVnetRow, addBackendRow, removeBackendRow, feVnetChanged, handleVnetChange };
monkshu_component.register("loadbalancer-conf", `${COMPONENT_PATH}/loadbalancer-conf.html`, loadbalancer_conf);
