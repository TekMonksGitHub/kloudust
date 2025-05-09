/** 
 * registerVMStatusUpdate.js - Refreshes VMs states at a certain interval
 * 
 * Params - 0 - VMs Array
 *  
 * (C) 2025 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);

const statusCheck = {};
let refreshInterval;
/**
 * Registers a job to refresh VMs' states at a certain interval
 * @param {array} params The incoming params, see above for param documentation.
 */
module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }
    const [vms] = [...params];

    for (const vm of vms) {
        if(!statusCheck[vm.hostname]) statusCheck[vm.hostname] = [];
        if (!statusCheck[vm.hostname].some(rvm => rvm.id === vm.id)) statusCheck[vm.hostname].push({name:vm.name,id:vm.id});  
    }

    clearInterval(refreshInterval);
    
    refreshInterval = setInterval(()=>_refreshRegisteredVMStatus(params.consoleHandlers), KLOUD_CONSTANTS.CONF.VM_STATUS_REFRESH_TIME);

    return true;
}

async function _refreshRegisteredVMStatus(consoleHandlers){
    for (const host in statusCheck) {
        const listOfVMs = statusCheck[host];
        let vmList = "";
        for (const vm of listOfVMs) {
            vmList+=vm.name+","+vm.id+"|";
        }
        let hostInfo = await dbAbstractor.getHostEntry(host);
        const xforgeArgs = {
            colors: KLOUD_CONSTANTS.COLORED_OUT, 
            file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
            console: consoleHandlers,
            other: [
                    hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
                    `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/getVMsStatus.sh`,
                    vmList
                ]
        }

        const results = await xforge(xforgeArgs);
        if (!results.result) return results;
        let regex = /OUTPUTSTART(.*?)OUTPUTEND/;
        let outputs = results.out.match(regex);
        if (outputs) {
            outputs = outputs[1].trim().slice(0,-1).split('|');
            for (const output of outputs) {
                let vmState = output.split(",");
                let result = await dbAbstractor.updateVMStatus(vmState[1],vmState[2]);
            }
        } else {
            consoleHandlers.LOGINFO("No match found.");
        }
    }
}
