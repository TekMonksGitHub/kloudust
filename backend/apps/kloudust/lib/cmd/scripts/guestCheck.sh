#!/bin/bash

#########################################################################################################
# Checks if the Qemu guest agent is running inside the VM
# (C) 2026 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VM Name
#########################################################################################################

VM="{1}"

if ! virsh -c qemu:///system qemu-agent-command "$VM" '{"execute":"guest-ping"}' >/dev/null 2>&1; then
    echo "QEMU guest agent is not running or not connected in VM: $VM"
    exit 1
fi

echo "QEMU guest agent is running inside the VM: $VM"

