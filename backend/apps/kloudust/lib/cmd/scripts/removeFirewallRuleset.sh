#!/bin/bash

#########################################################################################################
# Removes firewall rules for a VM (private or public)
#
# Usage:
#   <vnet_id> <vm_name> <ruleset_name>
#
# (C) 2026 TekMonks. All rights reserved.
#########################################################################################################

VNET_ID="{1}"
VM_NAME="{2}"
RULESET_NAME="{3}"

echoerr() { echo "$@" 1>&2; }

exitFailed() {
    echo Failed
    exit 1
}

if [ -z "$VNET_ID" ] || [ -z "$VM_NAME" ] || [ -z "$RULESET_NAME" ]; then
    echoerr "Invalid parameters."
    exitFailed
fi

# Delete the chains, as the netdev table is shared
while read -r family table chain; do
    if ! sudo nft delete chain "$family" "$table" "$chain"; then exitFailed; fi
done < <(sudo nft -j list ruleset | jq -r --arg comment "$RULESET_NAME-$VM_NAME-$VNET_ID" '
  .nftables[] | select(.chain) | .chain |
  select(.comment == $comment) |
  "\(.family) \(.table) \(.name)"
')


# Persist
if ! sudo nft list ruleset | sudo tee /etc/nftables.conf > /dev/null; then exitFailed; fi 
if ! sudo systemctl enable nftables; then exitFailed; fi

echo "Netdev egress+ingress firewall rules removed for $VM_NAME, ruleset $RULESET_NAME and Vnet $VNET_ID"
exit 0
