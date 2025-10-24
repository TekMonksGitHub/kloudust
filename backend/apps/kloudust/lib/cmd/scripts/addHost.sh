#!/bin/bash

# Params
# {1} The new password for this host for the ID which is logged in to run this script
# {2} The JSON out splitter
# {3} The new SSH port, defaults to 22 if not provided
# {4} The default host network, defaults to kddefault if not provided

NEW_PASSWORD="{1}"
JSONOUT_SPLITTER="{2}"
CHANGED_SSH_PORT={3}
NEW_SSH_PORT=${CHANGED_SSH_PORT:-22}
AGENT_PORT=$((NEW_SSH_PORT + 2))
DEFAULT_KD_NET_IN={4}
DEFAULT_KD_NET=${DEFAULT_KD_NET_IN:-kddefault}
DEFAULT_KD_NET_BRIDGE="${DEFAULT_KD_NET}_br"

function exitFailed() {
    echo Failed
    exit 1
}

function saveNFTables() {
    iptables-save > /tmp/iptable_rules.dump
    iptables-restore-translate -f /tmp/iptable_rules.dump > /tmp/nft_ruleset.nft
    nft flush ruleset
    nft -f /tmp/nft_ruleset.nft
    nft list ruleset > /etc/nftables.conf
}

function printConfig() {
    CORESPERCPU=`lscpu | grep Core | tr -s " " | cut -d":" -f2 | xargs`
    SOCKETS=`lscpu | grep Socket | tr -s " " | cut -d":" -f2 | xargs`
    CORES=`lscpu | grep CPU | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORMAKER=`lscpu | grep 'Vendor ID' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORNAME=`lscpu | grep 'Model name' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORMODEL=`lscpu | grep 'Model:' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORSPEED=`lscpu | grep 'CPU max MHz' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORARCH=`lscpu | grep 'Architecture:' | tr -s " " | cut -d":" -f2 | xargs`
    if [ "$PROCESSORARCH" == "x86_64" ]; then PROCESSORARCH=amd64; fi
    MEMORY=`free -b | grep "Mem:" | tr -s " " | cut -d" " -f2`
    ROOTDISKTOTAL=`df -B1  / | tail -n+2 | tr -s " " | cut -d" " -f2`
    NETSPEED=$((1073741824*$(networkctl status `networkctl | grep routable | grep ether | head -n1 | xargs | cut -d" " -f2` | grep -i speed | xargs | cut -d" " -f2 | cut -d"G" -f1)))
    OSRELEASE=$(printf "$(cat /etc/issue)" | head -n1 | xargs)

cat <<ENDJSON
$1
{
    "cores": "$CORESPERCPU",
    "memory": "$MEMORY",
    "disk": "$ROOTDISKTOTAL",
    "netspeed": "$NETSPEED",
    "processor": "$PROCESSORMAKER:$PROCESSORNAME:$PROCESSORMODEL:$PROCESSORSPEED",
    "processorarchitecture": "$PROCESSORARCH",
    "sockets": "$SOCKETS",
    "ostype": "$OSRELEASE",
    "sshport": "$NEW_SSH_PORT"
}
ENDJSON
}


printf "Updating the system\n"
if [ -f "`which yum`" ]; then 
    if ! sudo yum -y install epel-release; then exitFailed; fi
    if ! sudo yum -y update; then exitFailed; fi
else 
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y update; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y upgrade; then exitFailed; fi
fi


printf "Installing required software\n"
if [ -f "`which yum`" ]; then 
    if ! sudo yum -y install fail2ban; then exitFailed; fi
    if ! sudo yum -y install sshpass; then exitFailed; fi
    if ! sudo yum -y install qemu-kvm libvirt virt-top bridge-utils libguestfs-tools virt-install tuned genisoimage; then exitFailed; fi
    if ! sudo systemctl stop firewalld; then exitFailed; fi
    if ! sudo systemctl disable firewalld; then exitFailed; fi
    if ! sudo systemctl mask firewalld; then exitFailed; fi
    if ! sudo yum -y install iptables-services; then exitFailed; fi
else
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install fail2ban; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install sshpass; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install net-tools iptables-persistent; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install qemu-system-x86 libvirt-daemon-system libvirt-clients bridge-utils virtinst libosinfo-bin guestfs-tools tuned genisoimage; then exitFailed; fi
    # Remove snapd on Ububtu as it opens outgoing connections to the snap store
    # Also remove ufw as we will use nftables directly 
    snap list | egrep -v 'base$|snapd$|Notes$' | awk '{print $1}' | xargs -I{} sudo snap remove {} --purge && sudo apt purge -y snapd && rm -rf ~/snap
    sudo apt purge -y ufw
    apt -y autoremove && apt-mark hold snapd ufw
fi


printf "\n\nSecuring the system against SSH attacks\n"
if ! sudo cat <<EOF > /tmp/kdfail2ban.jail.local; then exitFailed; fi
[DEFAULT]
# Ban hosts for one hour:
bantime = 3600

# Override /etc/fail2ban/jail.d/00-firewalld.conf:
banaction = iptables-multiport

[sshd]
enabled = true
EOF
if ! sudo mv /tmp/kdfail2ban.jail.local /etc/fail2ban/jail.local; then exitFailed; fi
if ! sudo chown root:root /etc/fail2ban/jail.local; then exitFailed; fi
if ! sudo systemctl enable --now fail2ban; then exitFailed; fi


printf "\n\nEnabling hypervisor\n"
if ! sudo systemctl enable --now libvirtd; then exitFailed; fi
if ! sudo lsmod | grep -i kvm; then exitFailed; fi
if ! sudo systemctl enable --now tuned; then exitFailed; fi
if ! tuned-adm profile virtual-host; then exitFailed; fi


printf "\n\Disabling libvirt default networking\n"
sudo virsh net-destroy default
sudo virsh net-autostart --network default --disable
virsh net-undefine default


printf "\n\nCreating Kloudust Structures\n"
if ! sudo mkdir -p /kloudust/catalog/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/drivers/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/disks/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/metadata/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/snapshots/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/temp/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/recyclebin/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/system/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/etc/; then exitFailed; fi


printf "\n\nDownloading additional drivers\n"
if [ "`cat /kloudust/drivers/virtio-win.version`" != "virtio-win-0.1.240.iso" ]; then
    if ! sudo bash -c "curl -L https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/archive-virtio/virtio-win-0.1.240-1/virtio-win-0.1.240.iso > /kloudust/drivers/virtio-win.iso"; then exitFailed; fi
    if ! sudo bash -c  'echo "virtio-win-0.1.240.iso" > /kloudust/drivers/virtio-win.version'; then exitFailed; fi
fi;


printf "\n\nGiving permissions to Kloudust folders to KVM"
if [ -f "`which yum`" ]; then 
    if ! sudo chgrp -R qemu /kloudust/; then exitFailed; fi
else 
    if ! sudo chgrp -R libvirt /kloudust/; then exitFailed; fi
fi


printf "\n\nAdding the default Kloudust network"
if [ -n "$(sudo virsh net-list --all --name | grep -xF $DEFAULT_KD_NET)" ]; then
    if ! virsh net-destroy $DEFAULT_KD_NET; then exitFailed; fi
    if ! virsh net-undefine $DEFAULT_KD_NET; then exitFailed; fi
fi
cat > /kloudust/temp/$DEFAULT_KD_NET.xml <<EOF
<network>
  <name>$DEFAULT_KD_NET</name>
  <bridge name='$DEFAULT_KD_NET_BRIDGE' stp='off'/>
  <forward mode='nat'/>
  <ip address='192.168.0.1' netmask='255.255.0.0'>
    <dhcp>
      <range start='192.168.0.2' end='192.168.255.254'/>
    </dhcp>
  </ip>
</network>
EOF
if ! sudo virsh net-define /kloudust/temp/$DEFAULT_KD_NET.xml; then exitFailed; fi
if ! sudo virsh net-autostart $DEFAULT_KD_NET; then exitFailed; fi
if ! sudo virsh net-start $DEFAULT_KD_NET; then exitFailed; fi


printf "\n\nSetting up the host firewall, packet forwarding and ARP proxy support\n"
if ! sudo nft flush ruleset; then exitFailed; fi                                          # start with a new firewall
if ! sudo nft add table inet kdhostfirewall; then exitFailed; fi
if ! sudo nft add chain inet kdhostfirewall input { type filter hook input priority filter\; policy drop\; }; then exitFailed; fi
if ! sudo nft add rule inet kdhostfirewall input iif lo accept; then exitFailed; fi
if ! sudo nft add rule inet kdhostfirewall input iif $DEFAULT_KD_NET_BRIDGE accept; then exitFailed; fi
if ! sudo nft add rule inet kdhostfirewall input ct state established,related accept; then exitFailed; fi
if ! sudo nft add rule inet kdhostfirewall input tcp dport $NEW_SSH_PORT accept; then exitFailed; fi
if ! sudo nft add rule inet kdhostfirewall input tcp dport $AGENT_PORT accept; then exitFailed; fi          #Agent port
if ! sudo nft rule inet kdhostfirewall input tcp dport 8472 accept; then exitFailed; fi   # VxLAN port
if ! sudo nft list ruleset > /etc/nftables.conf; then exitFailed; fi 
if ! sudo systemctl enable --now nftables; then exitFailed; fi
if ! sudo echo 1 > /proc/sys/net/ipv4/ip_forward; then exitFailed; fi
if ! sudo printf "\nnet.ipv4.ip_forward=1\n" >> /etc/sysctl.conf; then exitFailed; fi
if ! sudo echo 1 > /proc/sys/net/ipv4/conf/all/proxy_arp; then exitFailed; fi
if ! sudo printf "\nnet.ipv4.conf.all.proxy_arp=1\n" >> /etc/sysctl.conf; then exitFailed; fi
if ! sudo sysctl -p /etc/sysctl.conf; then exitFailed; fi


printf "\n\nChanging password and SSH ports, Kloudust is taking over the host\n"
if [ -f "`which yum`" ]; then 
    if ! echo "$NEW_PASSWORD" | passwd --stdin `whoami` > /dev/null; then exitFailed; fi
else
    if ! echo `whoami`:"$NEW_PASSWORD" | sudo chpasswd > /dev/null; then exitFailed; fi
fi
if ! sed -i 's/^#\?[ ]*[Pp]ort[ ]\+[0-9]\+[ ]*$//g' /etc/ssh/sshd_config; then exitFailed; fi
if ! echo "Port $NEW_SSH_PORT" >> /etc/ssh/sshd_config; then exitFailed; fi
if ! touch ~/.hushlogin; then exitFailed; fi
if ! sudo systemctl daemon-reload; then exitFailed; fi
if [ -f "`which yum`" ]; then 
    if ! sudo systemctl restart sshd; then exitFailed; fi
else 
    if ! sudo systemctl restart ssh; then exitFailed; fi
fi

printf "\n\nHost initialization finished successfully, reboot needed\n"
printConfig $JSONOUT_SPLITTER
exit 0
