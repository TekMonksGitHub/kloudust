#!/bin/bash

# Params
# {1} The VM name
# {2} The IP to forward to the VM

VM_IP="{1}"
IP_TO_FORWARD="{2}"

function exitFailed() {
    echo Failed.
    exit 1
}

printf "\n\nForwarding $IP_TO_FORWARD->$VM_IP\n"

if ! sudo iptables -t nat -A PREROUTING -d $IP_TO_FORWARD -j DNAT --to-destination $VM_IP; then exitFailed; fi
if ! sudo iptables -t nat -A POSTROUTING -s $VM_IP -j SNAT --to-source $IP_TO_FORWARD; then exitFailed; fi

if [ -f "`which yum`" ]; then 
    iptables-save > /etc/sysconfig/iptables # Location for RHEL IPv4
    ip6tables-save > /etc/sysconfig/ip6tables # Location for RHEL IPv6
else
    iptables-save > /etc/iptables/rules.v4 # Location for Ubuntu IPv4
    ip6tables-save > /etc/iptables/rules.v6 # Location for Ubuntu IPv6
fi

printf "\n\nIP forwarding successful\n"
exit 0
