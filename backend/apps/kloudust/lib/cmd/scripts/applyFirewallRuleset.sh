#!/bin/bash

#########################################################################################################
# Applies internet firewall rules for a routed public IP (VxLAN edge enforcement)
# MAC-based enforcement on bridge
#
# Params:
#  1 - Firewall ruleset JSON
#  2 - VxLAN bridge numeric id (e.g. 100 → kd100_br)
#  3 - Public IP address (unused for MAC-based rules, kept for compatibility)
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

MAC_ADDRESS=$(virsh dumpxml "$VM_NAME" | xmllint --xpath "string(//interface[@type='bridge'][source/@bridge='$BR_NAME']/mac/@address)" -)
if [ -z "$MAC_ADDRESS" ]; then
    echoerr "Could not locate MAC for the VM $VM_NAME attached to VNet $VNET_ID or already detached, skipping."
    exitFailed
else
    echo "Found MAC $MAC_ADDRESS for VM attachment to the VNet. Proceeding with firewall setup."
fi

if ! modprobe br_netfilter; then exitFailed; fi
if ! echo "br_netfilter" | sudo tee /etc/modules-load.d/br_netfilter.conf >/dev/null; then exitFailed; fi

if ! sudo nft add table inet "${BR_NAME}_filter" 2>/dev/null; then true; fi
if ! sudo nft add chain inet "${BR_NAME}_filter" forward '{ type filter hook forward priority 0; policy accept; }' 2>/dev/null; then true; fi

echo "$RULES_JSON" | jq -c '.[]' | while read -r rule; do
    DIRECTION=$(echo "$rule" | jq -r '.direction')
    ALLOW=$(echo "$rule" | jq -r '.allow')
    PROTOCOL=$(echo "$rule" | jq -r '.protocol')
    PORT=$(echo "$rule" | jq -r '.port')
    IP=$(echo "$rule" | jq -r '.ip')

    # allow / deny
    if [ "$ALLOW" = "true" ]; then
        ACTION="accept"
    else
        ACTION="drop"
    fi

    # direction → MAC match
    if [ "$DIRECTION" = "in" ]; then
        MAC_MATCH="ether daddr $MAC_ADDRESS"
    else
        MAC_MATCH="ether saddr $MAC_ADDRESS"
    fi

    # IP match (L3, post-bridge)
    IP_MATCH=""
    if [ "$IP" != "*" ] && [ "$IP" != "null" ]; then
        if [ "$DIRECTION" = "in" ]; then
            IP_MATCH="ip saddr $IP"
        else
            IP_MATCH="ip daddr $IP"
        fi
    fi

    PROTO_MATCH=""
    PORT_MATCH=""

    # protocol handling (tcp / udp only)
    if [ "$PROTOCOL" = "tcp" ] || [ "$PROTOCOL" = "udp" ]; then
        PROTO_MATCH="ip protocol $PROTOCOL"
        if [ -n "$PORT" ] && [ "$PORT" != "null" ]; then
            PORT_MATCH="$PROTOCOL dport $PORT"
        fi
    fi

    # protocol = all → no proto/port match
    if [ "$PROTOCOL" = "all" ]; then
        PROTO_MATCH=""
        PORT_MATCH=""
    fi

    if ! sudo nft add rule inet "${BR_NAME}_filter" forward \
        $MAC_MATCH $IP_MATCH $PROTO_MATCH $PORT_MATCH counter $ACTION comment \"$RULESET_NAME-$VM_NAME-$VNET_ID\"; then
        exitFailed
    fi
done

echo "MAC-based firewall rules applied!"
exit 0
