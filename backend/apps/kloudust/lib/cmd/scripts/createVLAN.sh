#!/bin/bash

VLAN_ID="{1}"
BRIDGE="br0"
VLAN_IF="$BRIDGE.$VLAN_ID"
VLAN_GATEWAY_IP="{2}"
VLAN_SUBNET="{3}"

function exitFailed() {
    echo "Failed"
    exit 1
}

PHYS_IF=$(ip route | awk '/default/ {print $5}')


# Check if VLAN_ID is a number
if ! [[ "$VLAN_ID" =~ ^[0-9]+$ ]]; then
    echo "Invalid VLAN ID: $VLAN_ID"
    exitFailed
fi

#Create bridge if it does not exist
if ! ip link show $BRIDGE > /dev/null 2>&1; then
    if ! ip link add name $BRIDGE type bridge; then exitFailed; fi
    if ! ip link set dev $BRIDGE up; then exitFailed; fi
fi

# Enable VLAN filtering on the bridge
if ! ip link set $BRIDGE type bridge vlan_filtering 1; then exitFailed; fi

# Create VLAN interface if it does not exist
if ! ip link show $VLAN_IF > /dev/null 2>&1; then
    if ! ip link add link $BRIDGE name $VLAN_IF type vlan id $VLAN_ID; then exitFailed; fi
    if ! ip link set dev $VLAN_IF up; then exitFailed; fi
fi

# Attach VLAN interface to the bridge
#if ! ip link set dev $VLAN_IF master $BRIDGE; then exitFailed; fi

# Ensure VLAN 1 is completely removed from the VLAN interface
bridge vlan del dev $VLAN_IF vid 1 2>/dev/null

# Configure VLAN filtering properly
#if ! bridge vlan add dev $VLAN_IF vid $VLAN_ID pvid untagged; then exitFailed; fi
if ! bridge vlan add dev $BRIDGE vid 2-4094 self; then exitFailed; fi
if ! bridge vlan del dev $BRIDGE vid 1 self; then exitFailed; fi

# Assign IP only if not already set
if ! ip addr show dev $VLAN_IF | grep -q "$VLAN_GATEWAY_IP"; then
    ip addr add "$VLAN_GATEWAY_IP/24" dev $VLAN_IF || exitFailed
fi

# Add iptables rules only if they do not exist
if ! iptables -t raw -C PREROUTING -s "$VLAN_SUBNET/24" -d "$VLAN_SUBNET/24" -j ACCEPT 2>/dev/null; then
    iptables -t raw -A PREROUTING -s "$VLAN_SUBNET/24" -d "$VLAN_SUBNET/24" -j ACCEPT
fi

if ! iptables -t raw -C PREROUTING -s "$VLAN_SUBNET/24" -d 10.0.0.0/8 -j DROP 2>/dev/null; then
    iptables -t raw -A PREROUTING -s "$VLAN_SUBNET/24" -d 10.0.0.0/8 -j DROP
fi

if ! iptables -t nat -C POSTROUTING -s "$VLAN_SUBNET/24" -o $PHYS_IF -j MASQUERADE 2>/dev/null; then
    iptables -t nat -A POSTROUTING -s "$VLAN_SUBNET/24" -o $PHYS_IF -j MASQUERADE
fi
echo "VLAN $VLAN_ID created successfully."
exit 0
