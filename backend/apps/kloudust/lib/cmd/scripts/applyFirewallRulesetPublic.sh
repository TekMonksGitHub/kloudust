#!/bin/bash

#########################################################################################################
# Applies internet firewall rules for a routed public IP
#
# Params:
#  1 - Firewall ruleset JSON
#  2 - Public IP
#  3 - VM Name for unique comment to grep handles later
#  4 - Ruleset name for unique comment to grep handles later
#
# (C) 2026 TekMonks. All rights reserved.
#########################################################################################################

RULES_JSON="{1}"
PUBLIC_IP="{2}"
VM_NAME="{3}"
RULESET_NAME="{4}"

IP_ADDRESS_DASHED=$(echo "$PUBLIC_IP" | tr '.' '_')

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed
    exit 1
}

if ! sudo nft add table inet "ip_${IP_ADDRESS_DASHED}_filter"; then exitFailed; fi
if ! sudo nft add chain inet "ip_${IP_ADDRESS_DASHED}_filter" forward '{ type filter hook forward priority 0; policy accept; }'; then exitFailed; fi
if ! sudo nft add rule inet "ip_${IP_ADDRESS_DASHED}_filter" forward ip daddr "$PUBLIC_IP" ct state established,related counter accept comment \"$RULESET_NAME-$VM_NAME-$IP_ADDRESS_DASHED\"; then exitFailed; fi

echo "$RULES_JSON" | jq -c '.[]' | while read -r rule; do
    DIRECTION=$(echo "$rule" | jq -r '.direction')
    ALLOW=$(echo "$rule" | jq -r '.allow')
    PROTOCOL=$(echo "$rule" | jq -r '.protocol')
    PORT=$(echo "$rule" | jq -r '.port')
    IP=$(echo "$rule" | jq -r '.ip')

    if [ "$ALLOW" = "true" ]; then
        ACTION="accept"
    else
        ACTION="drop"
    fi

    if [ "$DIRECTION" = "in" ]; then
        BASE_MATCH="ip daddr $PUBLIC_IP"

        if [ "$IP" != "*" ] && [ "$IP" != "null" ]; then
            IP_MATCH="$BASE_MATCH ip saddr $IP"
        else
            IP_MATCH="$BASE_MATCH"
        fi
    else
        BASE_MATCH="ip saddr $PUBLIC_IP"

        if [ "$IP" != "*" ] && [ "$IP" != "null" ]; then
            IP_MATCH="$BASE_MATCH ip daddr $IP"
        else
            IP_MATCH="$BASE_MATCH"
        fi
    fi

    PORT_MATCH=""

    if [ "$PROTOCOL" = "tcp" ] || [ "$PROTOCOL" = "udp" ]; then
        if [ -n "$PORT" ] && [ "$PORT" != "null" ]; then
            PORT_MATCH="$PROTOCOL dport $PORT"
        fi
    fi

    if [ "$PROTOCOL" = "all" ]; then
        PORT_MATCH=""
    fi

    if ! sudo nft add rule inet "ip_${IP_ADDRESS_DASHED}_filter" forward \
        $IP_MATCH $PORT_MATCH counter $ACTION comment \"$RULESET_NAME-$VM_NAME-$IP_ADDRESS_DASHED\"; then
        exitFailed
    fi
done



echo "IP-based firewall rules applied!"
exit 0