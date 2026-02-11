#!/bin/bash

#########################################################################################################
# Removes firewall rules for a VM's public IP
# based on the comment (ruleset name + VM name + ip address dashed)
#
# Params:
#  1 - Public IP to grep handles (dashed for comment match, e.g. 1_2_3_4)
#  2 - VM Name to grep handles
#  3 - Ruleset name to grep handles
#
# (C) 2026 TekMonks. All rights reserved.
#########################################################################################################

PUBLIC_IP="{1}"
VM_NAME="{2}"
RULESET_NAME="{3}"

IP_ADDRESS_DASHED=$(echo "$PUBLIC_IP" | tr '.' '_')

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed
    exit 1
}

if ! sudo nft list table inet "ip_${IP_ADDRESS_DASHED}_filter"; then exitFailed; fi

RULES_TO_DELETE=$(sudo nft --handle list chain inet "ip_${IP_ADDRESS_DASHED}_filter" forward | grep -F "comment \"${RULESET_NAME}-${VM_NAME}-${IP_ADDRESS_DASHED}\"" | awk '/handle/ {print $NF}')

if [ -z "$RULES_TO_DELETE" ]; then
    echo "No rules found for ${RULESET_NAME}-${VM_NAME}. Nothing to remove."
    exit 0;
fi

for HANDLE in $RULES_TO_DELETE; do
    if ! sudo nft delete rule inet "ip_${IP_ADDRESS_DASHED}_filter" forward handle "$HANDLE"; then
        echoerr "Failed to delete rule handle $HANDLE";
        exitFailed;
    fi
done

echo "Removed firewall rules for VM ${VM_NAME} (ruleset: ${RULESET_NAME})!"
exit 0