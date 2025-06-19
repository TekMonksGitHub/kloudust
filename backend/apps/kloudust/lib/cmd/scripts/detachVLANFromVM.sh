#!/bin/bash

#########################################################################################################
# Removes a VM from a given VLAN. Re-entry safe. Will not delete the VLAN itself.
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VLAN Name
# {2} The VM name to deattach from this VLAN
#########################################################################################################
VLAN_NAME={1}
VM_NAME={2}
BR_NAME="$VLAN_NAME"_br

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed.
    exit 1
}

MAC=`virsh domiflist $VM_NAME | grep $BR_NAME | xargs | cut -d" " -f5`  # Find the MAC address for this VLAN's interface to the VM
if [ -z MAC ]; then
    echoerr Unable to find the MAC address of the VLAN interface.
    exitFailed
fi

if [ -n "$VM_NAME" ]; then                                                       
    if ! virsh detach-interface --domain $VM_NAME --type bridge --mac "$MAC" --config --live; then exitFailed; fi
fi

echo Done.