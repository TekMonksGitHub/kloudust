#!/bin/bash

NESTED_VM_HOSTNAME="{1}"
HOST_VM_IP="{2}"
PORT="{3}"

UFW_CHECK=$(ufw status | awk -v port="$PORT" '$1 ~ port && $2 == "ALLOW" && $NF == "Anywhere"')
if [ -z "$UFW_CHECK" ]; then
    echo "Port $PORT is not allowed. Allowing it through ufw..."
    sudo ufw allow "$PORT"
else
    echo "PORT $PORT is already allowed in ufw."
fi

# Resolve the IP address of the nested VM
NESTED_VM_IP=$(virsh net-dhcp-leases default | grep "$NESTED_VM_HOSTNAME" | awk '{print $5}' | cut -d '/' -f 1)
if [ -z "$NESTED_VM_IP" ]; then
    echo "Error: Unable to resolve IP for hostname '$NESTED_VM_HOSTNAME'."
    exit 1
fi


# Display details
echo "Host VM IP: $HOST_VM_IP"
echo "Nested VM IP: $NESTED_VM_IP"
echo "Setting up iptables rules to forward traffic from $HOST_VM_IP:$PORT to $NESTED_VM_IP:$PORT..."

# Apply iptables rules
# PREROUTING - Redirect incoming traffic to the nested VM
iptables -t nat -A PREROUTING -p tcp --destination "$HOST_VM_IP" --dport "$PORT" -j DNAT --to-destination "$NESTED_VM_IP:$PORT"
if ! iptables -t nat -C PREROUTING -p tcp --destination "$HOST_VM_IP" --dport "$PORT" -j DNAT --to-destination "$NESTED_VM_IP:$PORT" &> /dev/null; then
    echo "Error: Failed to apply PREROUTING rule."
    exit 1
fi

# POSTROUTING - Rewrite source IP for outgoing traffic from nested VM
iptables -t nat -A POSTROUTING -p tcp --destination "$NESTED_VM_IP" --dport "$PORT" -j SNAT --to-source "$HOST_VM_IP"
if ! iptables -t nat -C POSTROUTING -p tcp --destination "$NESTED_VM_IP" --dport "$PORT" -j SNAT --to-source "$HOST_VM_IP" &> /dev/null; then
    echo "Error: Failed to apply POSTROUTING rule."
    exit 1
fi

# FORWARD - Allow forwarding traffic to the nested VM
iptables -I FORWARD -m state -d "$NESTED_VM_IP" --state NEW,RELATED,ESTABLISHED -j ACCEPT
if ! iptables -C FORWARD -m state -d "$NESTED_VM_IP" --state NEW,RELATED,ESTABLISHED -j ACCEPT &> /dev/null; then
    echo "Error: Failed to apply FORWARD rule."
    exit 1
fi

echo "iptables rules successfully applied."
