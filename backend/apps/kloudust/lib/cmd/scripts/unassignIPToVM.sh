VM_IP="{1}"
IP_TO_REMOVE="{2}"

function exitFailed() {
    echo Failed.
    exit 1
}

# printf "\n\removing $IP_TO_REMOVE->$VM_IP\n"

if ! sudo iptables -t nat -D PREROUTING -d $IP_TO_REMOVE -j DNAT --to-destination $VM_IP; then exitFailed; fi
if ! sudo iptables -t nat -D POSTROUTING -s $VM_IP -j SNAT --to-source $IP_TO_REMOVE; then exitFailed; fi

if [ -f "`which yum`" ]; then 
    iptables-save > /etc/sysconfig/iptables # Location for RHEL IPv4
    ip6tables-save > /etc/sysconfig/ip6tables # Location for RHEL IPv6
else
    iptables-save > /etc/iptables/rules.v4 # Location for Ubuntu IPv4
    ip6tables-save > /etc/iptables/rules.v6 # Location for Ubuntu IPv6
fi

printf "\n\nIP unassignment successful\n"
exit 0
