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

# Find the vnet interface on the host that corresponds to this VM's MAC
# Host-side tap interface MAC has fe: prefix replacing the first octet
HOST_MAC=$(echo "$MAC_ADDRESS" | sed 's/^../fe/')
VNET_IFACE=$(ip -br link | awk -v mac="$HOST_MAC" 'tolower($3) == tolower(mac) {print $1}')
if [ -z "$VNET_IFACE" ]; then
    echoerr "Could not find host vnet interface for MAC $HOST_MAC"
    exitFailed
else
    echo "Found host vnet interface $VNET_IFACE for VM $VM_NAME."
fi

EGRESS_CHAIN="kd_$(echo "${RULESET_NAME}_${VM_NAME}_${VNET_ID}_e" | md5sum | cut -c1-24)_e"     # Max chain name length is 31 characters
INGRESS_CHAIN="kd_$(echo "${RULESET_NAME}_${VM_NAME}_${VNET_ID}_i" | md5sum | cut -c1-24)_i"    # Max chain name length is 31 characters

# Create netdev table if not exists
if ! sudo nft add table netdev kdhostfirewall_netdev 2>/dev/null; then true; fi

# Create egress chain (traffic FROM network/internet TO VM)
if ! sudo nft add chain netdev kdhostfirewall_netdev "$EGRESS_CHAIN" \
    { type filter hook egress device \"$VNET_IFACE\" priority 0\; policy accept\; comment \"$RULESET_NAME-$VM_NAME-$VNET_ID\"\; }; then
    exitFailed
fi

# Create ingress chain (traffic FROM VM TO the network/internet)
if ! sudo nft add chain netdev kdhostfirewall_netdev "$INGRESS_CHAIN" \
    { type filter hook ingress device \"$VNET_IFACE\" priority 0\; policy accept\; comment \"$RULESET_NAME-$VM_NAME-$VNET_ID\"\; }; then
    exitFailed
fi

# Allow ARP in both directions
if ! sudo nft add rule netdev kdhostfirewall_netdev "$EGRESS_CHAIN" \
    ether type arp accept comment \"$RULESET_NAME-$VM_NAME-$VNET_ID\"; then exitFailed; fi
if ! sudo nft add rule netdev kdhostfirewall_netdev "$INGRESS_CHAIN" \
    ether type arp accept comment \"$RULESET_NAME-$VM_NAME-$VNET_ID\"; then exitFailed; fi

# Apply rules from JSON
RULES_FAILED=0
while read -r rule; do
    DIRECTION=$(echo "$rule" | jq -r '.direction')
    ALLOW=$(echo "$rule" | jq -r '.allow')
    PROTOCOL=$(echo "$rule" | jq -r '.protocol')
    PORT=$(echo "$rule" | jq -r '.port')
    IP=$(echo "$rule" | jq -r '.ip')

    ACTION="drop"
    if [ "$ALLOW" = "true" ]; then ACTION="accept"; fi

    PORT_MATCH=""
    if { [ "$PROTOCOL" = "tcp" ] || [ "$PROTOCOL" = "udp" ]; } && [ -n "$PORT" ] && [ "$PORT" != "null" ]; then
        PORT_MATCH="$PROTOCOL dport $PORT"
    fi

    IP_MATCH=""
    if [ "$DIRECTION" = "in" ]; then
        # Inbound to VM = egress on vnet, source IP is the remote client
        CHAIN="$EGRESS_CHAIN"
        if [ "$IP" != "*" ] && [ "$IP" != "null" ]; then IP_MATCH="ip saddr $IP"; fi
    else
        # Outbound from VM = ingress on vnet, destination IP is the remote target
        CHAIN="$INGRESS_CHAIN"
        if [ "$IP" != "*" ] && [ "$IP" != "null" ]; then IP_MATCH="ip daddr $IP"; fi
    fi

    if ! sudo nft add rule netdev kdhostfirewall_netdev "$CHAIN" \
            $IP_MATCH $PORT_MATCH counter $ACTION comment \"$RULESET_NAME-$VM_NAME-$VNET_ID\"; then
        RULES_FAILED=1
        break
    fi
done < <(echo "$RULES_JSON" | jq -c '.[]')
if [ "$RULES_FAILED" = "1" ]; then 
    echoerr Rule failed -> "sudo nft add rule netdev kdhostfirewall_netdev \"$CHAIN\" $IP_MATCH $PORT_MATCH counter $ACTION comment \"$RULESET_NAME-$VM_NAME-$VNET_ID\""
    exitFailed
fi

# Persist
if ! sudo nft list ruleset | sudo tee /etc/nftables.conf > /dev/null; then exitFailed; fi 
if ! sudo systemctl enable nftables; then exitFailed; fi

echo "Netdev egress+ingress firewall rules applied for $VM_NAME, ruleset $RULESET_NAME and Vnet $VNET_ID"
exit 0