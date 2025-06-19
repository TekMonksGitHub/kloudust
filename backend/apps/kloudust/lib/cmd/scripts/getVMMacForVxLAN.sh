#!/bin/bash

#########################################################################################################
# Returns the MAC address of the VM adapter attached to the given VxLAN bridge.
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VM Name
# {2} VxLAN Name
#########################################################################################################
VM_NAME={1}
VLAN_NAME={2}
BR_NAME="$VLAN_NAME"_br


echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed
    exit 1
}


MAC=`virsh domiflist $VM_NAME | grep $BR_NAME | xargs | cut -d" " -f5`
if [ -z "$MAC" ]; then 
    echoerr Could not locate MAC for the VM $VM_NAME attached to the VxLAN $VLAN_NAME or already detached, skipping.
    exitFailed
else
    echo $MAC
fi