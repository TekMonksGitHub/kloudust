#!/bin/bash

# Params
# {1} - Domain / VM name
# {2} - The operation to perform

NAME="{1}"
POWER_OP="{2}"

function exitFailed() {
    echo Failed
    exit 1
}

function waitUntilRunning() {
    for i in {1..30}; do
        STATUS=$(virsh domstate "$NAME" 2>/dev/null)
        if [[ "$STATUS" == "running" ]]; then
            return 0
        fi
        sleep 2
    done
    return 1
}

function handleRebootOrReset() {
    if ! virsh "$POWER_OP" "$NAME"; then
        echo "$POWER_OP command failed, exiting."
        exitFailed
    fi

    sleep 5  # short delay to let state settle

    STATE=$(virsh domstate "$NAME" 2>/dev/null)
    if [[ "$STATE" == "shut off" ]]; then
        echo "$NAME shut off after $POWER_OP. Starting it manually..."
        if ! virsh start "$NAME"; then exitFailed; fi

        printf "Waiting for $NAME to be running...\n"
        if ! waitUntilRunning; then
            echo "$NAME did not come online after start"
            exitFailed
        fi
    fi
}

printf "Power operating $NAME to $POWER_OP\n"

if [[ "$POWER_OP" == "reboot" || "$POWER_OP" == "reset" ]]; then
    handleRebootOrReset
else
    if ! virsh "$POWER_OP" "$NAME"; then exitFailed; fi
fi

printf "\n\nPower operation $POWER_OP successful on $NAME\n"
exit 0
