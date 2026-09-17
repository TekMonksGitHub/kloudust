/** 
 * createOrUpdateLoadBalancer.js - Creates or updates an IPVS load balancer.
 * 
 * Params - 0 - Load Balancer Name, 1 - Description, 2 - JSON string settings, 3 - Update flag
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const crypto = require('crypto');
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const vnetModule = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const { xforge } = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const deleteLoadBalancer = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/deleteLoadBalancer.js`);
const getLoadBalancer = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/getLoadBalancer.js`);

/**
 * Creates or updates a load balancer
 * @param {array} params The incoming params.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH();  return CMD_CONSTANTS.FALSE_RESULT(); }
    const [lb_name_raw, lb_description, lb_settings_str, update] = [...params];
    const lb_name = exports.resolveLoadBalancerName(lb_name_raw);
    const lb_settings = JSON.parse(lb_settings_str);
    const vnets = lb_settings.vnets;
    const frontend = lb_settings.frontend;
    const backends = lb_settings.backends;

    const backboneVnet = createVnet.getInternetBackboneVnet();
    for (const v of vnets) { if (v.vnet === "PUBLIC_VNET") { v.vnet = backboneVnet; v.defaultGateway = "true"; }}
    if (frontend.vnet === "PUBLIC_VNET") frontend.vnet = backboneVnet;

    const getLBParams = [lb_name_raw]; getLBParams.consoleHandlers = params.consoleHandlers;
    const lbExists = await getLoadBalancer.exec(getLBParams);

    if (lbExists?.result && update !== "true") {
        params.consoleHandlers.LOGERROR(`A load balancer with the name ${lb_name} already exists. Aborting.`);
        return CMD_CONSTANTS.FALSE_RESULT(`Failed to create load balancer. A load balancer with the name ${lb_name} already exists.`);
    }

    let existingBackboneIP = null;
    if (lbExists?.loadbalancer?.vnet_ips) {
        const matchingVnet = lbExists.loadbalancer.vnet_ips.find(v => vnetModule.resolveVnetName(v.vnet) === vnetModule.resolveVnetName(backboneVnet));
        if (matchingVnet) existingBackboneIP = matchingVnet.ip;
    }

    for (const v of vnets) if (v.ip === "AUTO_SELECTED" && existingBackboneIP) v.ip = existingBackboneIP;
    if (frontend.ip === "AUTO_SELECTED" && existingBackboneIP) frontend.ip = existingBackboneIP;

    const createKey = ({ vnet, ip }) => JSON.stringify([vnet, ip]);
    const currentConfig = new Map();
    if (lbExists?.loadbalancer?.vnet_ips) {
        for (const v of lbExists.loadbalancer.vnet_ips) currentConfig.set(createKey(v), v);
    }

    const newConfig = new Map();
    for (const vnet of vnets) newConfig.set(createKey(vnet), vnet);

    const vnetAdditions = [];
    for(const vnet of newConfig.values()) vnetAdditions.push({ ...vnet, op: "add" });

    const vnetDeletions = [];
    for(const [key, vnet] of currentConfig) { if(!newConfig.has(key)) vnetDeletions.push({ ...vnet, op: "del" }); }
    
    const finalVnet = [...vnetDeletions, ...vnetAdditions];

    const vnet_infos = [];
    for (const vnet of finalVnet) {
        const vnet_details = await dbAbstractor.getVnet(vnetModule.resolveVnetName(vnet.vnet));
        if (!vnet_details) {
            params.consoleHandlers.LOGERROR(`One or more VNets do not exist. Aborting creation.`);
            return CMD_CONSTANTS.FALSE_RESULT(`Failed to create load balancer. One or more VNets do not exist.`);
        }
        const vnet_name_hash = crypto.createHash('sha256').update(lb_name + vnet_details.name, 'utf8').digest('hex').slice(0, 12);
        vnet_infos.push({ ...vnet_details, gateway_address: vnet.ip, vnet_name_hash, op: vnet.op, defaultGateway: vnet.defaultGateway || "false" });
    }

    const host = await dbAbstractor.getHostWithVnets(vnet_infos.map(v => v.id));
    if (!host) {
        params.consoleHandlers.LOGERROR(`Cannot create load balancer in an empty vnet.`);
        return CMD_CONSTANTS.FALSE_RESULT(`Cannot create load balancer in an empty vnet.`);
    }

    let allocatedIP = null;
    for (const v of vnets) {
        if (v.ip === "AUTO_SELECTED") {
            let ipObject = await dbAbstractor.getAssignableIP(host.hostname) || await dbAbstractor.getAssignableIP();
            if (!ipObject) {
                params.consoleHandlers.LOGERROR("Could not find any assignable IPs");
                return CMD_CONSTANTS.FALSE_RESULT("Could not find any assignable IPs");
            }
            allocatedIP = ipObject.ip;
            v.ip = allocatedIP;
            await dbAbstractor.allocateIP(allocatedIP, lb_name);
        }
    }

    if (allocatedIP) {
        if (frontend.ip === "AUTO_SELECTED") frontend.ip = allocatedIP;
        for (const vnet of finalVnet) if (vnet.ip === "AUTO_SELECTED") vnet.ip = allocatedIP;
        for (const vnet of vnetAdditions) if (vnet.ip === "AUTO_SELECTED") vnet.ip = allocatedIP;
        for (const vnet_info of vnet_infos) if (vnet_info.gateway_address === "AUTO_SELECTED") vnet_info.gateway_address = allocatedIP;
    }

    const handleFailure = async (errorMessage, runLBDelete = false, doHostCleanup = false) => {
        if (allocatedIP) await dbAbstractor.unallocateIP(allocatedIP);
        if (runLBDelete && update !== "true") {
            const deleteParams = [lb_name_raw]; deleteParams.consoleHandlers = params.consoleHandlers;
            const cleanupResult = await deleteLoadBalancer.exec(deleteParams);
            if (!cleanupResult.result) params.consoleHandlers.LOGERROR(`Load balancer cleanup failed for ${lb_name} on host ${host.hostname}`);
        }
        if (doHostCleanup) {
            const cleanupResult = await deleteLoadBalancer.deleteLoadBalancerFromHost(lb_name, hostInfo, params.consoleHandlers);
            if (!cleanupResult.result) params.consoleHandlers.LOGERROR(`Load balancer host cleanup failed for ${lb_name} on host ${host.hostname}`);
        }
        params.consoleHandlers.LOGERROR(errorMessage);
        return CMD_CONSTANTS.FALSE_RESULT(errorMessage);
    };

    const hostInfo = await dbAbstractor.getHostEntry(host.hostname);
    if (host.matched_vnet_count != vnet_infos.length) {
        const matched_vnets_set = new Set(host.matched_vnets.split(","));
        for (const vnet_info of vnet_infos) {
            if (!matched_vnets_set.has(vnet_info.id)) {
                const result = await vnetModule.expandVnetToHost(vnet_info.name, host.hostname, params.consoleHandlers, false);
                if (!result) return handleFailure(`Vnet expansion to host ${host.hostname} failed. Aborting.`);
            }
        }
    }

    const scriptArgs = vnet_infos.map(vnet_info => ({ vnet: vnet_info.name,  gateway_address: vnet_info.gateway_address,  vnetnum: vnet_info.vnetnum,  vnet_name_hash: vnet_info.vnet_name_hash,  op: vnet_info.op,  defaultGateway : vnet_info.defaultGateway || "false" }));

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createOrUpdateLoadBalancer.sh`, 
            lb_name, frontend.scheduler, frontend.ip, frontend.port.toString(), frontend.protocol,
            JSON.stringify(JSON.stringify(backends)), JSON.stringify(JSON.stringify(scriptArgs))
        ]
    };

    const results = await xforge(xforgeArgs);
    if (!results.result) return handleFailure(`Failed to configure load balancer. ${lb_name} output ${results}`);

    const lbAddResult = await dbAbstractor.addOrUpdateLoadBalancerToDB(lb_name, lb_name_raw, lb_description, JSON.stringify(frontend), JSON.stringify(backends), host.hostname);
    if (!lbAddResult) return handleFailure("Failed to sync load balancer configuration to DB.", false, true);

    const pendingChanges = [...vnetDeletions,...vnetAdditions.filter(vnet => !currentConfig.has(createKey(vnet)))];

    for (const vnetChange of pendingChanges) {
        const vnet_details = await dbAbstractor.getVnet(vnetModule.resolveVnetName(vnetChange.vnet));
        if (!vnet_details) return handleFailure("Failed to create load balancer-vnet relation (VNet details missing).", true);

        const dbOp = vnetChange.op === "add" ? dbAbstractor.addLoadBalancerVnetIP : dbAbstractor.removeLoadBalancerVnetIP;
        const result = await dbOp(lb_name, vnet_details.name, vnetChange.ip);
        if (!result) return handleFailure("Failed to modify load balancer-vnet database mappings.", true);

        if (vnetChange.op === "del" && vnetModule.resolveVnetName(vnetChange.vnet) === vnetModule.resolveVnetName(backboneVnet)) {
            await dbAbstractor.unallocateIP(vnetChange.ip);
        }
    }

    const assignIPResult = await assignIPToVxLANBridge(backboneVnet, allocatedIP, params.consoleHandlers);
    if (!assignIPResult) return handleFailure("Failed to assign IP to VxLAN bridge.", true);

    params.consoleHandlers.LOGINFO(`Load balancer ${lb_name} configured successfully.`);
    return CMD_CONSTANTS.TRUE_RESULT("Load balancer configured successfully");
}

/**
 * Assigns an IP address to the designated VxLAN bridge interface
 */
const assignIPToVxLANBridge = async (backboneVnet, allocatedIP, console) => {
    if (!allocatedIP) return true;
    
    const hostnameIPVtep = await dbAbstractor.getHostForIP(allocatedIP, false);
    const hostInfoIPVtep = await dbAbstractor.getHostEntry(hostnameIPVtep);      
    const vnetRecord = await dbAbstractor.getVnet(vnetModule.resolveVnetName(backboneVnet)); 
    
    const xforgeArgsBridgeRoute = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: console,
        other: [
            hostInfoIPVtep.hostaddress, hostInfoIPVtep.rootid, hostInfoIPVtep.rootpw, hostInfoIPVtep.hostkey, hostInfoIPVtep.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/assignIPToVxLANBridge.sh`,
            vnetRecord.name, vnetRecord.vnetnum, allocatedIP.trim()
        ]
    };
    
    let results = await xforge(xforgeArgsBridgeRoute);
    return !!results.result;
}

exports.resolveLoadBalancerName = (lb_name_raw, project) => lb_name_raw ? `${lb_name_raw}_${KLOUD_CONSTANTS.env.org()}_${project || KLOUD_CONSTANTS.env.prj()}`.toLowerCase().replace(/\s/g, "_") : null;