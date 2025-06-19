#!/bin/bash

#########################################################################################################
# Assigns the IP to the VM's mac attached to the given VxLAN. Re-entry safe.
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VM name
# {2} VxLAN name
# {3} IP address
# {4} Default route this VxLAN: Optional
#########################################################################################################
VM_NAME={1}
VLAN_NAME={2}
IP={3}
DEFAULT_VxLAN={4}
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

if ! virsh -c qemu:///system qemu-agent-command $VM_NAME '{"execute": "guest-exec", "arguments": {"path": "/usr/sbin/ip", "arg": [], "capture-output": true}}'; then exitFailed; fi 