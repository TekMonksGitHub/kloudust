/** 
 * createOrUpdateRouter.js - Creates or updates a router between multiple VNets.
 * 
 * Params - 0 - Router Name, 1 - Router Description, 2 - Array of Vnets to connect and their gateway addresses
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const crypto = require('crypto');
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const vnetModule = require(`${KLOUD_CONSTANTS.LIBDIR}/vnet.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/xforge`);
const deleteRouter = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/deleteRouter.js`);
const getRouter = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/getRouter.js`);

/**
 * Creates a router between multiple VNets
 * @param {array} params The incoming params, see above for param documentation.
 */

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [router_name_raw, router_description, router_vnets, update] = [...params];
    const router_name = exports.resolveRouterName(router_name_raw);
    const vnets = JSON.parse(router_vnets);

    const getRouterParams = [router_name_raw]; getRouterParams.consoleHandlers = params.consoleHandlers;
    const routerExists = await getRouter.exec(getRouterParams);

    if(routerExists.result && update !== "true") {
        params.consoleHandlers.LOGERROR(`A router with the name ${router_name} already exists. Aborting.`);
        return CMD_CONSTANTS.FALSE_RESULT(`Failed to create router. A router with the name ${router_name} already exists.`);
    }

    const createKey = ({ vnet, ip }) => JSON.stringify([vnet, ip]);
    const currentConfig = new Map((routerExists?.router?.vnet_ips || []).map(v => [createKey(v), v]));

    const newConfig = new Map(vnets.map(vnet => [createKey(vnet), vnet]));
    const vnetAdditions = [...newConfig.values()].map(vnet => ({...vnet,op: "add"}));

    const vnetDeletions = [];
    for (const [key, vnet] of currentConfig) {
        if (!newConfig.has(key)) vnetDeletions.push({...vnet,op: "del"}); 
    }
    
    const finalVnet = [...vnetDeletions, ...vnetAdditions];

    const vnet_promises = finalVnet.map(async vnet => {
        const vnet_details = await dbAbstractor.getVnet(vnetModule.resolveVnetName(vnet.vnet));
        if (!vnet_details) return false;
        return { ...vnet_details, gateway_address: vnet.ip, vnet_name_hash: crypto.createHash('sha256').update(router_name+vnet_details.name,'utf8').digest('hex').slice(0,12), op : vnet.op };
    });

    const vnet_infos = await Promise.all(vnet_promises);

    if(vnet_infos.some(vnet_info => !vnet_info)) {
        params.consoleHandlers.LOGERROR(`One or more VNets do not exist. Aborting router creation.`);
        return CMD_CONSTANTS.FALSE_RESULT(`Failed to create router. One or more VNets do not exist.`);
    }

    const host = await dbAbstractor.getHostWithVnets(vnet_infos.map(_=>_.id));

    if(!host) {
        params.consoleHandlers.LOGERROR(`Cannot create router in an empty vnet.`);
        return CMD_CONSTANTS.FALSE_RESULT(`Cannot create router in an empty vnet.`);
    }
    
    const hostInfo = await dbAbstractor.getHostEntry(host.hostname);
    
    if(host.matched_vnet_count != vnet_infos.length) {
        const matched_vnets_set = new Set(host.matched_vnets.split(","));
        const missing_vnets = vnet_infos.filter(vnet_info => !matched_vnets_set.has(vnet_info.id));
        for (const missing_vnet of missing_vnets) {
            const result = await vnetModule.expandVnetToHost(missing_vnet.name,host.hostname,params.consoleHandlers,false);
            if (!result) {
                params.consoleHandlers.LOGERROR(`Vnet expansion to router host ${host.hostname} failed. Aborting router creation.`);
                return CMD_CONSTANTS.FALSE_RESULT(`Failed to create router. Vnet expansion to router host ${host.hostname} failed.`);
            }
        }
    }

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.THIRD_PARTY_DIR}/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createOrUpdateRouter.sh`, router_name, 
            JSON.stringify(JSON.stringify(vnet_infos.map(vnet_info => ({vnet: vnet_info.name, gateway_address: vnet_info.gateway_address, vnetnum: vnet_info.vnetnum, vnet_name_hash: vnet_info.vnet_name_hash, op : vnet_info.op}))))
        ]
    }

    const results = await xforge(xforgeArgs);

    if(results.result){
        const routerAddResult = await dbAbstractor.addOrUpdateRouterToDB(router_name,router_name_raw,router_description,host.hostname);
        if(routerAddResult){
            const vnetChanges = await Promise.all([...vnetDeletions,...vnetAdditions.filter(vnet=>!currentConfig.has(createKey(vnet)))].map(async vnetChange=>{
                const vnet_details = await dbAbstractor.getVnet(vnetModule.resolveVnetName(vnetChange.vnet));
                if (!vnet_details) return false;
                return { ...vnet_details, gateway_address: vnetChange.ip, op : vnetChange.op };
            }))
            for(const vnetChange of vnetChanges){
                const dbOp = vnetChange.op == "add" ? dbAbstractor.addRouterVnetIP : dbAbstractor.removeRouterVnetIP;
                const result = await dbOp(router_name, vnetChange.name,vnetChange.gateway_address)
                if (!result) {
                    if(update!=='true'){
                        const deleteRouterParams = [router_name_raw]; deleteRouterParams.consoleHandlers = params.consoleHandlers;
                        const deleteRouterResult = await deleteRouter.exec(deleteRouterParams);
                        if (!deleteRouterResult.result) params.consoleHandlers.LOGERROR(`Router cleanup failed. Manual cleanup might be required for router ${router_name} on host ${host.hostname}`);
                    }
                    return CMD_CONSTANTS.FALSE_RESULT("Failed to create router-vnet relation");
                }
            }

            params.consoleHandlers.LOGINFO(`Router ${router_name} created successfully.`);
            return CMD_CONSTANTS.TRUE_RESULT("Router created successfully");
        }else{
            const deleteResults = await deleteRouter.deleteRouterFromHost(router_name, hostInfo, params.consoleHandlers); //cleanup router from host if db addition failed
            if(!deleteResults.result) params.consoleHandlers.LOGERROR(`Router cleanup failed. Manual cleanup might be required for router ${router_name} on host ${host.hostname}`);
        }
    }

    params.consoleHandlers.LOGERROR(`Failed to create router. ${router_name} output ${results}`);
    return CMD_CONSTANTS.FALSE_RESULT(`Failed to create router.`);
}


exports.resolveRouterName = (router_name_raw, project) => router_name_raw?`${router_name_raw}_${KLOUD_CONSTANTS.env.org()}_${project||KLOUD_CONSTANTS.env.prj()}`.toLowerCase().replace(/\s/g,"_"):null;