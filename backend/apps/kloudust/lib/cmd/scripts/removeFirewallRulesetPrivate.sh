#!/bin/bash

#########################################################################################################
# Removes firewall rules for a VM's private IP
# based on the comment (ruleset name + VM name + bridge id)
#
# Params:
#  2 - VNet ID to grep handles
#  3 - VM Name to grep handles 
#  4 - Ruleset name to grep handles
#
# (C) 2026 TekMonks. All rights reserved.
#########################################################################################################

VNET_ID="{1}"
VM_NAME="{2}"
RULESET_NAME="{3}"
BR_NAME="kd${VNET_ID}_br"

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed
    exit 1
}

# Ensure table exists
if ! sudo nft list table bridge "${BR_NAME}_filter"; then
    echoerr "Table ${BR_NAME}_filter does not exist. Nothing to remove."
    exitFailed;
fi

# Fetch rule handles with matching comment
RULES_TO_DELETE=$(sudo nft --handle list chain bridge "${BR_NAME}_filter" forward | grep -F "comment \"${RULESET_NAME}-${VM_NAME}-${VNET_ID}\"" | awk '/handle/ {print $NF}')

if [ -z "$RULES_TO_DELETE" ]; then
    echo "No rules found for ${RULESET_NAME}-${VM_NAME}. Nothing to remove."
    exit 0;
fi

# Delete rules one by one
for HANDLE in $RULES_TO_DELETE; do
    if ! sudo nft delete rule bridge "${BR_NAME}_filter" forward handle "$HANDLE"; then
        echoerr "Failed to delete rule handle $HANDLE"
        exitFailed
    fi
done

echo "Removed firewall rules for VM ${VM_NAME} (ruleset: ${RULESET_NAME})!"
exit 0