/** 
 * hostchooser.js - Returns host for the given constraints. Most common
 *  algorithm is LEAST_CPU, defined in conf/kloudust.conf under the 
 *  HOSTCHOOSER_ALGO key which allocates the VM to the host with the most
 *  available vCPUs. This doesn't guarantee RAM and Disk availability though.
 * 
 * (C) 2023 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

exports.getHostFor = async function(vcpus, memory, disk, imagearchitecture) {
    const available_host = await dbAbstractor.getAvailableHost(vcpus,memory,imagearchitecture); 
    return await dbAbstractor.getHostEntry(available_host[0].hostname);
}