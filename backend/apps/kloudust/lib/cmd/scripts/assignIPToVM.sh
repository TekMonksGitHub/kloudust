#!/bin/bash

# Old script - not needed for VxLAN  architecture. This one assumes IP terminates on the host of the VM.
# Params
# {1} The VM name
# {2} The IP to forward to the VM

VM_NAME="{1}"
IP_TO_FORWARD="{2}"

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed.
    exit 1
}

if ! virsh domifaddr $VM_NAME &> /dev/null; then
    echoerr No such VM.
    exitFailed
fi

printf "\n\nVM IP is below\n"
VM_IP=`virsh domifaddr $VM_NAME | tr -s ' ' | grep ipv4 | cut -d" " -f5 | cut -d"/" -f1`
echo $VM_IP

printf "\n\nForwarding $IP_TO_FORWARD->$VM_IP\n"
if ! iptables -I PREROUTING -t nat -d $IP_TO_FORWARD -j DNAT --to-destination $VM_IP; then exitFailed; fi
if ! iptables -I OUTPUT -t nat -d $IP_TO_FORWARD -j DNAT --to-destination $VM_IP; then exitFailed; fi
if ! iptables -I FORWARD -m state -d $VM_IP/24 --state NEW,RELATED,ESTABLISHED -j ACCEPT; then exitFailed; fi
if [ -f "`which yum`" ]; then 
    iptables-save > /etc/sysconfig/iptables # Location for RHEL IPv4
    ip6tables-save > /etc/sysconfig/ip6tables # Location for RHEL IPv6
else
    iptables-save > /etc/iptables/rules.v4 # Location for Ubuntu IPv4
    ip6tables-save > /etc/iptables/rules.v6 # Location for Ubuntu IPv6
fi

printf "\n\nIP forwarding successful\n"
exit 0