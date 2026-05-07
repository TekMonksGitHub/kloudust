#!/bin/bash

#########################################################################################################
# Applies firewall rules for a VM on a Vnet
#
# Params:
#  1 - Firewall ruleset JSON
#  2 - VNet ID for getting mac address of vm interface and for unique comment to grep handles later
#  3 - VM Name for unique comment to grep handles later
#  4 - Ruleset name for unique comment to grep handles later
#
# (C) 2026 TekMonks. All rights reserved.
#########################################################################################################

RULES_JSON="{1}"
VNET_ID="{2}"
VM_NAME="{3}"
RULESET_NAME="{4}"
BR_NAME="kd${VNET_ID}_br"

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed
    exit 1
}

# Get VM's MAC address from virsh
MAC_ADDRESS=`virsh dumpxml $VM_NAME | xmllint --xpath "string(//interface[@type='bridge'][source/@bridge='$BR_NAME']/mac/@address)" -`
if [ -z "$MAC_ADDRESS" ]; then
    echoerr "Could not locate MAC for the VM $VM_NAME attached to VNet $VNET_ID or already detached, skipping."
    exitFailed
else
    echo "Found MAC $MAC_ADDRESS for VM attachment to the VNet. Proceeding with firewall setup."
fi

FORWARD_CHAIN="kd_$(echo "${RULESET_NAME}_${VM_NAME}_${VNET_ID}" | md5sum | cut -c1-24)" # Unique chain name (<=31 chars limit)

NFT_FAMILY="bridge"    # Using bridge family
NFT_TABLE="kdhostfirewall_bridge"

# Create bridge table if not exists
if ! sudo nft add table "$NFT_FAMILY" "$NFT_TABLE" 2>/dev/null; then true; fi

# Create single forward chain
if ! sudo nft add chain "$NFT_FAMILY" "$NFT_TABLE" "$FORWARD_CHAIN" \
    { type filter hook forward priority 0\; policy accept\; comment \"$RULESET_NAME-$VM_NAME-$VNET_ID\"\; }; then
    exitFailed
fi

# Allow ARP in both directions - using MAC address
if ! sudo nft add rule "$NFT_FAMILY" "$NFT_TABLE" "$FORWARD_CHAIN" \
    ether type arp ether daddr "$MAC_ADDRESS" accept; then
    exitFailed
fi

if ! sudo nft add rule "$NFT_FAMILY" "$NFT_TABLE" "$FORWARD_CHAIN" \
    ether type arp ether saddr "$MAC_ADDRESS" accept; then
    exitFailed
fi

# Allow packets that are part of established/related connections
if ! sudo nft add rule "$NFT_FAMILY" "$NFT_TABLE" "$FORWARD_CHAIN" \
    ct state established,related accept; then
    exitFailed
fi

# Drop packets with invalid connection tracking state
if ! sudo nft add rule "$NFT_FAMILY" "$NFT_TABLE" "$FORWARD_CHAIN" \
    ct state invalid drop; then
    exitFailed
fi

# Apply rules from JSON
RULES_FAILED=0
while read -r rule; do
    DIRECTION=$(echo "$rule" | jq -r '.direction')
    ALLOW=$(echo "$rule" | jq -r '.allow')
    PROTOCOL=$(echo "$rule" | jq -r '.protocol')
    PORT=$(echo "$rule" | jq -r '.port')
    IP=$(echo "$rule" | jq -r '.ip')

    ACTION="drop"
    CT_MATCH=""
    if [ "$ALLOW" = "true" ]; then
        ACTION="accept"
        CT_MATCH="ct state new"
    fi

    PORT_MATCH=""
    if { [ "$PROTOCOL" = "tcp" ] || [ "$PROTOCOL" = "udp" ]; } && [ -n "$PORT" ] && [ "$PORT" != "null" ]; then
        PORT_MATCH="$PROTOCOL dport $PORT"
    fi

    IP_MATCH="" 
    # Direction-based MAC + IP filtering
    if [ "$DIRECTION" = "in" ]; then
        IF_MATCH="ether daddr $MAC_ADDRESS"   # traffic TO vm: dst MAC = VM MAC
        if [ "$IP" != "*" ] && [ "$IP" != "null" ]; then
            IP_MATCH="ip saddr $IP"
        fi
    else
        IF_MATCH="ether saddr $MAC_ADDRESS"   # traffic FROM vm: src MAC = VM MAC
        if [ "$IP" != "*" ] && [ "$IP" != "null" ]; then
            IP_MATCH="ip daddr $IP"
        fi
    fi

    if ! sudo nft add rule "$NFT_FAMILY" "$NFT_TABLE" "$FORWARD_CHAIN" \
        $IF_MATCH $CT_MATCH $IP_MATCH $PORT_MATCH counter $ACTION \
        comment \"$RULESET_NAME-$VM_NAME-$VNET_ID\"; then
        RULES_FAILED=1
        break
    fi
done < <(echo "$RULES_JSON" | jq -c '.[]')