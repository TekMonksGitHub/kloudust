#!/bin/bash

# Params
# {1} - Domain / VM name
# {2} - The operation to perform
# {3} - Optional wait time before checking state (in seconds)

VM_NAME="{1}"
POWER_OP="{2}"
WAIT_TIME="${3:-10}"

function exitFailed() {
    echo Failed
    exit 1
}

function backgroundCheckAndStartIfNeeded() {
    local vm="$1"
    local wait="$2"

    (
        sleep "$wait"
        STATE=$(virsh domstate "$vm" 2>/dev/null)
        if [[ "$STATE" == "shut off" ]]; then
            echo "$vm is still shut off after $wait seconds. Starting it manually..."
            if ! virsh start "$vm"; then
                echo "Failed to start $vm after reboot"
            else
                echo "$vm started manually after reboot"
            fi
        else
            echo "$vm is in state: $STATE after $wait seconds. No action needed."
        fi
    ) &
}

echo "Power operating $VM_NAME to $POWER_OP"

if [[ "$POWER_OP" == "reboot" ]]; then
    if ! virsh reboot "$VM_NAME"; then
        echo "Reboot command failed, exiting."
        exitFailed
    fi
    backgroundCheckAndStartIfNeeded "$VM_NAME" "$WAIT_TIME"
else
    if ! virsh "$POWER_OP" "$VM_NAME"; then
        exitFailed
    fi
fi

echo "Power operation $POWER_OP initiated on $VM_NAME"
exit 0