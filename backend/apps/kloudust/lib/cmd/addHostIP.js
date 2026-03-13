/** 
 * addHostIP.js - Add the given IP to the assignable pool of IP addresses.
 * 
 * Params - 
 *  0 - IP Address in single IP or CIDR format, 
 *  1 - Hostname, 
 *  2 - if true, then reserve network, gateway and broadcast IPs
 * 
 * (C) 2025 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

/**
 * Adds the given IP the assignable IP addressses table 
 * @param {array} params The incoming params, see above.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    
    const [ip, hostname, reserved] = [...params];
    if (ip.indexOf("/") != -1) {    // CIDR block format detected, generate all IPs in the range and add
        const ipBase = ip.split("/")[0].trim(), mask = ip.split("/")[1].trim();
        const ipStartAsInt = parseInt(ipBase.split(".").map(bitBlock => parseInt(bitBlock).toString(2).padStart(8,0)).join("").substring(0,mask).padEnd(32,0),2);
        const ipEndAsInt = parseInt(ipBase.split(".").map(bitBlock => parseInt(bitBlock).toString(2).padStart(8,0)).join("").substring(0,mask).padEnd(32,1),2);
        for (let i = ipStartAsInt; i <= ipEndAsInt; i++) {
            const ipBitStr = i.toString(2).padStart(32,0);
            const ipAddressAsString = [].concat.apply( [],
                ipBitStr.split('').map((_,charIndex) => charIndex%8 ? [] : 
                    ipBitStr.slice(charIndex, charIndex+8)) ).map(chunk=>parseInt(chunk,2)).join(".");
            let allocatedTo = ""; if ( (reserved.toLowerCase() == "true") && ((i == ipStartAsInt) || 
                (i == ipStartAsInt + 1 )|| (i == ipEndAsInt)) ) allocatedTo = "reserved";
            if (!await dbAbstractor.addHostIP(ipAddressAsString, hostname, allocatedTo)) {
                params.consoleHandlers.LOGERROR(`Error adding IP ${ipAddressAsString} from IP CIDR ${ip} to the DB`);
                return CMD_CONSTANTS.FALSE_RESULT();
            }
        }
    } else if (!await dbAbstractor.addHostIP(ip.trim(), hostname)) {
        params.consoleHandlers.LOGERROR(`Error adding IP ${ip} to the DB`);
        return CMD_CONSTANTS.FALSE_RESULT();
    }

    return {result : true, out: "", err: ""};
}
