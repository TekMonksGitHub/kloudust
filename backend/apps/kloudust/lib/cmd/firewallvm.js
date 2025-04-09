/** 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Lists the host catalog
 * @param {array} params The incoming params - must be - type (centos8 only for now), ip, user id, password, ssh hostkey
 */
module.exports.exec = async function (params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {
        params.consoleHandlers.LOGUNAUTH();
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    const [rawVmName, ruleSetName] = [...params];
    const vmName = exports.resolveVMName(rawVmName);
    const vmDetails = await dbAbstractor.getVM(vmName);

    if (!vmDetails.publicip) {
        return logAndReturnError(params, `VM ${vmName} does not have a public IP`);
    }
   
    let gatewayIpParts = vmDetails.ips.split('.');
    gatewayIpParts[3] = '1';
    const gatewayIp = gatewayIpParts.join('.');

    const firewallRules = await dbAbstractor.getFirewallRuleSets(ruleSetName);
    if (!firewallRules) {
        return logAndReturnError(params, `Firewall rules not found`);
    }

    const vlanHostname = await dbAbstractor.getVlanHostnameFromGateway(gatewayIp);
    if (!vlanHostname) {
        return logAndReturnError(params, `Failed to retrieve VLAN hostname`);
    }

    const hostDetails = await dbAbstractor.getHostEntry(vlanHostname.hostname);
    const rules =firewallRules.replace(/"/g, '\\"');

    // const { direction, protocol, port, ip } = rules[0];
    // const action = rules[0].allow ? 'allow' : 'deny';

    // const sourceIp = direction === "in" ? ip : vmDetails.publicip; // vmDetails.publicip
    // const destinationIp = direction === "in" ? vmDetails.publicip : ip; // vmDetails.publicip

    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT,
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostDetails.hostaddress, hostDetails.rootid, hostDetails.rootpw, hostDetails.hostkey, hostDetails.port,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/firewallvm.sh`, rules,vmDetails.publicip,vmDetails.ips
        ]
    };

    return await xforge(xforgeArgs);
};


exports.resolveVMName = vm_name_raw => vm_name_raw ? `${vm_name_raw}_${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}`.toLowerCase().replace(/\s/g, "_") : null;
