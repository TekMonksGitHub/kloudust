#!/bin/bash

# Params
# {1} The VM name
# {2} The IP to forward to the VM

VM_IP="{1}"
IP_TO_FORWARD="{2}"
HOST_GATEWAY="{3}"
function exitFailed() {
    echo Failed.
    exit 1
}

if ! ip a | grep "$IP_TO_FORWARD"; then
    printf "\n\nIP is not valid to forward\n"
    exitFailed "IP is not valid to forward"
fi


if ! sudo iptables -t nat -C PREROUTING -d "$IP_TO_FORWARD" -j DNAT --to-destination "$VM_IP" 2>/dev/null; then
    if ! sudo iptables -t nat -A PREROUTING -d "$IP_TO_FORWARD" -j DNAT --to-destination "$VM_IP"; then 
        exitFailed
    fi
fi

if ! sudo iptables -t nat -C POSTROUTING -d "$VM_IP" -j SNAT --to-source "$HOST_GATEWAY" 2>/dev/null; then
    if ! sudo iptables -t nat -A POSTROUTING -d "$VM_IP" -j SNAT --to-source "$HOST_GATEWAY"; then 
        exitFailed
    fi
fi

if [ -f "`which yum`" ]; then 
    iptables-save > /etc/sysconfig/iptables # Location for RHEL IPv4
    ip6tables-save > /etc/sysconfig/ip6tables # Location for RHEL IPv6
else
    iptables-save > /etc/iptables/rules.v4 # Location for Ubuntu IPv4
    ip6tables-save > /etc/iptables/rules.v6 # Location for Ubuntu IPv6
fi

printf "\n\nIP Assignment successful\n"
exit 0
