/** 
 * createVnet.js - Creates new virtual network (type VxLAN) for the cloud.
 * 
 * Params - 0 - Vnet name, 1 - Vnet description, 3 - force overwrite, if true
 *  and a Vnet by the same name already exists, it will be overwrittern
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const hostchooser = require(`${KLOUD_CONSTANTS.LIBDIR}/hostchooser.js`);

/**
 * Creates a new virtual network
 * @param {array} params The incoming params - must be as above
 */
module.exports.exec = async function (params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {
        params.consoleHandlers.LOGUNAUTH();
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    const [vlan_name, vlan_description, hostname] = [...params];
    if (!hostname) {
        return await handleVlanWithoutHost(vlan_name, vlan_description, params);
    }

    let vlan_id = await dbAbstractor.getVlanId();
    const hostInfo = await getHostInfo(hostname);
    if (!hostInfo) {
        params.consoleHandlers.LOGERROR("Unable to find a suitable host.");
        return CMD_CONSTANTS.FALSE_RESULT();
    }
    const isVlanExist = await vlanExists(vlan_name, params);
    if (isVlanExist) {
        const vlanDetail = await dbAbstractor.getVlanFromHostname(vlan_name,hostname);
        if (vlanDetail && vlanDetail.hostname == hostname) return CMD_CONSTANTS.FALSE_RESULT();
        const presentVlan = await dbAbstractor.getVlan(vlan_name);
        const isVlanCreated = await createAnotherVlan(vlan_name, vlan_description, presentVlan.vlanid - 1, hostInfo, params);
        return isVlanCreated;
    }

    const { vlanGateway, vlanSubnet } = generateVlanGatewayDetails(await dbAbstractor.getVlanGateway());
    return await executeVlanCreation(vlan_name, vlan_description, vlan_id, vlanGateway, vlanSubnet, hostInfo, params);
};

async function createAnotherVlan(vlan_name, vlan_description, vlan_id, hostInfo, params) {
    const vlanDetails = await dbAbstractor.getVlan(vlan_name);
    const vlanGateway = getNextVlanIp(vlanDetails.vlangateway, await dbAbstractor.getVmIps(exports.VM_TYPE_VM));
    const vlanSubnet = vlanGateway.split('.').slice(0, 3).concat("0").join('.');
    return await executeVlanCreation(vlan_name, vlan_description, vlan_id, vlanGateway, vlanSubnet, hostInfo, params);

}

function getNextVlanIp(selectedVlanGateway, vmIps) {
    const vlanPrefix = selectedVlanGateway.split(".").slice(0, 3).join("."); // Extract "10.1.1"
    let vlanIps;
    if (vmIps.length) {
        vlanIps = vmIps.filter(ip => ip.startsWith(vlanPrefix)).map(ip => parseInt(ip.split(".")[3]))
            .sort((a, b) => a - b);
    }

    const nextIp = vlanIps && vlanIps.length > 0 ? vlanIps[vlanIps.length - 1] + 1 : 2; // Start from .2 if none exists
    return `${vlanPrefix}.${nextIp}`;
}
async function handleVlanWithoutHost(vlan_name, vlan_description, params) {
    if (await vlanExists(vlan_name, params)) return CMD_CONSTANTS.FALSE_RESULT();
    const success = await dbAbstractor.addOrUpdateVlanToDB(vlan_name, vlan_description, '', '', '');
    if (success) return { result: true };

    params.consoleHandlers.LOGERROR("DB failed");
    return CMD_CONSTANTS.FALSE_RESULT();
}

async function vlanExists(vlan_name, params) {
    const vlanDetail = await dbAbstractor.getVlan(vlan_name);
    if (vlanDetail && vlanDetail.vlangateway !== '') {
        params.consoleHandlers.LOGERROR(`Vlan with the name ${vlan_name} exists already for this project`);
        return true;
    }
    return false;
}

async function getHostInfo(hostname) {
    const forceHostByAdmin = hostname && hostname.trim().length && roleman.isCloudAdminLoggedIn();
    return forceHostByAdmin ? await dbAbstractor.getHostEntry(hostname) : await hostchooser.getHostFor();
}

function generateVlanGatewayDetails(existingGateway) {
    const vlanGateway = getNextVlanGatewayIp(existingGateway);
    const vlanSubnet = vlanGateway.split('.').slice(0, 3).concat("0").join('.');
    return { vlanGateway, vlanSubnet };
}

function getNextVlanGatewayIp(existingGateway) {
    if (!existingGateway || existingGateway === 1) return  KLOUD_CONSTANTS.CONF.DEFAULT_GATEWAY;
    const ipParts = existingGateway.split(".");
    return `10.1.${parseInt(ipParts[2]) + 1}.1`;
}

async function executeVlanCreation(vlan_name, vlan_description, vlan_id, vlanGateway, vlanSubnet, hostInfo, params) {
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createVLAN.sh`, vlan_id + 1, vlanGateway, vlanSubnet
        ]
    };

    const results = await xforge(xforgeArgs);
    console.log(results);

    if (!results.result) return results;

    const dbUpdateSuccess = await dbAbstractor.addOrUpdateVlanToDB(vlan_name, vlan_description, vlan_id + 1, vlanGateway, hostInfo.hostname);
    if (!dbUpdateSuccess) {
        params.consoleHandlers.LOGERROR("DB failed");
        return { ...results, result: false };
    }

    return results;
}

exports.VM_TYPE_VM = "vm";
