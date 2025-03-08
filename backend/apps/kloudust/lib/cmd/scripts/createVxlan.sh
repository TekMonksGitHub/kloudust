#!/bin/bash

# Set variables
HOST1_IP="{1}"  # Change this to Host 1's IP
VXLAN_ID="{2}"  # VXLAN ID (Same as VLAN 4)
VXLAN_IF="vxlan$VXLAN_ID"
BRIDGE_IF="br0"
VXLAN_PORT=4789  # VXLAN UDP Port

# Function to exit on failure
function exitFailed() {
    echo "Failed: $1"
    exit 1
}

if [[ $EUID -ne 0 ]]; then
    exitFailed "This script must be run as root"
fi

if ! ip link show $BRIDGE_IF > /dev/null 2>&1; then
    if ! ip link add name $BRIDGE_IF type bridge; then exitFailed; fi
    if ! ip link set dev $BRIDGE_IF up; then exitFailed; fi
    if ! ip link set $BRIDGE_IF type bridge vlan_filtering 1; then exitFailed; fi
    if ! bridge vlan add dev $BRIDGE_IF vid 2-4094 self; then exitFailed; fi
fi

echo "Creating VXLAN interface: $VXLAN_IF with ID $VXLAN_ID"

if ip link show "$VXLAN_IF" > /dev/null 2>&1; then
    echo "VXLAN interface $VXLAN_IF already exists, skipping creation."
else
    ip link add "$VXLAN_IF" type vxlan id "$VXLAN_ID" dev eth0 remote "$HOST1_IP" dstport "$VXLAN_PORT" || exitFailed "Failed to create VXLAN interface"
fi

ip link set "$VXLAN_IF" up || exitFailed "Failed to bring up VXLAN interface"

if ! ip link set "$VXLAN_IF" master "$BRIDGE_IF"; then
    exitFailed "Failed to attach $VXLAN_IF to bridge $BRIDGE_IF"
fi

if ! bridge vlan add dev "$VXLAN_IF" vid 2-4094; then
    exitFailed "Failed to assign VLAN $VXLAN_ID to VXLAN $VXLAN_IF"
fi

echo "VXLAN setup complete!"
