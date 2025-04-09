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

if ! [[ "$VLAN_ID" =~ ^[0-9]+$ ]]; then
    echo "Invalid VLAN ID: $VLAN_ID"
    exitFailed
fi

NETPLAN_FILE="/etc/netplan/01-${BRIDGE}.yaml"

if [[ ! -f "$NETPLAN_FILE" ]]; then
    cat <<EOF | sudo tee "$NETPLAN_FILE" > /dev/null
network:
  version: 2
  ethernets:
    $PHYS_IF: {}
  bridges:
    $BRIDGE:
      interfaces: []
      dhcp4: no
      dhcp6: no
  vlans:
    $VLAN_IF:
      id: $VLAN_ID
      link: $BRIDGE
      addresses:
        - "$VLAN_GATEWAY_IP/24"

EOF
else
    if ! grep -q "$VLAN_IF:" "$NETPLAN_FILE"; then
        sudo sed -i "/^  vlans:/a\ \ \ \ $VLAN_IF:\n\ \ \ \ \ \ id: $VLAN_ID\n\ \ \ \ \ \ link: $BRIDGE\n\ \ \ \ \ \ addresses:\n\ \ \ \ \ \ \ \ - \"$VLAN_GATEWAY_IP/24\"" "$NETPLAN_FILE"
    fi
fi

sudo netplan apply || exitFailed

if ! ip link show $BRIDGE > /dev/null 2>&1; then
    if ! ip link add name $BRIDGE type bridge; then exitFailed; fi
    if ! ip link set dev $BRIDGE up; then exitFailed; fi
fi

if ! ip link set $BRIDGE type bridge vlan_filtering 1; then exitFailed; fi

if ! ip link show $VLAN_IF > /dev/null 2>&1; then
    if ! ip link add link $BRIDGE name $VLAN_IF type vlan id $VLAN_ID; then exitFailed; fi
    if ! ip link set dev $VLAN_IF up; then exitFailed; fi
fi

bridge vlan del dev $VLAN_IF vid 1 2>/dev/null

if ! bridge vlan add dev $BRIDGE vid 2-4094 self; then exitFailed; fi
if ! bridge vlan del dev $BRIDGE vid 1 self; then exitFailed; fi

if ! ip addr show dev $VLAN_IF | grep -q "$VLAN_GATEWAY_IP"; then
    ip addr add "$VLAN_GATEWAY_IP/24" dev $VLAN_IF || exitFailed
fi

if ! iptables -t raw -C PREROUTING -s "$VLAN_SUBNET/24" -d "$VLAN_SUBNET/24" -j ACCEPT 2>/dev/null; then
    iptables -t raw -A PREROUTING -s "$VLAN_SUBNET/24" -d "$VLAN_SUBNET/24" -j ACCEPT
fi

if ! iptables -t raw -C PREROUTING -s "$VLAN_SUBNET/24" -d 10.0.0.0/8 -j DROP 2>/dev/null; then
    iptables -t raw -A PREROUTING -s "$VLAN_SUBNET/24" -d 10.0.0.0/8 -j DROP
fi

if ! iptables -t nat -C POSTROUTING -s "$VLAN_SUBNET/24" -o $PHYS_IF -j MASQUERADE 2>/dev/null; then
    iptables -t nat -A POSTROUTING -s "$VLAN_SUBNET/24" -o $PHYS_IF -j MASQUERADE
fi

if [ -f "$(which yum)" ]; then 
    iptables-save > /etc/sysconfig/iptables       
    ip6tables-save > /etc/sysconfig/ip6tables     
else
    # Ensure iptables-persistent is installed and directory exists
    if dpkg -s iptables-persistent 2>/dev/null | grep -q "deinstall ok config-files"; then
        apt-get update
        DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
    fi

    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4        
    ip6tables-save > /etc/iptables/rules.v6       
fi

echo "VLAN $VLAN_ID created successfully."
exit 0
