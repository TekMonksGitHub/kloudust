#!/bin/bash

#########################################################################################################
# Attaches the given VM to an existing VxLAN on the host. Re-entry safe. 
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
if [ -n "$MAC" ]; then
    echo VM $VM_NAME is already attached to the VxLAN $VLAN_NAME, skipping.
    exit 0
fi

if ! virsh attach-interface --domain $VM_NAME --type bridge --source "$BR_NAME" --model virtio --config --live; then exitFailed; fi
echo Done.