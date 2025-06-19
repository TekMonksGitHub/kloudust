#!/bin/bash

# Params
# {1} The VM name
# {2} The IP to unassign to the VM

VM_NAME="{1}"
IP_TO_UNASSIGN="{2}"

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed.
    exit 1
}

if ! virsh domifaddr $VM_NAME &> /dev/null; then
    echoerr No such VM.
    exitFailed; 
fi

VM_IP=`virsh domifaddr $VM_NAME | tr -s ' ' | grep ipv4 | cut -d" " -f5 | cut -d"/" -f1`
printf "\n\nVM IP is below\n$VM_IP\n"

printf "\n\nUnassigning $IP_TO_UNASSIGN to $VM_IP\n"
if ! iptables -D PREROUTING -t nat -d $IP_TO_UNASSIGN -j DNAT --to-destination $VM_IP; then exitFailed; fi
if ! iptables -D OUTPUT -t nat -d $IP_TO_UNASSIGN -j DNAT --to-destination $VM_IP; then exitFailed; fi
if ! iptables -D FORWARD -m state -d $VM_IP/24 --state NEW,RELATED,ESTABLISHED -j ACCEPT; then exitFailed; fi
if [ -f "`which yum`" ]; then 
    iptables-save > /etc/sysconfig/iptables # Location for RHEL IPv4
    ip6tables-save > /etc/sysconfig/ip6tables # Location for RHEL IPv6
else
    iptables-save > /etc/iptables/rules.v4 # Location for Ubuntu IPv4
    ip6tables-save > /etc/iptables/rules.v6 # Location for Ubuntu IPv6
fi

printf "\n\nIP unassignment successful\n"
exit 0