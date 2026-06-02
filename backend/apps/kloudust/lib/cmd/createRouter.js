/** 
 * createRouter.js - Creates a router between multiple VNets.
 * 
 * Params - 0 - Router Name, 1 - Router Description, 2 - Array of Vnets to connect and their gateway addresses
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const cryptoMod = require("crypto");
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const addVMVnet = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/addVMVnet.js`);
const assignVnetIP = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/assignVnetIP.js`);
const deleteVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/deleteVM.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);

/**
 * Creates a router between multiple VNets
 * @param {array} params The incoming params, see above for param documentation.
 */

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}
    const [router_name_raw, router_description, router_vnets, cores, memory, disk, creation_image_name, cloudinit_data] = [...params];
    const router_name = exports.resolveRouterName(router_name_raw);
    const vnets = JSON.parse(router_vnets);
    const cloudinit_updated = cloudinit_data.replace("$AUTO_GENERATE$", cryptoMod.randomBytes(32).toString("hex"));
    const createRouterParams = [router_name, router_description, cores, memory, disk, "" , creation_image_name, cloudinit_updated, "false", "", "", "", "router", "false", "", ""];
    createRouterParams.consoleHandlers = params.consoleHandlers;

    const createVMExec = await createVM.exec(createRouterParams);
    if (!createVMExec.result) { 
        const error = `Failed to create router ${router_name}`;
        params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }
    const vnetPromises = vnets.map(vnet=> {
        const paramsVnet = [router_name, vnet.vnet, "true"]; paramsVnet.consoleHandlers = params.consoleHandlers;
        return addVMVnet.exec(paramsVnet);
    });

    const vnetResults = await Promise.all(vnetPromises);

    for (const result of vnetResults) {
        if (!result.result) {
            await deleteVM.exec(createRouterParams);
            params.consoleHandlers.LOGERROR("Virtual network addition failed");
            return CMD_CONSTANTS.FALSE_RESULT("Virtual network addition failed");
        }
    }

    const MAX_RETRIES = 3;
    for (const vnet of vnets) {
        let success = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const assignVnetIPParams = [router_name, vnet.ip, vnet.vnet]; assignVnetIPParams.consoleHandlers = params.consoleHandlers;
            const assignIPResult = await assignVnetIP.exec(assignVnetIPParams);
            if (assignIPResult && assignIPResult.result) { success = true; break; }
            params.consoleHandlers.LOGWARN(`Assign IP ${vnet.ip} attempt ${attempt} failed for vnet ${vnet.vnet}`);
        }
        if (!success) {
            await deleteVM.exec(createRouterParams);
            params.consoleHandlers.LOGERROR("Assigning IP to router failed");
            return CMD_CONSTANTS.FALSE_RESULT("Assigning IP to router failed");
        }
    }

    return CMD_CONSTANTS.TRUE_RESULT("Router created successfully");
}


exports.resolveRouterName = (router_name_raw) => router_name_raw ? "rtr-"+router_name_raw.trim() : null;