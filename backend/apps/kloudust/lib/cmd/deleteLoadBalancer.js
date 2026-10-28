/** 
 * deleteLoadBalancer.js - Deletes the given Load Balancer.
 * It will also delete the Vnet relationships in the DB for this Load Balancer.
 * 
 * Params - 0 - Load Balancer Name
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const { xforge } = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const createOrUpdateLoadBalancer = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createOrUpdateLoadBalancer.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const createVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVnet.js`);
const vnetModule = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);

/**
 * Deletes the given Load Balancer
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function (params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    const [lb_name_raw] = params, lb_name = createOrUpdateLoadBalancer.resolveLoadBalancerName(lb_name_raw);

    const lb = await dbAbstractor.getLoadBalancer(lb_name);
    if (!lb) { params.consoleHandlers.LOGERROR("Bad Load Balancer name or Load Balancer not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const hostInfo = await dbAbstractor.getHostEntry(lb.hostname);
    if (!hostInfo) { params.consoleHandlers.LOGERROR("Bad hostname for the load balancer or host not found"); return CMD_CONSTANTS.FALSE_RESULT(); }

    const results = await exports.deleteLoadBalancerFromHost(lb_name, hostInfo, params.consoleHandlers);
    if (!results.result) return results;

    const vnet_ips = await dbAbstractor.getVnetIPsForLoadBalancer(lb.name) || [];
    const backboneVnet = createVnet.getInternetBackboneVnet(), backboneVnetName = vnetModule.resolveVnetName(backboneVnet);

    for (const vi of vnet_ips) {
        const vnetName = await dbAbstractor.getVnetName(vi.vnet);
        if (vnetName?.name === backboneVnetName) {
            await dbAbstractor.unallocateIP(vi.ip);
            if (!await unassignIPToVxLANBridge(backboneVnet, vi.ip, params.consoleHandlers)) {
                params.consoleHandlers.LOGERROR(`Failed to unassign IP ${vi.ip} from VxLAN bridge for Load Balancer ${lb_name}`);
                return { ...results, result: false };
            }
        }
    }

    if (!await dbAbstractor.removeAllLoadBalancerVnetIPRelationships(lb.name)) params.consoleHandlers.LOGERROR(`DB failed to delete all LoadBalancer-Vnets-IP for Load Balancer ${lb_name}`);
    if (await dbAbstractor.deleteLoadBalancer(lb_name)) return results;
    
    params.consoleHandlers.LOGERROR(`DB failed to delete load balancer entry for ${lb_name}`); return { ...results, result: false };
}

exports.deleteLoadBalancerFromHost = async function (lb_name, hostInfo, console) {
    return await xforge({
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console,
        other: [hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port, `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/deleteLoadBalancer.sh`, lb_name]
    });
}

const unassignIPToVxLANBridge = async (backboneVnet, allocatedIP, console) => {
    const hostnameIPVtep = await dbAbstractor.getHostForIP(allocatedIP, false);
    const hostInfoIPVtep = await dbAbstractor.getHostEntry(hostnameIPVtep);      
    const vnetRecord = await dbAbstractor.getVnet(vnetModule.resolveVnetName(backboneVnet)); 
    if (!hostInfoIPVtep || !vnetRecord) return false;

    let results = await xforge({
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console,
        other: [hostInfoIPVtep.hostaddress, hostInfoIPVtep.rootid, hostInfoIPVtep.rootpw, hostInfoIPVtep.hostkey, hostInfoIPVtep.port, `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/unassignIPToVxLANBridge.sh`, vnetRecord.name, vnetRecord.vnetnum, allocatedIP.trim()]
    });
    return !!results?.result;
}