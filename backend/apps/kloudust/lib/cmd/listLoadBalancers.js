/** 
 * listLoadBalancers.js - Lists the load balancers for project or org.
 * 
 * Params - 0 - org, 1 - project  
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const getLoadBalancer = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/getLoadBalancer.js`);

/**
 * Lists the Load Balancers
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    const [org, project] = [...params];

    const lbs = await dbAbstractor.listLoadBalancers(project, org);
    if (!lbs) return {result: true, stdout: "", out: "", err: "", stderr: "", loadbalancers: []};
    
    const lbs_promise = lbs.map(lb => {
        const getLBParams = [lb.name_raw]; getLBParams.consoleHandlers = params.consoleHandlers;
        return getLoadBalancer.exec(getLBParams);
    })
    const lbs_promise_result = await Promise.all(lbs_promise);
    const lbs_ret = lbs_promise_result.map(result=>result.loadbalancer);

    let out = "Load balancer information from the database follows.";

    return {result: true, stdout: out, out, err: "", stderr: "", loadbalancers: lbs_ret};
}
