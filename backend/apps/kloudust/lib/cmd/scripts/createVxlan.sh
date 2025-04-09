#!/bin/bash

HOST1_IP="{1}"  
VXLAN_ID="{2}" 
LOCAL_IP="{3}"
VXLAN_IF="vxlan$VXLAN_ID"
BRIDGE_IF="br0"
VXLAN_PORT=4789  

function exitFailed() {
    echo "Failed: $1"
    exit 1
}

PHYS_IF=$(ip route | awk '/default/ {print $5}')

if ! ip a | grep "$LOCAL_IP"; then
    exitFailed "VM cannot create in this vlan"
fi

if ! sudo ufw status | grep -q "$VXLAN_PORT"; then
    sudo ufw allow $VXLAN_PORT
    echo "Port $VXLAN_PORT was not allowed. Now allowed in UFW."
fi

if [[ $EUID -ne 0 ]]; then
    exitFailed "This script must be run as root"
fi

if ! ip link show $BRIDGE_IF > /dev/null 2>&1; then
    if ! ip link add name $BRIDGE_IF type bridge; then exitFailed; fi
    if ! ip link set dev $BRIDGE_IF up; then exitFailed; fi
    if ! ip link set $BRIDGE_IF type bridge vlan_filtering 1; then exitFailed; fi
    if ! bridge vlan add dev $BRIDGE_IF vid 2-4094 self; then exitFailed; fi
fi

echo "Ensuring VXLAN interface $VXLAN_IF is configured in /etc/network/interfaces..."

IFACE_FILE="/etc/network/interfaces"
VXLAN_ENTRY_FOUND=$(grep -A 4 "iface $VXLAN_IF inet manual" "$IFACE_FILE" 2>/dev/null | grep -c "vxlan id $VXLAN_ID")

if [[ "$VXLAN_ENTRY_FOUND" -eq 0 ]]; then
    cat <<EOL >> "$IFACE_FILE"

auto $VXLAN_IF
iface $VXLAN_IF inet manual
    pre-up ip link add $VXLAN_IF type vxlan id $VXLAN_ID dev $PHYS_IF remote $HOST1_IP local $LOCAL_IP dstport $VXLAN_PORT
    up ip link set $VXLAN_IF up
    down ip link set $VXLAN_IF down
    post-down ip link del $VXLAN_IF

EOL
    echo "Added VXLAN interface $VXLAN_IF to $IFACE_FILE"
fi

ifup "$VXLAN_IF"

if ! ip link set "$VXLAN_IF" master "$BRIDGE_IF"; then
    exitFailed "Failed to attach $VXLAN_IF to bridge $BRIDGE_IF"
fi

if ! bridge vlan add dev "$VXLAN_IF" vid 2-4094; then
    exitFailed "Failed to assign VLAN $VXLAN_ID to VXLAN $VXLAN_IF"
fi

echo "VXLAN setup complete!"
