/** 
 * getLoadBalancer.js - returns the complete information about a load balancer
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const createOrUpdateLoadBalancer = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createOrUpdateLoadBalancer.js`);
const vnetModule = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);

/**
 * Returns the load balancer information
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [lb_name_raw] = params;
    if (!lb_name_raw) { params.consoleHandlers.LOGERROR("Missing load balancer name!"); return CMD_CONSTANTS.FALSE_RESULT(); }
    
    const lb_name = createOrUpdateLoadBalancer.resolveLoadBalancerName(lb_name_raw);
    const lb = await dbAbstractor.getLoadBalancer(lb_name);
    if (!lb) {params.consoleHandlers.LOGERROR("Bad load balancer name or load balancer not found"); return CMD_CONSTANTS.FALSE_RESULT("Bad load balancer name or load balancer not found");}
    
    const vnet_ips = await dbAbstractor.getVnetIPsForLoadBalancer(lb.name);

    const vnet_ips_promise = vnet_ips.map(async vi=>{
        let vnet_name = await dbAbstractor.getVnetName(vi.vnet);
        vnet_name = vnetModule.unresolveVnetName(vnet_name.name);
        return {...vi, vnet : vnet_name}
    })
    lb.frontend = JSON.parse(lb.frontend);
    lb.backends = JSON.parse(lb.backends);

    lb.vnet_ips = await Promise.all(vnet_ips_promise);
    
    let err = "", out = ""; if (!lb) err = `Error loading load balancer ${lb_name_raw}`; else out = `Load balancer ${lb_name_raw} found`;
    return {result: lb?true:false, err, out, stdout: out, stderr: err, loadbalancer: lb};
}
