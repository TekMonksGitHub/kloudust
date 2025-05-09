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

exports.getHostFor = async function (vcpus, memory, disk) {
    const hosts = await dbAbstractor.getlistOfHosts();

    for (const { hostname } of hosts) {  
        const vms = await dbAbstractor.getVmsForHost(hostname) || [];
        const host = await dbAbstractor.getHostEntry(hostname);

        const totalCpu = host.cores || 0, totalMemory = host.memory || 0, totalDisk = host.disk || 0;
        const usedCpu = vms.reduce((sum, vm) => sum + (vm.cpus || 0), 0);
        const usedMemory = vms.reduce((sum, vm) => sum + ((vm.memory || 0) * 1024 * 1024), 0);
        const usedDisk = vms.reduce((sum, vm) => {
            let disks = [];
            try { disks = JSON.parse(vm.disksjson || '[]'); } catch {}
            return sum + disks.reduce((acc, d) => acc + ((d.size || 0) * 1024 * 1024 * 1024), 0);
        }, 0);

        if (totalCpu - usedCpu >= vcpus && totalMemory - usedMemory >= memory * 1024 * 1024 && totalDisk - usedDisk >= disk * 1024 * 1024 * 1024) {
            console.log(`Selected Host: ${hostname}`);
            return host;
        }
    }
    
    return null;
};
