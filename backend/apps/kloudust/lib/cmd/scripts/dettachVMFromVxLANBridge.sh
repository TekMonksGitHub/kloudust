#!/bin/bash

#########################################################################################################
# Detaches the given VM from an existing VxLAN on the host. Re-entry safe. 
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


function exitFailed() {
    echo Failed
    exit 1
}


MAC=`virsh domiflist $VM_NAME | grep $BR_NAME | xargs | cut -d" " -f5`
if [ -z "$MAC" ]; then 
    echo Could not locate MAC for the VM $VM_NAME attached to the VxLAN $VLAN_NAME or already detached, skipping.
    exit 0
fi

if ! virsh detach-interface --domain $VM_NAME --type bridge --mac $MAC --config --live; then exitFailed; fi
echo Done.