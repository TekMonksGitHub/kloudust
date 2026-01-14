#!/bin/bash

#########################################################################################################
# Checks if the Qemu guest agent is running inside the VM
# (C) 2026 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Params
# {1} VM Name
# {2} Max Wait (optional)
#########################################################################################################

VM="{1}"
MAX_WAIT="{2}"

INTERVAL=10
MAX_ATTEMPTS=$(( MAX_WAIT / INTERVAL ))

for ((i=1; i<=MAX_ATTEMPTS; i++)); do
    if virsh -c qemu:///system qemu-agent-command "$VM" \
        '{"execute":"guest-ping"}' >/dev/null 2>&1; then
        echo "QEMU guest agent is running inside the VM: $VM"
        exit 0
    fi

    sleep "$INTERVAL"
done

echo "Timed out waiting for QEMU guest agent in VM: $VM"
exit 1
