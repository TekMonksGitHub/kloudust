/**
 * liveMigrateHostHelper.js - Finds compatible destination hosts for live migration.
 * Uses the generic available-host chooser first, then applies live-migration-specific filters.
 * 
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);

exports.getCompatibleHostsForLiveMigration = async function(vm_name_raw) {
    const vm_name = createVM.resolveVMName(vm_name_raw);
    const vm = await dbAbstractor.getVM(vm_name);
    if (!vm) return {result: false, error: "Bad VM name or VM not found"};

    const sourceHost = await dbAbstractor.getHostEntry(vm.hostname);
    if (!sourceHost) return {result: false, error: "Bad hostname for the VM or host not found"};

    const sourceVendor = _getProcessorVendor(sourceHost.processor);
    if (!sourceVendor) return {result: false, error: `Unknown CPU vendor for source host ${sourceHost.hostname}`};

    const availableHosts = await dbAbstractor.getAvailableHosts(vm.cpus, vm.memory, vm.disk, vm.arch, {
        cpu_factor: KLOUD_CONSTANTS.CONF.VCPU_TO_PHYSICAL_CPU_FACTOR,
        mem_factor: KLOUD_CONSTANTS.CONF.VMEM_TO_PHYSICAL_MEM_FACTOR
    });
    if (!availableHosts) return {result: false, error: "Unable to fetch available hosts"};

    const compatibleHosts = [];
    for (const availableHost of availableHosts) {
        if (availableHost.hostname == sourceHost.hostname) continue;

        const hostInfo = await dbAbstractor.getHostEntry(availableHost.hostname);
        if (!hostInfo) continue;

        const targetVendor = _getProcessorVendor(hostInfo.processor);
        if (targetVendor != sourceVendor) continue;

        compatibleHosts.push({
            ...hostInfo,
            free_cpu: availableHost.free_cpu,
            free_ram: availableHost.free_ram,
            free_disk: availableHost.free_disk
        });
    }

    return {result: true, vm, sourceHost, sourceVendor, hosts: compatibleHosts};
}

function _getProcessorVendor(processor="") {
    const processor_lc = processor.toLowerCase();

    if (processor_lc.includes("intel") || processor_lc.includes("genuineintel")) return "intel";
    if (processor_lc.includes("amd") || processor_lc.includes("authenticamd")) return "amd";

    return "";
}