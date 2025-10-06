/**
 * Kloudust's virtual network handler.
 * 
 * (C) 2024 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const VNET_HOST_RELATION = "vnethost";

/** The default host network */
exports.KD_DEFAULT_HOST_NETWORK = "kddefault";

/**
 * Creates the Vnet. Doesn't touch the hosts as it is an empty Vnet. Only modifies the DB.
 * @param {string} vnet_name The vnet name, must be unique
 * @param {string} vnet_description The vnet description 
 * @param {object} consoleHandlers The Kloudust console handlers object
 * @returns {result: true|false, our, err, stdout, stderr}
 */
exports.createVnet = async function(vnet_name, vnet_description, consoleHandlers) {
    const vnetExists = await dbAbstractor.getVnet(vnet_name) != null;
    if (vnetExists) { // don't allow adding same vnet twice
        const err = `Vnet with ID ${vnet_name_raw} already exists`; KLOUD_CONSTANTS.LOGERROR(err); 
        return {...CMD_CONSTANTS.FALSE_RESULT(), out: "", err, stdout: "", stderr: err};
    } else {
        if (!(await dbAbstractor.addOrUpdateVnet(vnet_name, vnet_description))) {
            consoleHandlers.LOGERROR(`Vnet ${vnet_id} creation failed.`); return CMD_CONSTANTS.FALSE_RESULT();
        }
        const out = stdout = `Virtual network ${vnet_name} created.`;
        return {...CMD_CONSTANTS.TRUE_RESULT(), out, err: "", stdout: out, stderr: ""};
    }
}

/**
 * Deletes the Vnet, even if it is not empty. Will login to each host and delete 
 * the Vnet from it as well. If any VMs are connected to this Vnet, they will lose
 * that connection.
 * @param {string} vnet_name The vnet name, must be unique
 * @param {object} consoleHandlers The Kloudust console handlers object
 * @returns {result: true|false, our, err, stdout, stderr}
 */
exports.deleteVnet = async function(vnet_name, consoleHandlers) {
    const checkVnet = await dbAbstractor.getVnet(vnet_name);
    if (!checkVnet) {
        const err = `Vnet with ID ${vnet_name} doesn't exist.`; consoleHandlers.LOGWARN(err); 
        return {...CMD_CONSTANTS.TRUE_RESULT(), out: "", err, stdout: "", stderr: err}; // already doesn't exist so result is true anyways
    }

    const hostsForVnet = await dbAbstractor.getResourcesForVnet(vnet_name, VNET_HOST_RELATION);
    for (const host of hostsForVnet) {
        const hostInfo = await dbAbstractor.getHostEntry(host);
        let result;
        if (hostInfo) result = await exports.deleteVnetFromHost(vnet_name, hostInfo, consoleHandlers, false, true);
        if (!result) {
            const out = "", err = `Error deleting Vnet from host ${host}.`;
            return {...CMD_CONSTANTS.FALSE_RESULT(), out, err, stdout: out, stderr: err};
        }
    }

    const result = await dbAbstractor.deleteVnet(vnet_name);
    if (!result) {consoleHandlers.LOGERROR(`Vnet ${vnet_name} failed due to database error.`); return CMD_CONSTANTS.FALSE_RESULT();}

    const out = `Vnet ${vnet_name} deleted.`, err = '';
    return {...CMD_CONSTANTS.TRUE_RESULT(), out, err, stdout: out, stderr: err};
}

/**
 * Adds the given host as a Vtep for the given Vnet. There is a single
 * bridge per Vnet which is also added to the host. Existing peers are adjusted
 * on all the Vnet hosts.
 * @param {string|object} vnetNameOrRecord Virtual network name or record
 * @param {object} hostInfo The hostinfo object for the host
 * @param {object} consoleHandlers Kloudust console handlers
 * @param {boolean} createVnet If true and Vnet doesn't exist it is created
 * @returns {string|boolean} If Vnet was added - "added" is returned, 
 *                           if it already existed - "exists" is returned,
 *                           if it failed - false is returned
 */
exports.expandVnetToHost = async function (vnetName, hostInfoOrHostname, consoleHandlers, createVnet) {
    let vnetRecord = await dbAbstractor.getVnet(vnetName);
    if (!vnetRecord) {  // create Vnet in the DB if needed and if allowed to
        if (!createVnet) {
            consoleHandlers.LOGERROR("Vnet doesn't exist. Aborting."); return false;
        } else if (!(await exports.createVnet(vnetName, "Auto created", consoleHandlers))) {
            consoleHandlers.LOGERROR("Vnet creation failed. Aborting"); return false;
        }
        vnetRecord = await dbAbstractor.getVnet(vnetName);
    }

    const vnetHostResources = await dbAbstractor.getResourcesForVnet(vnetName, VNET_HOST_RELATION);
    const hostInfo = typeof hostInfoOrHostname === "string" ? await dbAbstractor.getHostEntry(hostInfoOrHostname) : hostInfoOrHostname;
    if (vnetHostResources.includes(hostInfo.hostname)) {
        consoleHandlers.LOGINFO(`Vnet ${vnetName} already present on the host ${hostInfo.hostname}`);
        return "exists";  // already on this host
    } else consoleHandlers.LOGINFO(`Vnet ${vnetName} being expanded to include the host ${hostInfo.hostname}`);
    const peerHostInfos = await _getHostInfoObjects(vnetHostResources), 
        peerHosts = await _getPeerHostAddresses(peerHostInfos);

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/addOrModifyVxLANBridge.sh`,
            vnetName, vnetRecord.vnetnum, peerHosts.join(" "), "auto", "auto"
        ]
    }

    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (!(await dbAbstractor.addVnetResource(vnetName, hostInfo.hostname, VNET_HOST_RELATION))) {
            consoleHandlers.LOGERROR(`Database relationship error adding host ${hostInfo.hostname} to Vnet ${vnetName}.`);
            exports.deleteVnetFromHost(vnetNameOrRecord, hostInfo, consoleHandlers, true);  // no need to await as this is cleanup
            return false;
        }

        for (const peerHostInfo of peerHostInfos.filter(peerHostInfoThis => hostInfo.hostname != peerHostInfoThis.hostname)) {
            if (!await exports.runAddVxLANPeers(vnetName, vnetRecord.vnetnum, [hostInfo.hostaddress], peerHostInfo, consoleHandlers)) {
                consoleHandlers.LOGERROR(`Vnet peer modification error for host ${peerHostInfo.hostname} for Vnet ${vnetName}.`);
                exports.deleteVnetFromHost(vnetNameOrRecord, hostInfo, consoleHandlers, true);  // no need to await as this is cleanup
                return false;
            }
        }

        return "added";
    } else return false;
}

/**
 * Deletes the given host as a Vtep for the given Vnet. There is a single
 * bridge per Vnet which is also removed from the host. Existing peers are 
 * adjusted on all the Vnet remaining hosts.
 * @param {string|object} vnetNameOrRecord Virtual network name or record
 * @param {object} hostInfo The hostinfo object for the host
 * @param {object} consoleHandlers Kloudust console handlers
 * @param {boolean} nodbupdate If true, the DB is not updated
 * @param {boolean} nopeerupdate Don't update peers DB (eg if entire Vnet is being deleted)
 * @returns {boolean} If Vnet was removed - true, else false
 */
exports.deleteVnetFromHost = async function (vnetNameOrRecord, hostInfo, consoleHandlers, nodbupdate=false, nopeerupdate=false) {
    const vnetName = typeof vnetNameOrRecord === "string" ? vnetNameOrRecord : vnetNameOrRecord.name;
    const vnetRecord = typeof vnetNameOrRecord === "string" ? await dbAbstractor.getVnet(vnetName) : vnetNameOrRecord;

    const vnetResources = await dbAbstractor.getResourcesForVnet(vnetName, VNET_HOST_RELATION);
    if (!vnetResources.include(hostInfo.hostname)) {
        consoleHandlers.LOGINFO(`Vnet ${vnetName} already not present on the host ${hostInfo.hostname}`);
        return true;  // already not on this host
    } else consoleHandlers.LOGINFO(`Vnet ${vnetName} being removed from the host ${hostInfo.hostname}`);

    if (!nodbupdate) if (!(await dbAbstractor.deleteVnetResource(vnetName, hostInfo.hostname, exports.VNET_HOST_TYPE))) {
        consoleHandlers.LOGERROR(`Database relationship error removing host ${hostInfo.hostname} to Vnet ${vnetName}.`);
        return false;
    }
    
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/deleteVxLANBridge.sh`,
            vnetName
        ]
    }
    const results = await xforge(xforgeArgs);

    if (!nopeerupdate) {
        const peerHostInfos = await _getHostInfoObjects(vnetResources);
        if (results.result) {
            for (const peerHostInfo of peerHostInfos.filter(peerHostInfoThis => peerHostInfoThis.hostname != hostnameThis))
                if (!await exports.runDeleteVxLANPeers(vnetName, vnetRecord.vnetnum, [hostInfo.hostaddress], peerHostInfo, consoleHandlers))
                    consoleHandlers.LOGERROR(`Vnet peer modification error for host ${hostname} for Vnet ${vnetName}.`);
        }
    }

    return results.result;
}

/**
 * Add VxLAN peers to the given host with the given list of peers 
 * @param {string} vlan_name The VLAN name
 * @param {number} vlan_num The VLAN ID
 * @param {array} peers The array of peer host addresses to add
 * @param {object} hostInfo The hostinfo object for the host being modified
 * @param {object} consoleHandlers Kloudust console handlers
 * @returns true on success, false on failure
 */
exports.runAddVxLANPeers = (vlan_name, vlan_num, peers, hostInfo, consoleHandlers) => _runModifyVxLANPeers(vlan_name, vlan_num, peers, hostInfo, consoleHandlers, "add");

/**
 * Deletes VxLAN peers to the given host with the given list of peers 
 * @param {string} vlan_name The VLAN name
 * @param {number} vlan_num The VLAN ID
 * @param {array} peers The array of peer host addresses to delete
 * @param {object} hostInfo The hostinfo object for the host being modified
 * @param {object} consoleHandlers Kloudust console handlers
 * @returns true on success, false on failure
 */
exports.runDeleteVxLANPeers = (vlan_name, vlan_num, peers, hostInfo, consoleHandlers) => _runModifyVxLANPeers(vlan_name, vlan_num, peers, hostInfo, consoleHandlers, "delete");

/**
 * Returns the list of Vnets for the current org and project
 * @param {string} project The project for which Vnet is needed (only org admin can override)
 * @param {string} org The org for which Vnet is needed (only cloud admin can override)
 * @returns The list of Vnets for the current org and project
 */
exports.listVnets = async function(project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    const vnets = await dbAbstractor.listVnets(project, org);
    const vnetsReturn = []; if (vnets && vnets.length) for (const vnet of vnets) {
        vnetsReturn.push({...vnet, raw_name: exports.unresolveVnetName(vnet.name)});
    }
    return vnetsReturn;
}

/** @return The internal name for the given raw Vnet name or null on error */
exports.resolveVnetName = vnet_name_raw => vnet_name_raw ?
    `${vnet_name_raw}_${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}`.toLowerCase().replace(/\s/g,"_") : null;


/** @return The public name for the given internal Vnet name or null on error */
exports.unresolveVnetName = vnet_name => vnet_name ? vnet_name.split("_")[0] : null;

async function _runModifyVxLANPeers(vlan_name, vlan_num, peers, hostInfo, consoleHandlers, type="add") {
    const script = `${type=="add"?"add":"delete"}VxLANPeers.sh`;
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/${script}`,
            vlan_name, vlan_num, peers.join(" ")
        ]
    }
    const results = await xforge(xforgeArgs);
    return results.result;
}

async function _getPeerHostAddresses(hostInfos) {
    const peerHostsAddresses = []; for (const hostInfo of hostInfos) peerHostsAddresses.push(hostInfo.hostaddress);
    return  peerHostsAddresses;
}

async function _getHostInfoObjects(hostnames) {
    const peerHostsInfos = []; for (const hostname of hostnames) peerHostsInfos.push((await dbAbstractor.getHostEntry(hostname)));
    return  peerHostsInfos;
}