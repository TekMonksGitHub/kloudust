#!/bin/bash

#########################################################################################################
# Removes firewall rules for a VM (private or public)
#
# Usage:
#   private <vnet_id> <vm_name> <ruleset_name>
#   public  <public_ip> <vm_name> <ruleset_name>
#
# (C) 2026 TekMonks. All rights reserved.
#########################################################################################################

MODE="{1}"
ARG1="{2}"
VM_NAME="{3}"
RULESET_NAME="{4}"

echoerr() { echo "$@" 1>&2; }

exitFailed() {
    echo Failed
    exit 1
}

if [ -z "$MODE" ] || [ -z "$ARG1" ] || [ -z "$VM_NAME" ] || [ -z "$RULESET_NAME" ]; then
    echoerr "Invalid parameters."
    exitFailed
fi

case "$MODE" in
    private)
        VNET_ID="$ARG1"
        FAMILY="bridge"
        TABLE="kd${VNET_ID}_br_filter"
        COMMENT_SUFFIX="${VNET_ID}"
        ;;
    public)
        PUBLIC_IP="$ARG1"
        IP_DASHED=$(echo "$PUBLIC_IP" | tr '.' '_')
        FAMILY="inet"
        TABLE="ip_${IP_DASHED}_filter"
        COMMENT_SUFFIX="${IP_DASHED}"
        ;;
    *)
        echoerr "Invalid mode. Use 'private' or 'public'."
        exitFailed
        ;;
esac

COMMENT_STRING="${RULESET_NAME}-${VM_NAME}-${COMMENT_SUFFIX}"

# Ensure table exists
if ! sudo nft list table "$FAMILY" "$TABLE" >/dev/null 2>&1; then
    echoerr "Table ${TABLE} does not exist. Nothing to remove."
    exitFailed
fi

# Fetch rule handles
RULES_TO_DELETE=$(sudo nft --handle list chain "$FAMILY" "$TABLE" forward | grep -F "comment \"${COMMENT_STRING}\"" | awk '/handle/ {print $NF}')

if [ -z "$RULES_TO_DELETE" ]; then
    echo "No rules found for ${RULESET_NAME}-${VM_NAME}. Nothing to remove."
    exit 0
fi

# Delete rules
for HANDLE in $RULES_TO_DELETE; do
    if ! sudo nft delete rule "$FAMILY" "$TABLE" forward handle "$HANDLE"; then
        echoerr "Failed to delete rule handle $HANDLE"
        exitFailed
    fi
done

echo "Removed firewall rules for VM ${VM_NAME} (ruleset: ${RULESET_NAME})!"
exit 0
